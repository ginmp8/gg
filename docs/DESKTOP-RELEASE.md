# GG Desktop 0.3.0 — proposed release

**Status:** documentation proposal only. Package and desktop version metadata still declare 0.2.0. No v0.3.0 tag, installer publication, or GitHub Release is claimed.

## New capabilities

- Full-history annual contribution analytics, incremental local SQLite indexing and ICE-Git/1 contribution evidence.
- Experimental GG-Throughput/1 technical productivity proxy; traceable per-developer diff and commit samples.
- Compare any number of contributors side by side, with saved selections, filtered select-all, and user-created tags.
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

The consolidated candidate includes additive annual analytics and custom-tag
SQLite tables; these features already existed in the unpublished 0.2.0 candidate.
Back up the GG data directory before upgrading. No analyzed Git source repository is modified.
Scores are experimental technical signals rather than objective measures of productivity.
Unsigned installers can trigger platform warnings. Graphical testing and signing/notarization
should precede broad distribution.

See [desktop setup](DESKTOP.md) and [proposed 0.3.0 release notes](../releases/0.3.0.md).

Before publication, align every version manifest, run native packaging and
GUI smoke tests, review the full dependency audit and approve the release.
