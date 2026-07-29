# AGENTS.md

This file is the binding implementation specification for agents and
developers working on this repository. It defines the product, architecture,
technology choices, safety rules, and quality bar for the `gita` project.

Developers must not re-select the stack, replace the architecture, or downgrade
the product scope without an explicit user request. When this file gives a
concrete technology, library, directory, command, or behavior, implement that
choice directly.

## Project Mission

`gita` is a local-first git analytics application.

The user can create projects, attach one or more git repositories to each
project, refresh repository data on demand or on a schedule, and inspect a
professional dashboard with contributors, commits, branches, pull requests,
activity trends, line-change metrics, ownership, and repository health.

The application must read from git repositories and remote hosting APIs only.
It must never write to analyzed repositories or their remotes.

## Target User Experience

- The app starts as a local web application through `npm run dev`.
- The first screen is the actual dashboard/product UI, not a marketing page.
- The user can create a project.
- The user can add multiple repositories to a project.
- The user can refresh a project and a single repository.
- The user can filter every analytical view by project, repository,
  contributor, date range, branch, and metric.
- The user can inspect a project-level summary across multiple repositories.
- The user can drill into a single repository.
- The app presents data with tables, charts, timelines, and leaderboards.
- The UI must feel like a serious engineering analytics tool: dense,
  readable, fast, and visually polished.

## Target Platform

- Fedora Linux is the primary development environment.
- Local `git` is the required source for repository analysis.
- Local `gh` is the required integration mechanism for GitHub metadata.
- Network access can be unavailable in agent sessions, so core git analysis
  must be testable against local repositories.
- Use Node.js, npm workspaces, Next.js, TypeScript, and Tailwind CSS.

## Stack Decision

Use npm workspaces, Next.js, TypeScript, and Tailwind CSS.

`npm` is the package manager and workspace runner. `Next.js` is the web
application framework. They are complementary, not alternatives.

The professional target architecture is:

- npm workspace at the repository root.
- TypeScript across the whole codebase.
- Next.js App Router for the polished local web application.
- A dedicated Fastify API/worker process for git refresh jobs and heavy
  analysis.
- Shared packages for domain logic, database access, git parsing, and provider
  adapters.

Do not put long-running git analysis directly inside React components or
request-time rendering paths. The web app can expose thin API/BFF routes only
for frontend-specific composition. Repository refresh and analysis belongs to
the backend/worker layer.

## Hard Safety Rules

These rules are non-negotiable.

- Never run `git push` against repositories analyzed by Gita or their remotes.
- Never create, delete, rename, or update branches in analyzed repositories.
- Never create commits, tags, worktrees, stashes, or checkouts in analyzed
  repositories.
- Never run destructive git commands such as `git reset`, `git clean`,
  `git checkout`, `git switch`, or `git branch -D` against user repositories.
- Do not write into user repositories being analyzed.
- All mutable git state owned by the app must live under the app cache,
  `.gita/repos/`.
- Use bare mirror clones for repository caches.
- Use read-only commands against repository caches except for app-owned
  `git fetch --prune` updates inside `.gita/repos/`.
- Treat `gh` as read-only. Use it only for API reads such as pull requests,
  reviews, repository metadata, and branch metadata.
- If a later feature needs write access, it must be explicitly approved by the
  user and isolated from this read-only analytics mode.

## Important Git Reality Checks

Be explicit about what git can and cannot know.

- Git can provide commits, authors, commit dates, file-level stats, branches,
  tags, remotes, and refs.
- Git line statistics from `--numstat` are change statistics, not proof of
  current code ownership.
- Binary files do not have line counts in normal git numstat output.
- Merge commits are excluded from contributor line-change totals by default.
  They remain visible in commit counts with `isMerge = true`.
- Git does not reliably store the creation time of a remote branch.
- Pull requests are not a git concept. They require hosting-provider APIs such
  as GitHub, GitLab, or Bitbucket.
