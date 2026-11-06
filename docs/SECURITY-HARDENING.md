# Development branch security hardening

## Scope and fork policy

- Baseline: `ginmp8/gg:main`, commit `465d8b984c1e17e6a5763b60b527cfad5831973f`.
- Harden `development` only; preserve `main` and all existing features.
- Prefer small compatible patches, new tests and explicit risky-behavior
  opt-ins. No automatic merge, tag, release or deployment.
- Do not remove Git analysis, SSH/HTTPS/local repositories, GitHub PR
  enrichment, branch filtering or the dashboard.

## Changes

1. **Next.js security maintenance** — Update the lockfile from `15.5.19`
   to `15.5.29` within the existing Next.js 15 line, including matching
   `@next/env`, SWC platform binaries, `eslint-config-next` and its
   plugin. Preserve all unrelated packages and existing React `19.2.7`.
   This version includes the November 3, 2026 security fixes:
   https://github.com/vercel/next.js/releases/tag/v15.5.29
   Runtime package integrity metadata was cross-checked against two
   independent publicly committed npm lockfiles. Actual npm installation
   and audit must still be verified by CI.
2. **CORS** — Trust only the local web application's default origins.
   `GG_ALLOWED_WEB_ORIGINS` is a comma-separated opt-in for additional
   exact HTTP(S) origins; wildcard entries are rejected.
3. **HTTP Host validation** — Reject requests bearing unexpected Host
   headers by default, reducing DNS rebinding exposure. Operators can opt
   in to exact proxy hostnames with `GG_ALLOWED_API_HOSTS`.
4. **Git credentials** — Reject HTTPS URLs with userinfo or common token
   query fields by default, preventing accidental cleartext persistence.
   `GG_ALLOW_URL_CREDENTIALS=1` explicitly restores the original
   behavior; this is unsafe for shared installations.
5. **Diagnostic redaction** — Redact credentials in subprocess argument
   diagnostics and unsuccessful stdout/stderr, without altering Git output
   on successful analysis.
6. **Secret-hygiene ignores** — Exclude `.env.*` files by default while
   allowing explicitly named example files.
7. **Dependency audit gate** — Add `npm audit --omit=dev --audit-level=high`
   to GitHub Actions CI alongside existing lint, typecheck and tests.

## Deployment limits and residual risks

- Fastify binds to `127.0.0.1:4443` with **no user authentication**.
  Never expose it to untrusted networks as-is. TLS, authentication,
  authorization, and network restrictions are required for a shared
  deployment. A wider CORS allowlist alone does not provide these.
- An explicit credential-URL opt-in can still store secrets in local
  SQLite and Git mirror configuration. Prefer credential helpers.
- GG intentionally supports arbitrary local Git paths and remote
  HTTPS/SSH sources. A hosted multi-user system needs per-user
  authorization and remote-target restrictions before exposure.
- A complete review of transitive dependencies, large-repository
  resource limits, and deployment-specific attack paths is not
  claimed by this scoped patch.

## Verification

