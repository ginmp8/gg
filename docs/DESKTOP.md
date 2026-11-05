# Gita Desktop (Tauri 2)

## Intent and architecture

Gita remains a **local-first analytics application**. Desktop packaging is an
optional delivery adapter, not a rewrite of Git analysis or SQLite:

```text
Tauri 2 native window (Rust, src-tauri)
  ├── Static Next.js export (existing React dashboard)
  └── Node.js 24 sidecar (bundled runtime)
        ├── Bundled Fastify API (esbuild)
        ├── Native better-sqlite3 driver (per-platform)
        ├── Git Engine (system git executable)
        └── User AppData: gita.sqlite, Git mirrors and runtime files
```

The Rust host selects a free loopback port, generates 32 random bytes with
the OS CSPRNG, launches a private Node sidecar and waits for an authenticated
health response before showing the window. Only Rust may spawn shell processes
through the Tauri shell plugin. The window has no shell capability.

The window's document-start script receives the local API URL and token on
trusted packaged Tauri origins only. The development origin is allowed
solely in debug builds and never receives a desktop session token in release
builds. Every API request presents that bearer token;
cross-origin access alone is insufficient. Sidecar process groups are
terminated when the native window exits.

The existing web application and `npm run dev` workflow are preserved.

## Supported targets in CI

| Target | Workflow runner | Installer |
| --- | --- | --- |
| Windows x64 | `windows-2022` | NSIS `.exe` |
| Linux x64 | `ubuntu-22.04` | `.deb` |
| macOS Apple Silicon | `macos-15` | `.dmg` |

These targets use native Node.js and better-sqlite3 binaries. Builds are
**not cross-compiled**. Node.js is bundled; Git must still be installed and
available on the user's PATH. The GitHub CLI is optional for PR metadata.
Unsigned Windows and macOS packages may show OS trust warnings; do not bypass
security software. Production distribution should be code-signed/notarized
before broad use.

## Build from source

Install Node.js **24**, npm, Git, a compatible Rust toolchain and the
platform-specific [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).
The official npm Tauri CLI used by CI is pinned to `2.12.4`, as in
PandaCode's reproducible desktop builds. It is installed by `npm ci`;
no global `cargo install` and no npm publication are required.

From the repository root:

```bash
npm ci
npm run desktop:check
npm run lint
npm run typecheck
npm run test
# Static Next.js export (keep normal server-side web build unchanged)
GITA_DESKTOP=1 npm --workspace @gita/web run build
npm run desktop:prepare
node scripts/desktop/smoke.mjs
cd apps/desktop
node ../../node_modules/@tauri-apps/cli/tauri.js icon ../../assets/gita-desktop-icon.svg
node ../../node_modules/@tauri-apps/cli/tauri.js build
```

On PowerShell, set `$env:GITA_DESKTOP="1"` before the web build and
`Remove-Item Env:GITA_DESKTOP` afterward. The `desktop:prepare` script
copies the Node executable and the native SQLite binding for the current
host. Its generated resources and icons are Git-ignored.

To develop the desktop window, run `npm run dev` from the root in a
separate terminal, then `node ../../node_modules/@tauri-apps/cli/tauri.js dev` from `apps/desktop` after
the native sidecar and icons have been prepared. The local web server stays
available for browser development.

### Windows output

The NSIS installer is created below
`apps/desktop/src-tauri/target/release/bundle/nsis/`. The application can
launch without an externally installed Node.js runtime. Git remains
required for repository analysis.

## Runtime data and compatibility

- App-owned data is placed in the Tauri application data directory.
  Existing browser `.gita/gita.sqlite` is **not** automatically moved.
- Remote repositories remain Git bare mirrors. Local-path and SSH/HTTPS
  sources work as before.
- No PostgreSQL migration or analytics schema change is introduced.
- The native sidecar uses a random port instead of the default `4443`.
- The default web API still binds to `127.0.0.1:4443` when run without
  desktop-specific variables.

## Security and limitations

- Packaged desktop API enforces a 256-bit local bearer token and a
  loopback-only listener; normal web API remains deliberately local-only
  with no user authentication. Never publish the web API without
  adding an authentication and authorization layer.
- Credentials should not be put into Git URLs. Use SSH agents or Git
  credential helpers. Tokens in URLs require the existing explicit
  `GITA_ALLOW_URL_CREDENTIALS=1` compatibility opt-in.
- The desktop HTML is self-hosted within Tauri. The CSP permits inline
  Next.js hydration scripts but disallows third-party frames and remote
  script sources; untrusted HTML must never be inserted without
  sanitization.
- The session token is accessible to the trusted webview (so an XSS
  in that origin could still use it). Keep webview origins restricted.
- Node sidecar files are shipped as resources and are readable by the
  local user, not encrypted. Only OS permissions protect app data.
- No automatic updater, autostart, telemetry, signing certificates, or
  distribution channels beyond workflow artifacts and opt-in GitHub
  Release publication are configured.
- Platform installer smoke tests cannot prove the full GUI behavior.
  CI verifies frontend build, native binary packaging, and API startup;
  manual graphical tests should follow before release.

## Troubleshooting

- **Missing native binding**: run `npm ci` with Node 24 on the target
  platform, then `npm run desktop:prepare`.
- **Git not found**: install Git and ensure it is available on PATH.
- **Startup health timeout**: confirm the Node sidecar and SQLite binding
  were bundled for the same target triple, and that user AppData is writable.
- **Browser UI works, desktop cannot access API**: do not remove the
  session-token guard; verify desktop URL injection, CORS and CSP.
- **macOS package cannot be opened**: a signed/notarized distribution is
  recommended; unsigned builds are intended for development only.

## Reference

The desktop packaging approach follows the small and isolated Tauri shell
boundary used in PandaCode, without importing the agent system or rewriting
Gita's established Node.js analytics engine. Primary implementation guides:
[Tauri sidecars](https://v2.tauri.app/develop/sidecar/),
[Tauri Next.js static export](https://v2.tauri.app/start/frontend/nextjs/).
