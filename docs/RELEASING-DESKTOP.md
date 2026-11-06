# Desktop release and CI

The workflow `.github/workflows/desktop.yml` verifies the existing app
before building a Windows x64 `.exe`, Linux x64 `.deb` and macOS arm64
`.dmg`. Every build is an artifact, not automatically a GitHub Release.

## Events and authority

- **Pull requests:** run tests and packaging jobs; upload workflow artifacts.
- **Push to development:** run checks and packaging; upload artifacts.
- **Push of vX.Y.Z tag:** run checks and packaging; upload artifacts.
- **Manual workflow dispatch:** run checks and packaging; optional GitHub
  Release publication **only** when `publish=true` on an existing version
  tag matching `apps/desktop/src-tauri/tauri.conf.json`.
- No npm publication, updater endpoints, GitHub release automation from
  arbitrary branch pushes, or automatic branch merging.

Examples using GitHub CLI:

```bash
# Build the three installers without publishing a GitHub Release
gh workflow run desktop.yml --repo ginmp8/gg --ref development -f publish=false

# Explicit release after approval and version/tag review
# git tag -a v0.1.0 -m "GG Desktop v0.1.0"
# git push origin v0.1.0
gh workflow run desktop.yml --repo ginmp8/gg --ref v0.1.0 -f publish=true
```

Do not create a release tag until the build succeeds and the version is
confirmed. A GitHub Release requires all three platform artifacts to be
present; missing artifacts fail publication. Actions permissions are read-only
for every job except the explicitly gated release job.

## Validation gates

1. `npm ci`, `desktop:check`, lint, typecheck, existing tests, web build,
   and production-dependency audit.
2. Platform-native `npm ci`, static export, Node sidecar preparation,
   full Fastify/SQLite startup smoke test, and Tauri packaging.
3. Archive all final bundle files as GitHub Actions artifacts. Installer
   jobs run independently of the verification job; **release publication still
   requires both verification and packaging to pass**.
4. Before releasing publicly, test GUI navigation, importing local and
   remote repositories, offline behavior, data persistence, and the
   installation/uninstallation workflow on each target OS.
5. Confirm signing/notarization policy and test unsigned installer warnings.

Known gap: the new Rust package has no committed `Cargo.lock` yet; the
first native Cargo build will generate it. Review and commit that lockfile
before a production-grade release to freeze transitive dependencies.

The production dependency audit was remediated on the feature branch;
see [Security hardening](SECURITY-HARDENING.md). The development-inclusive
inventory still contains outstanding advisories, which need separate
triage before public distribution.

GitHub enables manual workflow dispatch only after the workflow file
is available on the repository default branch. Tag push builds are
available from the tagged commit's workflow file.

## Recovery

A failed or cancelled build must not advance any branch, move tags or
publish a Release. Review the failed job's logs, fix only the relevant
change, rerun the same checks, and keep generated binaries out of Git.
