# GG Desktop 0.2.0 — release candidate

**Status:** candidate on development only. No v0.2.0 tag, installer publication or GitHub Release has been created.

## New capabilities

- Full-history annual contribution analytics, incremental local SQLite indexing and ICE-Git/1 contribution evidence.
- Experimental GG-Throughput/1 technical productivity proxy; traceable per-developer diff and commit samples.
- Compare two to four selected contributors side by side with user-created tag filtering.
- Project-wide branch and PR inventories with repository source columns and pagination.
- User-defined custom tags and optional groups, assignable to contributors, repos, branches and pull requests.
- Dedicated Settings tab for project management, refresh, saved branch views, labels and appearance.
- Light/dark/system theme, safe deletion of app-owned project caches and local-first GitHub discovery.

## Packaging

- Windows x64 NSIS installer, Linux x64 Debian package, macOS Apple Silicon DMG through the existing Tauri 2 workflow.
- Bundled Node.js 24, Fastify API and platform-native SQLite binding.
- Loopback-only desktop API with per-process bearer token. No automatic updater, telemetry or npm publication.
- Git remains mandatory; GitHub CLI is optional for GitHub metadata.

## Upgrade and validation

Version 0.2.0 adds additive project_tags and project_tag_assignments SQLite tables.
Back up the GG data directory before upgrading. No analyzed Git source repository is modified.
Scores are experimental technical signals rather than objective measures of productivity.
Unsigned installers can trigger platform warnings. Graphical testing and signing/notarization
should precede broad distribution.

See [desktop setup](DESKTOP.md) and [version 0.2.0 release notes](../releases/0.2.0.md).
