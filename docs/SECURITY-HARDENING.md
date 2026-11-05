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

## Network/privacy controls (2026-11-05)

Application egress is now **opt-in**, using
`GITA_ALLOW_REMOTE_GIT=1` and `GITA_ALLOW_GITHUB_METADATA=1`.
`GITA_OFFLINE=1` blocks both even if enabled. Default Git subprocesses
receive `GIT_ALLOW_PROTOCOL=file` to reject external Git transports,
including through already cached mirrors. The Github adapter and process
runner do not launch `gh` without explicit consent. The Next.js CLI
telemetry option is disabled for local `dev` and `build`.

Regression tests cover the default-deny behavior and a dummy loopback
network endpoint for opt-in behavior. Source code and tests do not
establish OS-wide absence of network traffic; use a system firewall and
capture real process traffic for an executable-level assurance.

**Retention is unchanged by request:** removing a repository record does
not delete a locally cached mirror.

See [Network and privacy](NETWORK-PRIVACY.md).
