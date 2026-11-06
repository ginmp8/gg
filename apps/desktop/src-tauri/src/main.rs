#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct Backend(Mutex<Option<CommandChild>>);

const MAX_RECENT_CHARS: usize = 2_048;
const MAX_LOG_BYTES: usize = 64 * 1024;

#[derive(Default)]
struct StartupDiagnostics {
    stderr_tail: String,
    stdout_tail: String,
    exit_code: Option<Option<i32>>,
    event_error: Option<String>,
    log_error: Option<String>,
    logged_bytes: usize,
    ready: bool,
}

// Rust's Windows paths may use the verbatim (\\?\) form. Node's ESM entry
// and native bindings expect conventional drive/UNC paths in common installs.
// Keep long verbatim paths intact instead of breaking MAX_PATH handling.
fn node_compatible_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    if let Some(value) = path.to_str() {
        let standard = if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            Some(format!(r"\\{unc}"))
        } else if let Some(drive) = value.strip_prefix(r"\\?\") {
            if drive.as_bytes().get(1) == Some(&b':')
                && drive.as_bytes().get(2) == Some(&b'\\')
            {
                Some(drive.to_owned())
            } else {
                None
            }
        } else {
            None
        };
        if let Some(standard) = standard {
            if standard.encode_utf16().count() < 248 {
                return PathBuf::from(standard);
            }
        }
    }
    path.to_path_buf()
}

fn redact_output(output: &str, token: &str) -> String {
    output
        .replace(token, "[redacted]")
        .lines()
        .map(|line| {
            if line.to_ascii_lowercase().contains("authorization:") {
                "[redacted authorization header]".to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn push_tail(tail: &mut String, text: &str) {
    tail.push_str(text);
    tail.push('\n');
    let count = tail.chars().count();
    if count > MAX_RECENT_CHARS {
        *tail = tail.chars().skip(count - MAX_RECENT_CHARS).collect();
    }
}

fn append_log(path: &Path, entry: &str) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    writeln!(file, "{entry}")
}

fn initialize_log(path: &Path) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    writeln!(file, "GG Analytics Desktop startup; unix_timestamp={started_at}")
}

fn record_log(
    diagnostics: &mut StartupDiagnostics,
    path: &Path,
    stream: &str,
    text: &str,
    essential: bool,
) {
    let short: String = text.chars().take(MAX_RECENT_CHARS).collect();
    let entry = format!("[{stream}] {short}");
    if !essential && diagnostics.logged_bytes + entry.len() + 1 > MAX_LOG_BYTES {
        return;
    }
    match append_log(path, &entry) {
        Ok(()) => diagnostics.logged_bytes += entry.len() + 1,
        Err(error) => diagnostics.log_error = Some(error.to_string()),
    }
}

fn record_sidecar_event(
    diagnostics: &mut StartupDiagnostics,
    event: CommandEvent,
    log_path: &Path,
    token: &str,
) {
    match event {
        CommandEvent::Stderr(bytes) => {
            let message = redact_output(&String::from_utf8_lossy(&bytes), token);
            push_tail(&mut diagnostics.stderr_tail, &message);
            record_log(diagnostics, log_path, "stderr", &message, false);
        }
        CommandEvent::Stdout(bytes) if !diagnostics.ready => {
            // Fastify/Pino may send startup errors to stdout, not stderr.
            let message = redact_output(&String::from_utf8_lossy(&bytes), token);
            push_tail(&mut diagnostics.stdout_tail, &message);
            record_log(diagnostics, log_path, "startup stdout", &message, false);
        }
        CommandEvent::Error(error) => {
            let message = redact_output(&error, token);
            diagnostics.event_error = Some(message.clone());
            record_log(diagnostics, log_path, "sidecar event error", &message, true);
        }
        CommandEvent::Terminated(payload) => {
            diagnostics.exit_code = Some(payload.code);
            let status = format!("exit code={:?}; signal={:?}", payload.code, payload.signal);
            record_log(diagnostics, log_path, "node terminated", &status, true);
        }
        _ => {}
    }
}

fn startup_failure(log_path: &Path, message: &str) -> io::Error {
    let _ = append_log(log_path, &format!("[startup failure] {message}"));
    io::Error::other(format!(
        "{message}\n\nDiagnostic log: {}",
        node_compatible_path(log_path).display()
    ))
}

fn backend_failure(diagnostics: &StartupDiagnostics, log_path: &Path) -> String {
    let reason = match diagnostics.exit_code {
        Some(Some(code)) => format!("Node exited before the API became ready (exit code {code})."),
        Some(None) => "Node terminated without a numeric exit code.".to_string(),
        None => diagnostics.event_error.clone().unwrap_or_else(|| {
            "Bundled API did not become healthy within 20 seconds.".to_string()
        }),
    };
    let output = if !diagnostics.stderr_tail.trim().is_empty() {
        diagnostics.stderr_tail.trim()
    } else if !diagnostics.stdout_tail.trim().is_empty() {
        diagnostics.stdout_tail.trim()
    } else {
        "No backend output was captured."
    };
    let log_error = diagnostics
        .log_error
        .as_ref()
        .map(|error| format!("\nCould not write all diagnostics: {error}"))
        .unwrap_or_default();
    format!(
        "{reason}\n\nRecent backend output:\n{output}\n\nDiagnostic log: {}{log_error}",
        node_compatible_path(log_path).display()
    )
}

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn MessageBoxW(
        owner: *mut std::ffi::c_void,
        message: *const u16,
        title: *const u16,
        kind: u32,
    ) -> i32;
}

#[cfg(windows)]
fn show_startup_error(message: &str) {
    let wide = |value: &str| -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    };
    let text = wide(message);
    let title = wide("GG Analytics - Startup error");
    // The release build uses windows_subsystem="windows", so stderr and
    // panics are otherwise invisible. A native error box needs no webview.
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            0x0000_0010, // MB_ICONERROR | MB_OK
        );
    }
}