- GitHub branch and pull request metadata must be collected through `gh`.
  If `gh` is missing or unauthenticated, the app must show a degraded GitHub
  metadata state while keeping git-only analytics functional.
- Any inferred data, such as probable branch creation time, must be labeled as
  an estimate in the UI and API.

## Required Architecture

Build this as an npm workspace with clear boundaries.

```text
gita/
  package.json
  AGENTS.md
  .gitignore
  apps/
    api/
      src/
    web/
      app/
      components/
      lib/
  packages/
    core/
      src/
    db/
      src/
    git-engine/
      src/
    github-adapter/
      src/
  .gita/
    gita.sqlite
    repos/
    logs/
    exports/
```

Required responsibilities:

- `apps/web`: Next.js dashboard, routes, charts, tables, filters, interaction,
  and frontend-specific BFF endpoints for UI composition.
- `apps/api`: local HTTP API, refresh orchestration, job status, and background
  git analysis jobs.
- `packages/core`: domain types, metric definitions, scoring, aggregation.
- `packages/db`: SQLite schema, Drizzle migrations, query helpers.
- `packages/git-engine`: all local git command execution and parsing.
- `packages/github-adapter`: all GitHub reads through `gh`.

Do not collapse this into a single app package. The separation above is part of
the product architecture and must exist from the first implementation.

## Required Stack

- Language: TypeScript.
- TypeScript mode: strict.
- Runtime: Node.js 24 LTS.
- Package manager: npm workspaces.
- Monorepo task runner: Turborepo.
- Web framework: Next.js App Router with React.
- Backend: Fastify for the local API/worker.
- Database: SQLite.
- SQLite driver: `better-sqlite3`.
- Database layer: Drizzle ORM and Drizzle Kit.
- Validation: Zod.
- Styling: Tailwind CSS.
- UI primitives: Radix UI.
- Charts: Apache ECharts.
- Tables: TanStack Table.
- Server-state/data fetching in the web app: TanStack Query.
- Icons: Lucide React.
- Unit and integration tests: Vitest.
- Browser UI tests: Playwright.
- Linting: ESLint.
- Formatting: Prettier.

## No Open Technical Choices

The implementation must use the locked choices below.

- Do not use Vite, Remix, SvelteKit, Vue, Angular, Astro, or a custom SPA
  shell. Use Next.js App Router.
- Do not use pnpm or Yarn. Use npm workspaces.
- Do not use PostgreSQL, MySQL, MongoDB, Redis, or an external service for the
  local MVP. Use SQLite with Drizzle ORM and `better-sqlite3`.
- Do not use Next.js route handlers for long-running repository refresh jobs.
  Use the Fastify API/worker.
- Do not add Electron, Tauri, or a native desktop shell. The product is a local
  web application served on localhost.
- Do not use Recharts, Chart.js, D3 as the primary chart layer, or hand-rolled
  chart SVGs. Use Apache ECharts.
- Do not use a custom table implementation. Use TanStack Table.
- Do not use a custom design system from scratch. Use Tailwind CSS, Radix UI,
  and Lucide React.
- Do not call GitHub through handwritten REST fetches in the first
  implementation. Use local `gh` and parse JSON output.
- Do not add a remote backend, cloud sync, user accounts, authentication, or
  multi-user deployment in the local MVP.

## Tailwind CSS Requirements

Tailwind CSS is the default styling system for `apps/web`.

Rules:

- Configure Tailwind through the standard Next.js integration.
- Keep global CSS minimal: Tailwind layers, CSS variables, base theme tokens,
  and unavoidable browser resets only.
- Create reusable React components for repeated UI patterns instead of copying
  long class lists.
- Use CSS variables for semantic theme tokens such as background, foreground,
  border, muted, accent, success, warning, and danger.
