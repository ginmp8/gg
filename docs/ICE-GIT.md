# Effective contribution and technical productivity evidence

**ICE-Git/1** and **Gita-Throughput/1** are experimental, cohort-relative
0–100 scores in the Annual contribution view. They read the existing local
SQLite snapshot of per-SHA and per-file Git changes, without re-running Git
diffs, adding a database schema or contacting the network.

## ICE-Git/1 — effective contribution evidence

Four dimensions: integrated material delivery (30%), weighted technical diff
(30%), test/docs support (25%), optional GitHub PR/review collaboration (15%).
The Git-only result reweights the three local dimensions:

    contribution = (0.30 E + 0.30 T + 0.25 S) / 0.85

When complete GitHub PR snapshots and explicit identity mappings exist for at
least three developers, the enhanced score adds 0.15 C; otherwise it is **N/A**,
not zero. E and T use a diminishing-returns logarithmic scale relative to the
group's interpolated P75. A sparse group's positive-only P75 is used when the
overall P75 is zero but some signals are positive.

Diff credit: use SQLite file rows with mode adjusted (renames detected and
whitespace ignored); exclude generated, binary and unknown source extensions.
Cap each eligible file at 120 changed lines; weight source 1.00, test 0.85,
docs 0.65. Cap weighted lines per commit at 150; a qualifying commit earns
at most log(1 + min(weightedLines,150))/log(151) units. E counts qualifying
material commits. S scales the percentage of material commits also modifying
test or docs paths, reaching 100 at 25%. Synthetic splitting or superficial
test edits can still distort the result.

## Gita-Throughput/1 — productivity proxy

A **technical output-rate proxy**, not a human productivity measurement:

- 30% material commits / active month (P75-log normalized)
- 50% bounded technical diff units / active month (P75-log normalized)
- 20% active-month continuity compared with the cohort's maximum

Generated-only and cosmetic-only histories yield zero throughput credit.
Active months are months containing an eligible commit in the selected year.
Small, complex tasks and work outside Git may be significantly undercounted.
Cohorts must contain three or more contributors; incomplete annual reference
coverage suppresses both scores.

## Audit, reuse and interpretation

Each score includes components, reference quantiles, raw material commits,
bounded diff units, active months, a sample of up to 20 highest-credit file
paths and SHAs, and the versioned policy constants. Full provenance remains
in SQLite. The JSON report exports the methodology and evidence; CSV includes
both scores and coverage. The pure TypeScript scoring API
[scoreIceCohort](../packages/core/src/ice-score.ts) is reusable independently
of the database or frontend.

The numbers depend on cohort, selected repositories, year, Git authorship,
identity mappings and the policy. They **do not prove quality, effort, speed,
outcomes or business impact**. Squash merges, paired work, production incidents,
architectural decisions and off-platform reviews may not be represented.
Do not use them alone for employee evaluation, compensation or promotion.
