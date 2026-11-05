# Gita Desktop 0.1.0

Initial Tauri 2 desktop packaging for Gita's existing analytics dashboard.

- Windows x64 NSIS executable, Linux x64 Debian package, macOS Apple Silicon DMG.
- Bundled Node.js 24 runtime, Fastify API and native SQLite driver.
- Existing Git commit/contributor analytics and dashboard preserved.
- Desktop API secured by per-process bearer token, loopback binding,
  restricted Host/CORS policy and native-only sidecar launch.
- No npm publication, automatic updater, or telemetry.

Git must be installed to analyze repositories. GitHub CLI is optional.
Unsigned development builds may trigger platform security warnings.

See [Desktop setup and limitations](docs/DESKTOP.md).
