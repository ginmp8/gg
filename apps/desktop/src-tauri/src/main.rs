#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct Backend(Mutex<Option<CommandChild>>);

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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let resource_dir = app.path().resource_dir()?;
            let server_script = resource_dir.join("api-dist").join("server.mjs");
            if !server_script.is_file() {
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "Packaged API is missing; run npm run desktop:prepare before building.",
                )));
            }

            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let port = select_local_port()?;
            let token = random_token()?;

            // Only Rust is allowed to spawn the sidecar. The webview receives
            // no shell capability and cannot choose a program or its arguments.
            let (mut events, child) = app
                .shell()
                .sidecar("node")?
                .arg(&server_script)
                .env("GG_ROOT", &resource_dir)
                .env("GG_DATA_DIR", &data_dir)
                .env("GG_API_PORT", port.to_string())
                .env("GG_DESKTOP_TOKEN", &token)
                .set_process_group(true)
                .kill_on_drop(true)
                .spawn()?;
            tauri::async_runtime::spawn(async move {
                while events.recv().await.is_some() {
                    // Drain output; never forward process diagnostics or tokens
                    // into webview events or third-party logs.
                }
            });
            app.manage(Backend(Mutex::new(Some(child))));

            let started = Instant::now();
            while !backend_ready(port, &token) && started.elapsed() < Duration::from_secs(20) {
                thread::sleep(Duration::from_millis(120));
            }
            if !backend_ready(port, &token) {
                if let Ok(mut state) = app.state::<Backend>().0.lock() {
                    if let Some(child) = state.take() {
                        let _ = child.kill();
                    }
                }
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "Bundled API did not become healthy within 20 seconds.",
                )));
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
        })
        .build(tauri::generate_context!())
        .expect("GG Analytics Desktop failed to initialize");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Ok(mut state) = handle.state::<Backend>().0.lock() {
                if let Some(child) = state.take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