- Do not hard-code a one-note color palette across the dashboard.
- Keep layout dimensions stable with Tailwind utilities for grid, flex, min/max
  width, height, overflow, and responsive breakpoints.
- Use responsive Tailwind variants deliberately; verify that tables, charts,
  filters, and cards remain usable on narrow screens.
- Use custom CSS only for Tailwind base variables, unavoidable browser resets,
  chart container fixes, and third-party component interoperability.

## Local Data Layout

The app must own all mutable data under `.gita/`.

```text
.gita/
  gita.sqlite
  repos/
    <repo-id>.git
  logs/
  exports/
  tmp/
```

Rules:

- `.gita/` must not be committed.
- Repository cache directories are app-owned.
- A cached repository is updated with `git fetch --prune`.
- The app database is the source of truth for projects, repository records,
  refresh history, identity mapping, and analysis snapshots.
- Raw provider data is cached per refresh run, and derived metrics must be
  reproducible from stored git/provider inputs.

## Required Domain Model

Implement the domain around these concepts.

### Project

A project groups multiple repositories.

Required initial fields:

- `id`
- `name`
- `description`
- `createdAt`
- `updatedAt`

### Repository

A repository belongs to a project.

Required initial fields:

- `id`
- `projectId`
- `name`
- `url`
- `localPath`
- `provider`
- `defaultBranch`
- `cachePath`
- `lastRefreshAt`
- `createdAt`
- `updatedAt`

Supported repository inputs:

- HTTPS URL
- SSH URL
- Local path
- GitHub shorthand, for example `owner/name`

### Refresh Run

A refresh run records each update attempt.

Required initial fields:

- `id`
- `projectId`
- `repositoryId`
- `scope`
- `status`
- `startedAt`
- `finishedAt`
- `errorMessage`
- `gitFetchMs`
- `analysisMs`
- `providerFetchMs`

### Contributor

A contributor is a normalized person.

Required initial fields:

- `id`
- `displayName`
- `primaryEmail`
- `avatarUrl`
- `createdAt`
- `updatedAt`

### Contributor Identity

Maps raw git author identities to a normalized contributor.

Required initial fields:

- `id`
- `contributorId`
- `name`
- `email`
- `source`

### Commit

Required initial fields:

- `repoId`
- `hash`
- `shortHash`
- `authorName`
- `authorEmail`
- `authorDate`
- `committerName`
- `committerEmail`
- `committerDate`
- `subject`
- `body`
- `parents`
- `isMerge`
- `insertions`
- `deletions`
- `filesChanged`

### Commit File Stat

Required initial fields:

- `repoId`
- `commitHash`
- `path`
- `oldPath`
- `status`
- `insertions`
- `deletions`
- `isBinary`
- `extension`
- `topLevelDirectory`

### Branch

Required initial fields:

- `repoId`
- `name`
- `remote`
- `isDefault`
- `headCommitHash`
- `lastCommitAt`
- `createdAtEstimate`
- `providerCreatedAt`
- `updatedAt`

### Pull Request

Pull requests must be populated through the GitHub provider adapter when the
repository is hosted on GitHub and `gh` is authenticated.

Required initial fields:

- `repoId`
- `provider`
- `providerId`
- `number`
- `title`
- `state`
- `authorLogin`
- `createdAt`
- `updatedAt`
- `closedAt`
- `mergedAt`
- `baseBranch`
- `headBranch`
- `additions`
- `deletions`
- `changedFiles`
- `reviewDecision`
- `url`

## Metrics To Support

Start with reliable metrics from git.

- Total commits.
- Commits by contributor.
- Insertions by contributor.
- Deletions by contributor.
- Net line delta by contributor.
- Files changed by contributor.
- First and last activity by contributor.
- Activity over time.
- Commits by repository.
- Line changes by repository.
- Active contributors over time.
- New contributors over time.
- Branch count by repository.
- Last activity per branch.
- Hot files by churn.
- Top directories by churn.

