# Network privacy and offline operation

## Default behavior

Gita's application runtime is **offline by default**. The browser UI talks
only to its local Fastify API at `127.0.0.1`, and SQLite and Git mirrors
remain on the local computer. Local repository analysis uses ordinary Git
commands and does not require the GitHub CLI or an Internet connection.

Git remote operations and GitHub metadata enrichment are **opt-in**.
The feature is preserved, not removed. Each flag must equal `1`; other
values do not grant consent. Restart the application after changing flags.

| Setting | Default | Effect |
| --- | --- | --- |
| `GITA_ALLOW_REMOTE_GIT=1` | Off | Permit Git fetch/clone over HTTPS/SSH for repositories you add |
| `GITA_ALLOW_GITHUB_METADATA=1` | Off | Permit `gh auth status` and GitHub pull-request metadata queries |
| `GITA_OFFLINE=1` | Off | Emergency kill-switch: deny both operations even when opt-ins are set |

With no opt-in set:
- You can register remote repository URLs, but **Refresh** rejects remote
  Git access before creating a mirror. It does not perform a fallback fetch.
- Existing cached remote mirrors cannot fetch from the network through
  Gita. The Git subprocess receives `GIT_ALLOW_PROTOCOL=file`, rejecting
  HTTP(S), SSH and other remote Git transport protocols, even if a cached
  mirror's origin or a local URL rewrite points at a network server.
- Only local Git file transport is permitted in the Git child process.
  Local repositories can still refresh and be analyzed.
- The GitHub adapter returns `network_disabled` without invoking `gh`.
  The process runner also refuses to spawn `gh` without metadata consent.
- The `GITA_DESKTOP_TOKEN` process environment variable, if present, is
  stripped from child processes to avoid leaking a future desktop token.
- The Next.js `dev` and `build` commands run with
  `NEXT_TELEMETRY_DISABLED=1`, preventing Next.js CLI usage telemetry.

## Enabling features explicitly

For remote Git only:

```bash
GITA_ALLOW_REMOTE_GIT=1 npm run dev
```

To allow GitHub pull-request metadata too:

```bash
GITA_ALLOW_REMOTE_GIT=1 GITA_ALLOW_GITHUB_METADATA=1 npm run dev
```

PowerShell equivalents:

```powershell
$env:GITA_ALLOW_REMOTE_GIT = "1"
$env:GITA_ALLOW_GITHUB_METADATA = "1"
npm run dev
```

To **force offline** regardless of these settings, use
`GITA_OFFLINE=1` and restart. Opt-in to GitHub metadata is separate
from opt-in to Git remote access so the minimum necessary access can be
enabled. Existing local file, commit and branch analytics remain available.

## What may leave the computer when access is enabled?

- Git clone/fetch contacts the remote Git server configured by you and
  transmits Git protocol requests, repository identifiers, authentication
  information if configured, and normal protocol negotiation. No
  `git push` operation is implemented by Gita.
- The optional GitHub CLI can contact GitHub to check authentication
  and query pull-request metadata for your GitHub repositories. The CLI
  maintains its own credentials and configuration; Gita does not send
  private source files to an analytics server.
- `npm ci` and other build/install commands download dependencies
  from package registries, and GitHub Actions connects to GitHub to
  retrieve source and upload CI artifacts. These are **development/build**
  communications, not application runtime analytics.

## Important limits: application policy is not an OS firewall

The guards cover Gita's current Git and GitHub CLI integration. They are
not proof that operating-system networking, all third-party dependencies,
Git plugins/credential helpers, or future code are unable to connect to
other destinations. Installation, update checks by separately installed
tools, and operating-system services are outside these guards.

For confidential projects, validate the exact installed executable and
child processes in a network-captured test with *dummy* repositories,
then use outbound firewall controls to enforce a network-isolated
runtime if absolute denial is required. On Windows, observe the Gita
process, bundled Node sidecar (when desktop is merged), `git.exe`, and
`gh.exe` independently. A successful build or a source review cannot
replace process-level traffic evidence.

The existing local-data behavior is intentionally unchanged: deleting a
repository's database record does not automatically delete its cached
Git mirror. This change does not alter retention, delete history, or
migrate databases.

## Regression tests

The Vitest suite verifies:
1. Remote clone/fetch is rejected before writing a new mirror when offline.
2. Git cannot establish a connection even to a local dummy HTTP server
   while remote Git is disabled. The opt-in gate is checked separately;
   no external test service is used.
3. The GitHub CLI is never invoked while disabled; explicit metadata
   opt-in restores existing behavior.
4. `GITA_OFFLINE=1` overrides both opt-ins.
5. A future desktop API session token is not forwarded to Git children.

Run with `npm run test`, followed by `npm run lint`,
`npm run typecheck` and `npm run build`. Existing dependency
security audit checks remain unchanged.
