<div align="center">

# Gita

**A local-first dashboard for understanding activity, contributors, and change across Git repositories.**

[![Node.js 24](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-App_Router-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Local first](https://img.shields.io/badge/local--first-read--only-6D5DFB)

</div>

![Gita project analytics dashboard](assets/app.png)

Gita turns Git history into a clear engineering analytics dashboard. Group
repositories into projects, refresh their data on demand, and explore the
people and files behind every change—all from a local web application.

## One dashboard for the whole project

Gita is not limited to a single repository. You can manage multiple independent
projects, attach multiple repositories to each one, and see their Git history
as one coherent product view.

- Keep backend, frontend, infrastructure, and shared-library repositories under
  the same project.
- Aggregate commits, line changes, churn, contributors, and activity across all
  repositories in that project.
- Compare repositories side by side or narrow every view to one repository
  without losing the project-level context.
- Refresh an entire project at once or update a single repository on demand.

## Understand every contributor

See who is driving activity across the project, compare commits and line-change
metrics, and understand which file types each contributor works with. Gita
normalizes Git identities so project-wide leaderboards remain useful even when
the work is split across several repositories.

![Gita contributor analytics and file type share](assets/contributors.png)

## Find where change concentrates

Explore the current file landscape alongside historical change. File-type
breakdowns, touched-file counts, and churn metrics make it easier to spot the
technologies and parts of a project that absorb the most work.

![Gita file type analytics and churn breakdown](assets/files.png)

## What you can explore

- Project-level analytics across multiple repositories
- Commits, insertions, deletions, net line change, and churn over time
- Contributor leaderboards, activity trends, and focus areas
- Repository comparisons, branch activity, hot files, and file-type insights
- Reusable branch views with per-repository folder filters
- GitHub pull requests and branch metadata through the optional `gh` CLI
- Composable filters for repository, contributor, branch, folder, date, and
  metric

Gita is local-first and read-only toward analyzed repositories. Its database,
mirror caches, logs, and exports stay inside `.gita/` in the application
directory.

## Quick start

### Requirements

- [Node.js 24](https://nodejs.org/) or newer
- npm
- [Git](https://git-scm.com/)
- [GitHub CLI](https://cli.github.com/) (optional, for GitHub metadata)

Clone or download the repository, then run:

```bash
cd gita
npm ci
npm run dev
```

Open [http://127.0.0.1:4444](http://127.0.0.1:4444) in your browser. The local
API runs at [http://127.0.0.1:4443](http://127.0.0.1:4443).

The database and required runtime directories are created automatically on
first start.

### Add your first repository

1. Create a project from the dashboard.
2. Add a repository using a local path, HTTPS URL, SSH URL, or GitHub shorthand
   such as `owner/repository`.
3. Select **Refresh** to analyze the repository.
4. Use the dashboard filters and tabs to explore the results.

For GitHub pull request enrichment, authenticate the optional CLI before
refreshing:

```bash
gh auth login
gh auth status
```

Core Git analytics continue to work when `gh` is missing, unauthenticated, or
temporarily unavailable.

## How it works

Gita never checks out or modifies the repositories it analyzes. Remote
repositories are cloned as bare mirrors into the app-owned `.gita/repos/`
cache; later refreshes update only those caches with `git fetch --prune`.
Provider metadata is read through the local `gh` CLI.

```text
apps/web                 Next.js dashboard
apps/api                 Fastify API and refresh worker
packages/core            Domain types and metric aggregation
packages/db              SQLite and Drizzle data layer
packages/git-engine      Safe Git execution and parsing
packages/github-adapter  Read-only GitHub integration through gh
```

The application uses TypeScript, npm workspaces, Turborepo, Next.js, Fastify,
SQLite, Drizzle ORM, Tailwind CSS, Radix UI, Apache ECharts, and TanStack Table.

## Development

```bash
npm run build       # Build every workspace
npm run test        # Run the Vitest suite
npm run lint        # Lint the codebase
npm run typecheck   # Check strict TypeScript types
npm run format      # Format with Prettier
```

Database utilities:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Metric notes

Line metrics come from Git `--numstat`: they describe historical change, not
the current size or absolute ownership of the codebase. Merge commits remain in
commit counts but are excluded from contributor line-change totals. Binary
files do not contribute line counts.

## Desktop application (Tauri 2)

The optional native desktop distribution bundles the existing React dashboard,
Fastify backend, Node.js 24 and native SQLite binding. **Node.js is not
required on the end user's machine**, but **Git must be available** to analyze
repositories; the `gh` CLI remains optional.

- [Desktop development, build, architecture and security](docs/DESKTOP.md)
- [Desktop CI artifacts and manual GitHub Releases](docs/RELEASING-DESKTOP.md)

The browser-based `npm run dev` workflow remains unchanged. Building the
desktop does not migrate SQLite or change the original analytics engine.

## Security and self-hosting

Gita is **local-first**. The API binds to `127.0.0.1:4443` by default and has
**no user authentication**. Do not publish the API directly or expose it
through an unauthenticated reverse proxy. Shared installations require an
authentication and TLS boundary.

HTTP `Host` validation also limits access to loopback hostnames by default,
reducing DNS rebinding exposure. Explicit reverse-proxy hostnames can be
added with `GITA_ALLOWED_API_HOSTS` (comma-separated). This is not
authentication and does not itself enable network listening.

Browser CORS access is restricted to `http://127.0.0.1:4444` and
`http://localhost:4444`. Operators may add extra *exact* origins through
`GITA_ALLOWED_WEB_ORIGINS` (comma-separated). CORS is **not** authorization.

HTTPS Git URLs containing userinfo or common token query parameters are
rejected by default to avoid plaintext credential storage in SQLite and Git
mirror configuration. Prefer a Git credential helper. To explicitly retain
the original behavior, set `GITA_ALLOW_URL_CREDENTIALS=1`, accepting the
credential-storage risk.

See [Security hardening](docs/SECURITY-HARDENING.md) for the verified
source scope, dependency updates, controls and remaining risks.

## License

Gita is available under the [MIT License](LICENSE). You may use, copy, fork,
modify, and distribute it, including for commercial purposes, as long as the
copyright and license notice remain included. The software is provided **as
is**, without warranty; its authors are not liable for how it is used.

---

**Suggested GitHub topics:** `git` · `git-analytics` · `repository-analytics` ·
`engineering-metrics` · `developer-tools` · `code-churn` ·
`contributor-insights` · `github-analytics` · `local-first` · `typescript` ·
`nextjs`