Provider-backed metrics are required for GitHub repositories when `gh` is
authenticated. If `gh` is missing, unauthenticated, or rate-limited, keep these
metrics visible with a degraded-state explanation instead of hiding the
feature.

- Pull requests opened by contributor.
- Pull requests merged by contributor.
- Pull request lead time.
- Review activity.
- Time to merge.
- Open pull request age.
- Branch metadata from provider APIs.

Advanced metrics required by Milestones 2-4:

- Code ownership by file or directory.
- Bus factor approximations.
- Contributor focus areas.
- Repository health score.
- Churn risk.
- Stale branches.
- Inactive repositories.
- Release or tag cadence.

## Metric Semantics

Keep metric definitions stable and documented in code.

- `insertions`: added lines reported by git.
- `deletions`: removed lines reported by git.
- `netLines`: insertions minus deletions.
- `churn`: insertions plus deletions.
- `activeContributor`: contributor with activity in the selected period.
- `lastActivity`: latest commit or provider activity depending on the view.
- `ownership`: file or directory change ownership. For the initial algorithm,
  compute each contributor's ownership score for a path as their share of
  `churn` for that path in the selected time range. The owner is the top
  contributor only when their score is at least `0.35`; otherwise show
  "shared". Label this metric as "change ownership", not absolute code
  ownership.

Avoid presenting approximate metrics as exact facts.

## Git Engine Requirements

All git execution must be centralized in `packages/git-engine`.

Use machine-readable commands and stable parsing.

Useful commands:

```bash
git clone --mirror <url> <cache-path>
git -C <cache-path> fetch --prune
git -C <cache-path> for-each-ref --format=...
git -C <cache-path> log --format=... --numstat
git -C <cache-path> show --numstat --format=...
git -C <cache-path> remote -v
```

Implementation rules:

- Use argument arrays, not shell string interpolation, for child processes.
- Validate local paths and URLs before executing commands.
- Apply timeouts to git commands.
- Capture stdout, stderr, exit code, and duration.
- Never parse human-oriented output if a formatted command can be used.
- Use NUL-delimited fields wherever git supports them. For commands that do not
  support NUL-delimited output, define and test one parser-specific delimiter.
- Handle renamed files.
- Handle binary files.
- Handle empty repositories.
- Handle repositories with many commits.
- Handle detached or missing default branch information.
- Preserve raw file paths from git output. If a path cannot be decoded as
  UTF-8, store a replacement-safe display value and keep the raw byte-oriented
  command output in the refresh diagnostic log.

## GitHub Adapter Requirements

GitHub support is required, read-only, and implemented only through local `gh`.
The application must continue running without GitHub enrichment when `gh` is
missing, unauthenticated, or rate-limited.

Use these `gh` command families:

```bash
gh auth status
gh repo view <owner>/<repo> --json ...
gh pr list --repo <owner>/<repo> --state all --json ...
gh api ...
```

Rules:

- Do not require GitHub for core git analytics.
- If `gh` is missing or unauthenticated, show a clear degraded state.
- Do not block git metrics because provider metadata failed.
- Cache provider responses for each refresh run.
- Respect rate limits.
- Keep provider adapter boundaries isolated in `packages/github-adapter` and
  expose typed provider DTOs through `packages/core`.

## Refresh Workflow

Repository refresh:

1. Resolve repository record.
2. Ensure cache path exists.
3. Clone mirror if missing.
4. Fetch with prune if cache exists.
5. Analyze commits, refs, branches, tags, and file stats.
6. Fetch provider metadata for GitHub repositories through `gh`.
7. Normalize contributors and identities.
8. Store raw and derived data.
9. Recompute repository and project snapshots.
10. Mark refresh run as succeeded or failed.

Project refresh:

1. Queue refresh for each repository in the project.
2. Run with controlled concurrency.
3. Keep per-repository errors isolated.
4. Recompute project-level aggregation after repository jobs finish.

