# Local agent CLI (Gita 0.2.0)

Gita exposes its existing SQLite analytics through a **read-only JSON CLI**
that any trusted local harness can use as a subprocess. It does not start
a network service, requires no authentication, and never writes data.

## Prerequisites

Node.js 24 and dependencies installed with npm ci in a Gita source
checkout. The CLI is not shipped as a global binary or inside native
desktop installers. Open **Settings → Local CLI for coding agents** to
see commands for the selected project and the local database path.

The CLI reads only an existing gita.sqlite database. It does not
create directories, run migrations, index commits, fetch Git remotes,
contact GitHub, update tags or start a background worker.

## Examples

From the Gita source checkout:

    npm run cli -- catalog
    npm run cli -- projects
    npm run cli -- repositories --project PROJECT_ID
    npm run cli -- summary --project PROJECT_ID
    npm run cli -- scores --project PROJECT_ID --year 2026
    npm run cli -- annual --project PROJECT_ID --year 2026
    npm run cli -- contributors --project PROJECT_ID --limit 100
    npm run cli -- activity --project PROJECT_ID --from 2026-01-01 --to 2026-12-31
    npm run cli -- file-types --project PROJECT_ID
    npm run cli -- hot-files --project PROJECT_ID --limit 100
    npm run cli -- contributor-file-types --project PROJECT_ID
    npm run cli -- repository-comparison --project PROJECT_ID
    npm run cli -- branches --project PROJECT_ID
    npm run cli -- pull-requests --project PROJECT_ID
    npm run cli -- tags --project PROJECT_ID
    npm run cli -- branch-views --project PROJECT_ID
    npm run cli -- annual-identities --project PROJECT_ID

Use --repo REPOSITORY_ID to restrict supported commands to a repository
in the specified project. Additional metrics filters include --contributor,
--from, --to, --metric, --branch, --branch-scope, repeated --branches and
repeated --folder-filter.

All successful commands print a single JSON object to stdout, with
schemaVersion: "1", source: "local-sqlite", readOnly: true, command,
and data. Errors print JSON on stderr and return a nonzero exit code.

The annual command returns the complete annual report: full contributor
metrics, monthly activity, coverage, scores, score components, policy,
cohort references and retained sample evidence. The scores command returns
the score-specific subset with relevant coverage. Incomplete evidence
remains unavailable/null rather than being converted to zero.

## Raw SQLite datasets

The table command allows reading all existing SQLite datasets through a
compile-time allowlist of table names and parameterized pagination.
No arbitrary user SQL is executed.

    npm run cli -- table --table commits --limit 100 --offset 0
    npm run cli -- table --table commit_file_stats --limit 100 --offset 0
    npm run cli -- table --table annual_commit_metrics --limit 100
    npm run cli -- table --table annual_file_changes --limit 100
    npm run cli -- table --table project_tag_assignments --limit 100

Use the catalog command for all available tables and commands. Each
page contains items, total, limit and offset. Limit is bounded to
1–500 rows. Increase --offset to retrieve additional pages. Raw table
queries intentionally span the whole local database; filter project IDs
or repository IDs within your harness.

The CLI obtains its database path from GITA_DATA_DIR/gita.sqlite when
the GITA_DATA_DIR environment variable is set; otherwise it uses the
Gita source workspace's .gita/gita.sqlite.

Linux/macOS:

    GITA_DATA_DIR=/path/to/gita-data npm run cli -- projects

Windows PowerShell:

    $env:GITA_DATA_DIR = 'C:\path\to\gita-data'
    npm run cli -- projects

## Harness integration

Configure the harness to run a subprocess with the Gita checkout as its
working directory and capture stdout as JSON. Do not treat a nonzero exit
as a successful query. The CLI needs no session token, local HTTP port or
MCP server. A harness that supports **only** native MCP transport will
need a separate MCP adapter; Gita 0.2.0 provides the command-line protocol.

Because CLI output includes local Git history, author emails and other
local metadata, run it only from trusted harnesses under your OS account.
Do not expose it to remote or untrusted executors. OS file permissions
protect the underlying data; the CLI does not add authentication.

For troubleshooting, run npm run cli -- catalog (works without a database).
Then run npm run cli -- projects after the Gita app has created a local
project. Point GITA_DATA_DIR to the correct folder if the DB is elsewhere.