On the final `development` SHA, run:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm audit --omit=dev --audit-level=high
```

CI failure must be fixed at the source, not bypassed by disabling
checks, weakening assertions, or silently updating unrelated packages.

## Network/privacy controls (2026-11-05)

Git networking is limited to explicitly authorized operations:
the user's **Refresh** action for registered remote URLs, or the
`GG_ALLOW_REMOTE_GIT=1` environment opt-in for non-UI consumers.
`GG_OFFLINE=1` and `GG_ALLOW_REMOTE_GIT=0` deny a remote refresh
regardless of a click. Git subprocesses only allow file, HTTPS and SSH
transports when authorized; local-source refreshes remain file-only.
Cached mirror fetches use the URL stored by GG, not a possibly altered
origin. The GitHub adapter still requires independent
read-only GitHub access (enabled by default; disabled by `GG_OFFLINE=1` or
`GG_ALLOW_GITHUB_METADATA=0`) and does not contact GitHub during
local-only analysis.

The Next.js CLI telemetry option remains disabled in the `dev` and
`build` scripts. Regression tests cover user-triggered refreshes, cached
mirror origin changes and offline-deny behavior. Source code and tests do not
establish OS-wide absence of network traffic; use a system firewall and
capture real process traffic for an executable-level assurance.

**Retention is unchanged by request:** removing a repository record does
not delete a locally cached mirror.

See [Network and privacy](NETWORK-PRIVACY.md).

## Tauri Desktop threat boundary

The optional Tauri desktop has a separate security mode:
- Rust owns the bundled Node.js sidecar, launches it on a random loopback
  port and kills its process group when the desktop exits.
- An OS-random, 256-bit session token is required on every non-preflight
  API request. Rust injects the token only into the trusted webview's
  document-start script, not a third-party website.
- The webview has no shell plugin permissions. The API rejects untrusted
  Host headers and CORS origins; neither replaces the bearer token.
- SQLite and Git mirrors reside under the OS user application-data
  directory, outside the packaged read-only application resources.
- Next.js is statically exported; there is no public Next server.
- Next.js static hydration requires inline scripts. Desktop CSP therefore
  allows inline scripts for local packaged HTML. Review XSS risk before
  displaying untrusted HTML or enabling external navigation.
- The sidecar bundles Node.js and native better-sqlite3 binaries for each
  target OS/architecture. Artifacts must be built on a matching native runner.
- Git is currently a **system prerequisite** and is not included in the
  installer. GitHub CLI is optional.
- No updater, telemetry, automatic release, automatic install, npm publish,
  public API listener or remote browser navigation is added.

See [Desktop architecture](DESKTOP.md) for the trust boundaries.

## Production dependency remediation (2026-11-05)

The baseline lockfile failed the production-only audit with **9 high and
2 moderate** findings. Commit `31ced5a8` upgrades and pins the production
dependencies needed to address these findings:

- Fastify `5.12.8` (existing major version).
- Drizzle ORM `0.45.4`, Zod `4.6.7` and ECharts `6.1.0` (version
  upgrades tested against GG's existing application contracts).
- Patched compatible transitive dependencies, including Git routing,
  `sharp`, `nanoid`, `fast-uri`, and source-map libraries.
- Root-level npm overrides for `postcss: 8.5.32` and `zod: 4.6.7`,
  preventing vulnerable nested versions from being installed. This
  retains Next.js `15.5.29` instead of upgrading to Next.js 16;
  the override is **intentional compatibility debt** and must be
  reverified on any future Next.js update.

The GitHub Actions candidate run
[42023920280](https://github.com/ginmp8/gita/actions/runs/42023920280)
executed `npm ci`, `desktop:check`, lint, typecheck, existing tests,
full application build and `npm audit --omit=dev --audit-level=high`.
**All passed; the production-only audit found 0 vulnerabilities.**
This confirms the audited dependency state, not the absence of all
application vulnerabilities or a complete visual/end-to-end GUI test.

**Residual risk:** `npm ci` still reported 20 advisories in the full
development-inclusive dependency inventory (14 moderate, 4 high, 2
critical) on that run. These are not counted by `--omit=dev`; the
build toolchain and development dependencies require separate review.
Do not claim a comprehensive clean bill of security based only on the
production audit. Continue to gate GitHub Release publication on
verification and installer jobs, and validate GUI use before release.

The temporary write-authorized dependency remediation workflow was
removed after generating the verified lockfile. Normal CI jobs have
read-only GitHub contents permissions; only manually approved GitHub
Release publication can request write access.

## Full development-dependency audit remediation (2026-11-06)

The full npm audit before this change reported **20 advisories** (14 moderate,
4 high, 2 critical). That count included development/build dependencies;
the production-only audit was already clean on the prior candidate.

The 0.3.0 candidate dependency update raises Vitest from 3.2.x to the patched
4.1.12 line across all npm workspaces, updates compatible transitive packages,
and applies narrowly scoped root overrides:

- `minimatch@3` → `brace-expansion ^1.1.21` for the older glob dependency.
- `@typescript-eslint/typescript-estree` → `minimatch ^11.0.1` for the
  2026 glob-pattern denial-of-service advisory (locked at 11.0.5).
- `@esbuild-kit/core-utils` → `esbuild 0.25.12` so the unmaintained loader
  used by Drizzle Kit no longer installs its vulnerable esbuild 0.18.x copy.

The npm lockfile was regenerated without `npm audit fix --force`, preserving
`drizzle-kit` at the 0.31.x line. Deleting a stale nested lockfile record
**before** npm recalculated the tree was necessary for the scoped esbuild
override to take effect. The final lockfile is generated by npm; no tarball
integrity hashes were fabricated or edited by hand.

[GitHub Actions run 42263753544](https://github.com/ginmp8/gg/actions/runs/42263753544)
validated the candidate dependency tree using `npm ci`, lint, typecheck,
unit/integration tests, production web build, `desktop:check`, full
`npm audit --audit-level=moderate` and production-only audit. The full audit
reported **0 known vulnerabilities** at that point. The permanent CI now
checks both production and development dependency scopes and smoke-tests the
Drizzle Kit CLI. Final-branch CI and platform-specific installer smoke tests
are separate release gates; do not infer that passing npm audit proves zero
application vulnerabilities.

**Maintenance:** These overrides bridge incompatible upstream dependency
ranges. Re-evaluate them whenever Drizzle Kit, TypeScript ESLint, minimatch,
or esbuild are upgraded; remove them only when the upstream dependency graph
is patched and `npm ci`, migrations, lint, tests and both audits remain green.
Avoid downgrading Drizzle Kit to 0.18.1 solely to satisfy npm's generic
`--force` suggestion: that could break the current Drizzle schema tooling.
