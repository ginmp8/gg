# Network privacy and user-initiated refresh

## Local-first operation and network authorization

Gita stores repository mirrors, commit history and calculated metrics locally.
The dashboard only talks to Fastify on loopback. **Opening the dashboard,
reading local repositories or calculating metrics does not initiate Git
network requests.**

The existing **Refresh project** and **Refresh repository** actions expressly
authorize Git to clone or fetch the URLs already registered in the Gita
database. The user's click is the authorization, as in the
`git-insights-dashboard` reference. Refresh does not push to repositories,
and an extra environment variable is **not** required for this normal flow.

GitHub pull-request enrichment is separate: the `gh` CLI is only invoked
when `GITA_ALLOW_GITHUB_METADATA=1` and `GITA_OFFLINE` is not set to 1.
Core Git metrics continue to work when the CLI is missing or disabled.

## Network policy

| Setting | Default | Behavior |
| --- | --- | --- |
| No flags; no Refresh click | Local only | No Git clone/fetch or GitHub CLI calls |
| Click Refresh on registered remote | Allowed | Fetches only the URL registered for that repository |
| `GITA_ALLOW_REMOTE_GIT=1` | Unset | Also authorizes remote Git for explicitly invoked non-UI workflows |
| `GITA_ALLOW_REMOTE_GIT=0` | Unset | Denies remote Git, including manual Refresh |
| `GITA_ALLOW_GITHUB_METADATA=1` | Unset | Enables optional read-only `gh` queries during refresh |
| `GITA_OFFLINE=1` | Unset | Denies Git remotes and `gh` regardless of any other permission |

Set an override **before starting** the application; restart afterward.
For a forced-offline Windows PowerShell session:

```powershell
$env:GITA_OFFLINE = "1"
npm run dev
```

For ordinary remote repositories, start Gita normally and click Refresh.
When GitHub PR metadata is needed, enable that capability separately:

```powershell
$env:GITA_ALLOW_GITHUB_METADATA = "1"
npm run dev
```

## Trust boundaries and cached mirrors

A remote refresh only permits HTTPS or SSH Git transports (plus the
local file protocol used for repository cache/testing). The Git engine
passes a fixed argument array to the Git executable and blocks `git://`,
`ext::` and custom remote helpers. `GITA_OFFLINE=1` and the explicit
remote-disable flag take precedence over a click.

For existing mirrors, Gita supplies the **registered repository URL**
directly to `git fetch --prune` with the bare-mirror refspec. This prevents
a modified `remote.origin.url` in a cached mirror from silently
redirecting the refresh to another server. Local-source mirrors always
run Git with file-only transport, even if general remote access is enabled.

Normal Git system configuration, credentials helpers, SSH agents and proxies
may still connect to services used to authenticate the chosen remote. An
OS-level firewall is necessary to guarantee absolute egress restrictions.

## What may leave the computer when access is enabled?

- An explicit Git refresh contacts the remote Git server you registered and
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

The Vitest tests cover:
1. An arbitrary remote Git command is denied without authorization.
2. An explicit Refresh successfully clones/fetches registered repositories,
   including project refreshes with two repositories.
3. A cached mirror with a changed origin still fetches only the URL
   registered in the Gita database.
4. `GITA_OFFLINE=1` and `GITA_ALLOW_REMOTE_GIT=0` block even a manual
   Refresh; local sources still work offline.
5. The GitHub CLI is never invoked without its independent permission.
6. The desktop API session token is not forwarded into child processes.

Validation commands: `npm run test`, `npm run lint`,
`npm run typecheck`, `npm run build`, and the production dependency
audit. These are application tests, **not** proof of zero OS-wide traffic.