The UI must show progress, partial failure, and the time of the last
successful refresh.

## API Design

Implement a local Fastify HTTP API with explicit resources.

Required endpoints:

```text
GET    /api/health
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId

GET    /api/projects/:projectId/repositories
POST   /api/projects/:projectId/repositories
GET    /api/repositories/:repoId
PATCH  /api/repositories/:repoId
DELETE /api/repositories/:repoId

POST   /api/projects/:projectId/refresh
POST   /api/repositories/:repoId/refresh
GET    /api/refresh-runs/:runId

GET    /api/projects/:projectId/summary
GET    /api/projects/:projectId/activity
GET    /api/projects/:projectId/leaderboard
GET    /api/repositories/:repoId/summary
GET    /api/repositories/:repoId/activity
GET    /api/repositories/:repoId/contributors
GET    /api/repositories/:repoId/branches
GET    /api/repositories/:repoId/pull-requests
```

Query parameters must support:

- `from`
- `to`
- `repositoryId`
- `contributorId`
- `branch`
- `metric`
- `limit`
- `offset`

## Web UI Requirements

Build a real application UI.

Primary views:

- Project overview.
- Project dashboard.
- Repository detail.
- Contributor leaderboard.
- Activity timeline.
- Branches.
- Pull requests.
- File and directory churn.
- Settings and identity merge.

Dashboard expectations:

- Project/repository selector.
- Date range filter.
- KPI strip.
- Activity chart.
- Contributor leaderboard.
- Repository comparison.
- Branch freshness table.
- Pull request summary with a degraded-state panel when provider data is
  unavailable.
- Recent activity feed.
- Clear empty states.
- Clear loading and error states.

Design requirements:

- Use a restrained, professional dashboard aesthetic.
- Prioritize scannability over decoration.
- Use charts for trends and comparisons.
- Use tables for precise metrics.
- Use compact controls and stable layouts.
- Do not put cards inside cards.
- Do not create a marketing landing page.
- Avoid one-color theme dominance.
- Ensure mobile and desktop layouts do not overlap text.
- Use Lucide React icons for common actions.
- Avoid in-app instructional copy that explains obvious UI mechanics.

## Filtering Rules

Filters must compose predictably.

- Project filter limits all metrics to repositories in the project.
- Repository filter narrows project data to one repository.
- Contributor filter narrows metrics to one normalized contributor.
- Date filters apply to commit author date for git metrics and provider
  timestamps for provider metrics.
- Pull request filters use provider timestamps.
- Branch filter API responses must include `branchTimeSource` with one of:
  `headCommit`, `defaultBranchReachability`, or `providerMetadata`.

## Identity Normalization

Git identity data is messy. Build for that from the start.

Rules:

- Store raw author name and email exactly as read from git.
- Create normalized contributors from identities.
- Implement manual merging and splitting of identities in Milestone 2. The
  Milestone 1 schema must support it.
- Use exact email matches for automatic identity matching.
- Do not silently merge unrelated names without strong evidence.
- Preserve historical metrics after identity merges by recomputing from raw
  identity mappings.

## Performance Requirements

The app must remain responsive on large repositories.

- Run git refresh work outside request handlers in the Fastify worker layer.
- Track job progress.
- Implement incremental refresh by tracking analyzed commit hashes and
  reprocessing only new commits after the first full analysis.
- Cache aggregate snapshots.
- Paginate large result sets.
- Index database columns used by filters.
- Avoid loading all commit file stats into the frontend.
- Keep expensive recomputation explicit and observable.

## Error Handling

Errors must be actionable.

- Missing `git`: show setup error.
- Invalid repository URL/path: show validation error.
- Clone/fetch failure: preserve stderr summary.
- Missing `gh`: show GitHub metadata unavailable, not app failure.
- Unauthenticated `gh`: show authentication needed for provider metrics.
- Rate limit: show provider rate-limit status if known.
- Parse failure: store the failing command context and enough sample output for
  debugging, without dumping huge logs into the UI.

