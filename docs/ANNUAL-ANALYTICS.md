# Annual engineering contribution (Git Insights integration)

## Purpose and provenance

This module ports the annual Git analytics design and measurement principles
from [ginmp8/git-insights-dashboard PR #1](https://github.com/ginmp8/git-insights-dashboard/pull/1)
into Gita's TypeScript/Fastify/SQLite architecture. It does not embed Python
or Streamlit, does not call a hosted analytics service, and provides experimental relative technical evidence scores. Neither score
establishes objective human productivity.

The **Annual contribution** tab is the default project view. The existing
Overview, Contributors, Files, Branches and Pull requests tabs remain available.

See [ICE-Git/1 and Gita-Throughput/1](ICE-GIT.md) for formulas, evidence
and limitations.

## Scope and counting

A project may contain multiple repositories. Each repository uses its configured
integration branch, or its bare mirror's default HEAD when no branch is
configured. Only commits **reachable from this reference** are eligible.
The reporting year uses the Git author's timestamp as recorded in the index.
Identical SHAs reachable from multiple branches of the same repository are
counted once. Separate repositories are counted separately.

A merge is a commit for commit counts, but has no own churn in this analysis.
Squash merging may change which person Git records as the author; the numbers
cannot reliably attribute pair work or uncommitted work.

| Measure | Definition |
| --- | --- |
| Integrated commits | Reachable commits authored during the selected year |
| Active days | Distinct author dates with recorded commits; not hours worked |
| Gross churn | Added + deleted lines without rename detection |
| Rename-aware churn | Added + deleted lines with `--find-renames=50%` |
| Adjusted churn | Rename-aware diff ignoring whitespace (`-w`) |
| Estimated move churn | Non-negative gross minus rename-aware churn |
| Estimated whitespace churn | Non-negative rename-aware minus adjusted churn |
| Substantive commits | Commits with adjusted churn above zero |
| Cosmetic-only commits | Commits with gross churn above zero and adjusted churn zero |
| Code/test churn | Adjusted source + test churn, excluding known generated files |
| Changed test files | Commits touching files detected as tests, not successful test runs |
| PRs merged/reviewed/approved | Optional GitHub snapshots, explicitly linked to Git authors |

Generated-file and source/test/docs classification is a file-name heuristic,
not a semantic code analyzer. White-space adjustments can hide meaningful
indentation changes (notably in Python). A rename threshold can misclassify
large edits as deletions/additions. Binary files contribute file counts but
not numeric line churn.

**No metric in this module proves individual productivity, engineering
quality or business value.** Compare evidence with roles, task complexity,
reviews, CI outcomes, incidents and delivery impact.

## Incremental SQLite index

The existing Gita database under `.gita/gita.sqlite` gains additive tables:

- `annual_commit_metrics`: versioned per-SHA measurements and authors
- `annual_file_changes`: gross, rename-aware and adjusted per-file numstats
- `annual_ref_commits`, `annual_ref_state`: atomic membership and coverage
- `annual_identity_links`: explicit Git email and GitHub login associations
- `annual_pull_requests`, `annual_pr_reviews`, `annual_pr_state`: optional
  read-only snapshots, with a completeness flag

Every refresh uses `git rev-list <integration-ref>` to determine the full
reachable set, then calculates diffs **only for SHAs absent from the matching
analysis version**. A moving or rebased branch updates reference membership
without deleting reusable per-SHA analyses. If indexing fails, existing
published membership is retained; the UI reports incomplete coverage when
the requested branch has no matching index.

Use **Index local history** to recalculate missing metrics from already
cached mirrors without fetching any remote. Normal **Refresh project** also
indexes the annual data after the legacy analyzer. The legacy Overview and
other tabs still perform their historical analysis; their processing is not
yet incremental. The annual feature does **not** impose a 500-commit cap.
A regression indexes 521 commits, checks that all are visible in the annual
report, and verifies a second index reuses all 521 cached SHAs. The 500-row
maximum used by unrelated paginated list APIs must not be confused with an
annual history cap. A fixed internal diff batch size of 120 protects process
and memory usage without restricting the total history.

The database and mirrors may contain private commit messages, file paths,
identities and metadata. Protect the local data directory with OS permissions
and backups as appropriate.

## GitHub collaboration

GitHub PR/review snapshots are separate from Git-based metrics. They are
downloaded only after an explicit click on **Fetch GitHub PRs and reviews
(network)** (enabled by default; can be disabled with `GITA_ALLOW_GITHUB_METADATA=0`). The GitHub CLI must be
installed and authenticated. The operation is read-only and does not upload
repository contents. It caches sanitized PR/review metadata locally.

The GraphQL implementation paginates up to 5,000 PRs and captures up to 100
reviews per PR. If more exist, the snapshot is marked incomplete, and PR
indicators are shown as **unavailable** instead of presenting partial counts
as complete. Deleted users and inaccessible reviews may also lead to
missing associations.

Open Settings to associate Git author email aliases with a canonical email and optionally
a GitHub login in the annual tab. No account matching is guessed solely from
display names. PR-based metrics require complete snapshots for all selected
GitHub repositories and explicit login mapping.

## Export and project deletion

CSV and JSON reports are assembled by the local browser and downloaded
locally. CSV text fields are quoted and spreadsheet-formula prefixes are
neutralized. There is no automatic export upload.

**Delete project and local data** requires typing the exact project name.
It deletes project-scoped relational data, including all annual index and
collaboration tables, plus app-owned bare Git mirror directories. It never
deletes local source repositories or shared global directories. Operations
in progress block deletion. Unsafe, changed, or shared mirror paths cause
the operation to fail before database deletion. Cached mirrors are first
quarantined so a failed DB deletion can be rolled back; a post-commit
filesystem cleanup failure is explicitly reported.

## Contribution and productivity evidence scores

The annual dashboard now displays effective contribution (ICE-Git/1) and a
separate productivity proxy (Gita-Throughput/1) from already cached per-SHA
and per-file diffs. Both scores are cohort-relative, experimental, auditable
and exported to CSV/JSON. The full annual metrics and other tabs remain.

## Validation and limits

Tests must cover: renames, whitespace-only edits, substantive/test changes,
full SHA coverage, repeated updates with no new SHA processing, branch ref
rewrites, identity/PR snapshots, legacy refresh compatibility, CSV injection,
project deletion, preservation of originals, and absence of implicit
GitHub network calls. Large synthetic benchmarks are required before making
performance claims about workloads with 50+ developers and many thousands of
commits. Live private GitHub credentials and installed GUI behavior require
separate opt-in/manual validation.
