# Changelog

## [0.3.0] — Proposed (not tagged or published)

### Consolidated candidate
- GG Analytics branding and reproducible production screenshots without
  Next.js development overlays.
- Full-history annual analytics with ICE-Git/1 and GG-Throughput/1 evidence,
  unlimited contributor comparison, user-defined tags, read-only local JSON
  CLI, GitHub discovery, network controls and optional Tauri desktop builds.
- Consolidated changes promoted into `main` via [PR #3](https://github.com/ginmp8/gg/pull/3).

### Release preparation
- Version-specific [0.3.0 release notes](releases/0.3.0.md) describe
  scope, compatibility and outstanding validation.
- This summary is **cumulative**. The [0.2.0 development candidate](releases/0.2.0.md)
  already described much of this functionality and was never published.
- Version metadata, lockfile, Rust/Tauri manifests, final CI and native
  package validation remain prerequisites before any v0.3.0 tag.

## [0.2.0] — Unreleased (development candidate)

### Added
- Full-history incremental annual engineering contribution and ICE-Git/1
  evidence score with GG-Throughput/1 technical productivity proxy.
- Selectable side-by-side comparison with no fixed contributor limit,
  including saved selection, select-all, annual fields, score components,
  twelve-month evidence and JSON export.
- Project-specific free-form tags with a searchable multi-target picker,
  atomic assignment and annual-only contributor support.
- Consolidated project-wide branch and PR views with pagination.
- Dedicated Settings tab separating management from analytics.
- Read-only local JSON CLI for generic harnesses, with a dataset catalog,
  bounded raw SQLite pages and per-project analytics.
- Tauri desktop option, light/dark themes, GitHub discovery and safe cache cleanup.

### Changed
- GitHub read-only metadata now enabled by default (offline override retained).
- Version metadata aligned to 0.2.0 without creating a release tag.

### Compatibility
- Additive local SQLite tables for tags; original metrics remain.
- No Git writes to analyzed repositories.

See [0.2.0 release candidate](releases/0.2.0.md).

## [0.1.0] — Original Gita source baseline

- Initial local-first Git analytics dashboard with multi-repository projects,
  contributor/activity/file analytics, branch views and optional GitHub metadata.
- Source baseline: [main at 465d8b9](https://github.com/ginmp8/gita/commit/465d8b984c1e17e6a5763b60b527cfad5831973f).
- Version 0.1.0 appears in the source package metadata; no v0.1.0 Git tag
  or published GitHub Release was found.

See [0.1.0 historical source notes](releases/0.1.0.md).