#[cfg(not(windows))]
fn show_startup_error(message: &str) {
    eprintln!("{message}");
}


fn random_token() -> Result<String, Box<dyn std::error::Error>> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| std::io::Error::other(error.to_string()))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn select_local_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn backend_ready(port: u16, token: &str) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = [0_u8; 128];
    matches!(stream.read(&mut response), Ok(size) if size >= 12 && response[..size].starts_with(b"HTTP/1.1 200"))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let built = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Tauri runs setup during App::run(), where Err would otherwise
            // panic outside the Builder::build() error handler.
            let startup = (|| -> Result<(), Box<dyn std::error::Error>> {
            let resource_dir = app.path().resource_dir()?;
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let log_path = data_dir.join("logs").join("desktop-startup.log");
            fs::create_dir_all(log_path.parent().expect("log path has a parent"))?;
            initialize_log(&log_path)?;

            let server_script = resource_dir.join("api-dist").join("server.mjs");
            if !server_script.is_file() {
                return Err(Box::new(startup_failure(
                    &log_path,
                    &format!(
                        "Packaged API was not found at {}. Reinstall the desktop application.",
                        node_compatible_path(&server_script).display()
                    ),
                )));
            }
            let port = select_local_port()?;
            let token = random_token()?;
            let diagnostics = Arc::new(Mutex::new(StartupDiagnostics::default()));

            // The resource and data directories can be Windows verbatim paths.
            // Convert only short conventional drive/UNC paths passed to Node.
            // Do not alter the paths Rust uses for its own filesystem checks.
            let (mut events, child) = app
                .shell()
                .sidecar("node")
                .map_err(|error| startup_failure(&log_path, &format!("Node sidecar lookup failed: {error}")))?
                .arg(node_compatible_path(&server_script))
                .env("GG_ROOT", node_compatible_path(&resource_dir))
                .env("GG_DATA_DIR", node_compatible_path(&data_dir))
                .env("GG_API_PORT", port.to_string())
                .env("GG_DESKTOP_TOKEN", &token)
                .set_process_group(true)
                .kill_on_drop(true)
                .spawn()
                .map_err(|error| startup_failure(&log_path, &format!("Failed to launch Node: {error}")))?;

            let event_diagnostics = Arc::clone(&diagnostics);
            let event_log_path = log_path.clone();
            let redaction_token = token.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    if let Ok(mut state) = event_diagnostics.lock() {
                        record_sidecar_event(&mut state, event, &event_log_path, &redaction_token);
                    }
                }
            });
            app.manage(Backend(Mutex::new(Some(child))));

            let started = Instant::now();
            let mut ready = false;
            while started.elapsed() < Duration::from_secs(20) {
                if backend_ready(port, &token) {
                    ready = true;
                    break;
                }
                // A crashing Node process should fail immediately, not hang
                // until the full health timeout with its exit status discarded.
                let stopped = diagnostics
                    .lock()
                    .map(|state| state.exit_code.is_some() || state.event_error.is_some())
                    .unwrap_or(false);
                if stopped {
                    break;
                }
                thread::sleep(Duration::from_millis(120));
            }
            if !ready {
                let details = diagnostics
                    .lock()
                    .map(|state| backend_failure(&state, &log_path))
                    .unwrap_or_else(|_| "Backend diagnostics lock was unavailable.".to_string());
                if let Ok(mut state) = app.state::<Backend>().0.lock() {
                    if let Some(child) = state.take() {
                        let _ = child.kill();
                    }
                }
                return Err(Box::new(startup_failure(&log_path, &details)));
            }
            if let Ok(mut state) = diagnostics.lock() {
                state.ready = true;
            }

            // Static Next.js client only. No arbitrary webview shell access.
            // Check the document origin so the token never reaches remote pages.
            let connection = serde_json::json!({
                "apiBase": format!("http://127.0.0.1:{port}"),
                "token": token
            });
            let mut trusted_origins = vec![
                "tauri://localhost",
                "http://tauri.localhost",
                "https://tauri.localhost",
            ];
            if cfg!(debug_assertions) {
                trusted_origins.push("http://127.0.0.1:4444");
            }
            let origins_json = serde_json::to_string(&trusted_origins)?;
            let init_script = format!(
                "if ({}.includes(window.location.origin)) {{ Object.defineProperty(window, '__GG_DESKTOP__', {{ value: Object.freeze({}), writable: false, configurable: false }}); }}",
                origins_json, connection
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("GG Analytics")
                .inner_size(1280.0, 820.0)
                .min_inner_size(800.0, 600.0)
                .initialization_script(init_script)
                .build()?;
            Ok(())
            })();
            if let Err(error) = &startup {
                show_startup_error(&format!("GG Analytics could not start:\n\n{error}"));
            }
            startup
        })
        .build(tauri::generate_context!());

    let app = match built {
        Ok(app) => app,
        Err(error) => {
            show_startup_error(&format!("GG Analytics could not start:\n\n{error}"));
            return Err(Box::new(error));
        }
    };
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Ok(mut state) = handle.state::<Backend>().0.lock() {
                if let Some(child) = state.take() {
                    let _ = child.kill();
                }
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_shell::process::TerminatedPayload;

    #[test]
    fn records_stderr_and_exit_code_without_exposing_the_session_token() {
        let file = std::env::temp_dir().join(format!(
            "gg-desktop-startup-test-{}-{}.log",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        initialize_log(&file).unwrap();
        let token = "a".repeat(64);
        let mut state = StartupDiagnostics::default();
        record_sidecar_event(
            &mut state,
            CommandEvent::Stderr(format!("Cannot load module; token={token}").into_bytes()),
            &file,
            &token,
        );
        record_sidecar_event(
            &mut state,
            CommandEvent::Terminated(TerminatedPayload { code: Some(17), signal: None }),
            &file,
            &token,
        );
        let log = fs::read_to_string(&file).unwrap();
        let _ = fs::remove_file(&file);
        assert!(log.contains("[stderr] Cannot load module"));
        assert!(log.contains("exit code=Some(17)"));
        assert!(!log.contains(&token));
        let message = backend_failure(&state, Path::new("desktop-startup.log"));
        assert!(message.contains("exit code 17"));
        assert!(message.contains("Cannot load module"));
        assert!(!message.contains(&token));
    }

    #[test]
    fn diagnostics_remain_bounded_and_redact_auth_headers() {
        let mut tail = String::new();
        push_tail(&mut tail, &"X".repeat(10_000));
        assert!(tail.chars().count() <= MAX_RECENT_CHARS);
        assert_eq!(
            redact_output("Authorization: Bearer secret\nfailure", "unused"),
            "[redacted authorization header]\nfailure"
        );
    }

    #[cfg(windows)]
    #[test]
    fn converts_short_windows_verbatim_drive_and_unc_paths() {
        assert_eq!(
            node_compatible_path(Path::new(r"\\?\C:\Program Files\GG Analytics\api-dist\server.mjs")),
            PathBuf::from(r"C:\Program Files\GG Analytics\api-dist\server.mjs")
        );
        assert_eq!(
            node_compatible_path(Path::new(r"\\?\UNC\server\share\GG Analytics\server.mjs")),
            PathBuf::from(r"\\server\share\GG Analytics\server.mjs")
        );
        assert_eq!(
            node_compatible_path(Path::new(r"C:\GG Analytics\server.mjs")),
            PathBuf::from(r"C:\GG Analytics\server.mjs")
        );
    }

    #[cfg(windows)]
    #[test]
    fn node_starts_a_normalized_verbatim_script_with_spaces_in_the_path() {
        let dir = std::env::temp_dir().join(format!(
            "GG Analytics path test {} {}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("startup-test.mjs");
        fs::write(&script, "console.log('GG startup path OK');\n").unwrap();
        let script_verbatim = PathBuf::from(format!(r"\\?\{}", script.display()));
        let output = std::process::Command::new("node")
            .arg(node_compatible_path(&script_verbatim))
            .output()
            .unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        assert!(String::from_utf8_lossy(&output.stdout).contains("GG startup path OK"));
    }
}
