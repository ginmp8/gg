# Contributor comparison (GG Analytics 0.2.0)

**Compare** is immediately to the right of **Contributors** in the menu.
Choose a project and analysis year. Use **Repository scope** in the Compare tab
(or the synchronized dashboard repository selector) to choose **All repositories**
or a single repository. All repositories aggregates every indexed repository
belonging to the selected project, deduplicating contributors by canonical
email; a single repository restricts the candidates, metrics, scores and
export to that repository. The selection is saved per project, repository
and year, so changing tabs or restarting GG restores the previous list.
The tag and search filters are restored with the selected year.

The comparison displays both the number of repository histories included
in the selected scope and the count fully indexed. If a repository was
added but not indexed, the UI names it explicitly instead of silently
presenting the first repository's contributors as the full workspace.
Use **Settings → Data synchronization → Sync local metrics** to index existing
cached mirrors without contacting remotes. If a repository has no mirror, use
**Sync repositories + metrics** to fetch and index it. The chosen analysis year still limits
contributors to commits in that year: a fully indexed repository with
no commits that year does not add any contributors.

Adding a repository invalidates cached annual reports. Once a refresh
or reindex run completes, the dashboard refetches the comparison.

## Executive ranking (default)

The Compare tab opens on **Executive ranking**. It shows the ranking and a
short explanation for each contributor's existing ICE-Git/1 and GG-Throughput/1
evidence, rather than requiring interpretation of dozens of raw columns.
Three leader cards highlight overall contribution, technical pace and
test/documentation support. The sortable leaderboard shows a position and
value for **overall contribution**, **technical pace**, **delivery**,
**technical changes**, **tests and documentation**, **continuity**, optional
**GitHub collaboration**, and **commit count** (activity volume only).
Choose **Rank by** to sort using any of those dimensions.

Positions are calculated against the **complete project/repository/year
cohort**, not just selected people, filtered search results, or custom tags.
Ties share a rank (1, 1, 3); unavailable evidence shows **N/A**, not rank
zero. Incomplete history suppresses rankings. ICE-Git components require a
minimum scoring cohort. Commit-count rank is explicitly a volume measure,
not an estimate of work quality or performance. None of the rankings is an
objective evaluation of individuals.

Contributor checkboxes in the leaderboard control the comparison selection.
Use **Selected only** to narrow visible rows, or open **Detailed evidence**
for the full preexisting comparison and its export. Detailed view retains
**Select all matching** after tag and search filters, without a fixed
four-person cap; wide tables scroll horizontally. Tags and search change
the people displayed, not the score-calculation cohort.

## Full available metric inventory (Detailed evidence)

The comparison shows all available numeric fields of AnnualContributor and
IceContributorScore, grouped into collapsible sections instead of one
unmanageable table:

- **Scores:** effective contribution (ICE-Git/1), productivity proxy
  (GG-Throughput/1), optional combined GitHub score, evidence coverage,
  and the seven score components (integrated delivery, technical diff,
  test/docs, GitHub collaboration, delivery/month, diff/month, continuity).
- **Activity:** integrated/material/substantive/cosmetic/supported commits,
  active days/months, repositories, first/last activity, canonical email
  and GitHub login.
- **Churn and classification:** gross, rename-aware, adjusted and
  reviewable churn; source, test, docs and generated changes; move and
  whitespace estimates; moved/pure-move/binary-file counts; bounded
  diff credit and retained file-evidence samples.
- **Rates:** substantive/retained-churn/test-touched rates, test touches,
  material share, commits per active day and technical output per month.
- **Collaboration:** merged, reviewed and approved pull request counts.
- **Monthly distribution:** active months, monthly peaks and totals
  and a twelve-month per-person table for commits, adjusted churn,
  reviewable churn and test touches.

Definitions accompany each metric. The **Export selected comparison**
action downloads JSON including full contributor values, score components,
reference cohorts and available file evidence. File-evidence samples are
capped; use the [local CLI](local-cli.md) to page raw annual file records.

Unavailable metrics display **N/A**, not zero. The report remains scoped
to the selected repository/year cohort. Larger churn values are not
treated as better. The largest score within a row may be highlighted,
but no score proves individual productivity, difficulty, teamwork or
customer value. See [ICE-Git methodology](../ICE-GIT.md).
