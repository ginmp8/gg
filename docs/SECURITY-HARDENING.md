# Development branch security hardening

## Scope and fork policy

- Baseline: `ginmp8/gita:main`, commit `465d8b984c1e17e6a5763b60b527cfad5831973f`.
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
   `GITA_ALLOWED_WEB_ORIGINS` is a comma-separated opt-in for additional
   exact HTTP(S) origins; wildcard entries are rejected.
3. **HTTP Host validation** — Reject requests bearing unexpected Host
   headers by default, reducing DNS rebinding exposure. Operators can opt
   in to exact proxy hostnames with `GITA_ALLOWED_API_HOSTS`.
4. **Git credentials** — Reject HTTPS URLs with userinfo or common token
   query fields by default, preventing accidental cleartext persistence.
   `GITA_ALLOW_URL_CREDENTIALS=1` explicitly restores the original
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
- Gita intentionally supports arbitrary local Git paths and remote
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
