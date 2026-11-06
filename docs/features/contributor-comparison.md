# Contributor comparison (Gita 0.2.0)

**Compare** is immediately to the right of **Contributors** in the menu.
Choose a project/repository and analysis year, search, then select two to
four contributors. User-defined tags narrow the candidates, without
recalculating the scoring cohort.

## Full available metric inventory

The comparison shows all available numeric fields of AnnualContributor and
IceContributorScore, grouped into collapsible sections instead of one
unmanageable table:

- **Scores:** effective contribution (ICE-Git/1), productivity proxy
  (Gita-Throughput/1), optional combined GitHub score, evidence coverage,
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
