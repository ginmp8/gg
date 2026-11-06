# Network privacy and user-initiated refresh

## Local-first operation and network authorization

GG stores repository mirrors, commit history and calculated metrics locally.
The dashboard talks to Fastify on loopback. **Opening the dashboard and
calculating local metrics never execute remote Git clone/fetch.** With GitHub
metadata enabled by default, selecting a GitHub repository can invoke the
read-only GitHub CLI authentication status check. The annual PR/review import
and repository discovery still require their respective explicit buttons.

The existing **Refresh project** and **Refresh repository** actions expressly
authorize Git to clone or fetch the URLs already registered in the GG
database. The user's click is the authorization, as in the
`git-insights-dashboard` reference. Refresh does not push to repositories,
and an extra environment variable is **not** required for this normal flow.

GitHub metadata access is enabled by default, and `gh` is invoked when an
eligible provider status/query or explicit import/discovery action needs it.
Set `GG_ALLOW_GITHUB_METADATA=0` or `GG_OFFLINE=1` to disable these reads.
Core Git metrics continue to work when the CLI is missing or disabled.
GitHub status is explicitly degraded when `gh` is unavailable or unauthenticated.

## Network policy

| Setting | Default | Behavior |
| --- | --- | --- |
| No flags; no Refresh click | Remote Git stays idle | No Git clone/fetch; selecting a GitHub repository may run an authenticated `gh` status check |
| Click Refresh on registered remote | Allowed | Fetches only the URL registered for that repository |
| `GG_ALLOW_REMOTE_GIT=1` | Unset | Also authorizes remote Git for explicitly invoked non-UI workflows |
| `GG_ALLOW_REMOTE_GIT=0` | Unset | Denies remote Git, including manual Refresh |
| `GG_ALLOW_GITHUB_METADATA=0` | Unset | Explicitly disables read-only `gh` discovery/PR/review queries; otherwise enabled by default |
| `GG_OFFLINE=1` | Unset | Denies Git remotes and `gh` regardless of any other permission |

Set an override **before starting** the application; restart afterward.
For a forced-offline Windows PowerShell session:

```powershell
$env:GG_OFFLINE = "1"
npm run dev
```

For ordinary remote repositories, start GG normally and click Refresh.
Read-only GitHub metadata is available by default after you install and authenticate `gh`.
To disable it explicitly:

```powershell
$env:GG_ALLOW_GITHUB_METADATA = "0"
npm run dev
```

## Annual engineering analytics

The annual contribution engine processes Git commits and diffs from local,
GG-owned mirrors. The **Annual contribution** tab reads from the local
SQLite database and does not automatically fetch remotes, GitHub API data,
or contact a hosted analytics service.

Explicit project/repository Refresh operations index missing annual metrics
after updating their mirrors. The separate **Index local history** action
uses existing mirrors only and does not contact external Git services.
The optional **Fetch GitHub PRs and reviews (network)** action requires an authenticated
GitHub CLI. It is enabled by default, but never runs without a user-initiated fetch action. The application stores PR/review summaries and email associations
locally, not in an external database.

Project deletion removes only app-owned cached mirrors and scoped SQLite
rows, after exact-name confirmation. It does not delete user source
directories. See [annual analytics](ANNUAL-ANALYTICS.md) for data retention
and methodology.

## Explicit GitHub repository discovery

The `GitHub import` picker uses `gh api --paginate` to list only authorized
repository **metadata** (name, clone URL, visibility, archive status,
last push, and default branch) after the user presses **Discover accessible
repositories (network)**. The feature is enabled by default and is disabled by `GG_OFFLINE=1`
or `GG_ALLOW_GITHUB_METADATA=0`.

Registering selected entries (maximum 25) saves local repository metadata
without cloning, fetching or modifying any remote. A separate **Refresh**
action explicitly starts the network Git operation. Private HTTPS sources
require an existing Git credential helper; `gh auth setup-git` may configure
one. No tokens are saved to GG's project database by discovery.

## Trust boundaries and cached mirrors

A remote refresh only permits HTTPS or SSH Git transports (plus the
local file protocol used for repository cache/testing). The Git engine
passes a fixed argument array to the Git executable and blocks `git://`,
`ext::` and custom remote helpers. `GG_OFFLINE=1` and the explicit
remote-disable flag take precedence over a click.

For existing mirrors, GG supplies the **registered repository URL**
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
  `git push` operation is implemented by GG.
- The optional GitHub CLI can contact GitHub to check authentication
  and query pull-request metadata for your GitHub repositories. The CLI
  maintains its own credentials and configuration; GG does not send
  private source files to an analytics server.
- `npm ci` and other build/install commands download dependencies
  from package registries, and GitHub Actions connects to GitHub to
  retrieve source and upload CI artifacts. These are **development/build**
  communications, not application runtime analytics.

## Important limits: application policy is not an OS firewall

The guards cover GG's current Git and GitHub CLI integration. They are
not proof that operating-system networking, all third-party dependencies,
Git plugins/credential helpers, or future code are unable to connect to
other destinations. Installation, update checks by separately installed
tools, and operating-system services are outside these guards.

For confidential projects, validate the exact installed executable and
child processes in a network-captured test with *dummy* repositories,
then use outbound firewall controls to enforce a network-isolated
runtime if absolute denial is required. On Windows, observe the GG
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
   registered in the GG database.
4. `GG_OFFLINE=1` and `GG_ALLOW_REMOTE_GIT=0` block even a manual
   Refresh; local sources still work offline.
5. The GitHub CLI is never invoked without its independent permission.
6. The desktop API session token is not forwarded into child processes.

Validation commands: `npm run test`, `npm run lint`,
`npm run typecheck`, `npm run build`, and the production dependency
audit. These are application tests, **not** proof of zero OS-wide traffic.