## Testing Strategy

Use the following mandatory test strategy.

Vitest unit and integration tests must cover:

- Git log parsing.
- Numstat parsing.
- Rename and binary file handling.
- Contributor identity normalization.
- Metric aggregation.
- Date range filtering.
- Project aggregation across multiple repositories.
- GitHub adapter degraded behavior when `gh` is missing.

Integration tests must use small fixture repositories created during tests.
Do not depend on network access for core git tests.

Playwright UI tests must cover:

- Empty project state.
- Project creation.
- Repository addition.
- Refresh status.
- Dashboard rendering.
- Filter behavior.
- Leaderboard sorting.

## Development Commands

The root `package.json` must expose these exact scripts:

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "db:generate": "npm --workspace @gita/db run generate",
    "db:migrate": "npm --workspace @gita/db run migrate",
    "db:studio": "npm --workspace @gita/db run studio"
  }
}
```

These command names and root-level behavior are part of the public developer
contract and must remain stable.

## Coding Standards

- Use TypeScript for application code.
- Keep domain logic out of React components.
- Keep command execution out of route handlers when it grows beyond trivial
  orchestration.
- Centralize git command execution.
- Centralize provider command execution.
- Use typed data structures over ad hoc objects.
- Use deterministic parsing and explicit delimiters.
- Avoid hidden global state except for well-defined app services.
- Keep functions small enough to test.
- Add comments only when they explain non-obvious behavior or tradeoffs.
- Avoid broad refactors unrelated to the current task.

## Security Considerations

- Treat repository URLs and paths as untrusted input.
- Do not pass untrusted strings through a shell.
- Use child process argument arrays.
- Restrict local path access to explicit user-provided repository paths and the
  app-owned `.gita/` directory.
- Do not expose the local API beyond localhost by default.
- Do not log secrets, tokens, or full authenticated remote URLs.
- Redact tokens from command output.
- Keep `gh` and git operations read-only.

## Implementation Milestones

### Milestone 1: Local MVP

- Create npm workspace.
- Add API and web apps.
- Add SQLite database.
- Add project CRUD.
- Add repository CRUD.
- Add mirror clone/fetch.
- Parse commits and numstat.
- Compute contributor leaderboard.
- Compute activity over time.
- Build project dashboard.
- Provide `npm run dev`.

### Milestone 2: Better Git Analytics

- Add branches view.
- Add tags and release cadence.
- Add hot files and directory churn.
- Add identity merge UI.
- Add incremental refresh.
- Add repository comparison.

### Milestone 3: GitHub Metadata

- Detect GitHub remotes.
- Read PRs through `gh`.
- Add PR dashboard.
- Add review and merge-time metrics.
- Add provider degraded states.

### Milestone 4: Professional Polish

- Add job progress UI.
- Add robust filtering.
- Add export options.
- Add stronger tests.
- Add production build.
- Add documentation.

## Definition Of Done

A task is done when:

- The implementation matches this product direction.
- Analyzed repositories are not modified.
- Relevant tests or manual verification have been run.
- The UI has loading, empty, and error states for changed flows.
- Large data paths are paginated or aggregated.
- Any approximate metric is labeled honestly.
- New commands are documented in `package.json` or project docs.
- The final response states what changed and how it was verified.

## Agent Workflow

Before changing code:

- Inspect the existing project structure.
- Read this file.
- Preserve user changes.
- Follow existing project patterns once they exist.

While changing code:

- Keep edits scoped.
- Use `apply_patch` for manual file edits.
- Do not run destructive commands.
- Do not write outside the workspace unless explicitly approved.
- Keep the local app runnable.

Before finishing:

- Run the narrowest useful verification command.
- If a web UI was changed, start the dev server and provide the local URL.
- Report any verification commands that failed or were skipped.
