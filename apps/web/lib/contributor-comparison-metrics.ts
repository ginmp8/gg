import type {
  AnnualContributor, AnnualMonthly, IceComponents, IceContributorScore
} from "@gg/core";

export type CompareRow = {
  person: AnnualContributor;
  evidence: IceContributorScore | undefined;
  monthly: AnnualMonthly[];
};
export type MetricFormat = "number" | "decimal" | "percent" | "date" | "text";
export type MetricValue = number | string | null;
export type ComparisonMetric = {
  key: string;
  label: string;
  explanation: string;
  format: MetricFormat;
  value: (row: CompareRow) => MetricValue;
};
export type ComparisonGroup = { title: string; metrics: ComparisonMetric[] };

const annual = (
  key: keyof AnnualContributor, label: string, explanation: string,
  format: MetricFormat = "number"
): ComparisonMetric => ({
  key: String(key), label, explanation, format,
  value: row => row.person[key] as MetricValue
});
const score = (
  key: keyof IceContributorScore, label: string, explanation: string,
  format: MetricFormat = "decimal"
): ComparisonMetric => ({
  key: String(key), label, explanation, format,
  value: row => (row.evidence?.[key] ?? null) as MetricValue
});
const component = (
  key: keyof IceComponents, label: string, explanation: string
): ComparisonMetric => ({
  key: "component." + key, label, explanation, format: "decimal",
  value: row => row.evidence?.components[key] ?? null
});
function monthlyValue(row: CompareRow, selector: (m: AnnualMonthly) => number): number {
  return row.monthly.reduce((total, item) => total + selector(item), 0);
}
const derived = (
  key: string, label: string, explanation: string,
  value: (row: CompareRow) => MetricValue, format: MetricFormat = "number"
): ComparisonMetric => ({ key, label, explanation, format, value });

/** All available annual contributor numeric fields and ICE score component fields are represented. */
export const COMPARISON_METRIC_GROUPS: readonly ComparisonGroup[] = [
  {
    title: "Contribution and productivity scores",
    metrics: [
      score("effectiveContributionScore", "Effective contribution · ICE-Git/1",
        "Relative contribution evidence score, not an objective human-performance metric."),
      score("productivityProxyScore", "Productivity proxy · GG-Throughput/1",
        "Technical output evidence normalized by active-month reference values."),
      score("combinedContributionScore", "GitHub-enhanced contribution",
        "Combined score only when collaboration evidence can be mapped."),
      score("evidenceCoveragePercent", "Evidence coverage", "Share of supporting evidence available.", "percent"),
      component("integratedDelivery", "Integrated delivery component", "Normalized material commits."),
      component("technicalDiff", "Technical diff component", "Normalized bounded source and test diff credit."),
      component("testDocs", "Tests and documentation component", "Supporting test and documentation signals."),
      component("githubCollaboration", "GitHub collaboration component", "Normalized PR/review contribution when available."),
      component("deliveryPerActiveMonth", "Delivery per active month", "Monthly-normalized material delivery."),
      component("diffPerActiveMonth", "Diff per active month", "Monthly-normalized bounded technical changes."),
      component("activityContinuity", "Activity continuity", "Continuity across the selected year's active months.")
    ]
  },
  {
    title: "Integrated work and activity",
    metrics: [
      annual("commits", "Integrated commits", "Distinct commits authored on selected integration refs."),
      score("materialCommits", "Material commits", "Commits classified as materially changing source/tests."),
      annual("substantiveCommits", "Substantive commits", "Commits with substantive diff evidence."),
      annual("cosmeticOnlyCommits", "Cosmetic-only commits", "Changes classified as cosmetic-only."),
      score("supportedCommits", "Supported commits", "Commits with associated tests or documentation."),
      annual("repositories", "Repositories touched", "Distinct selected repositories with authored commits."),
      annual("activeDays", "Active days", "Distinct Git author dates with commits."),
      score("activeMonths", "Active months", "Distinct months with material activity."),
      annual("firstActivity", "First activity", "First observed author timestamp in this year.", "date"),
      annual("lastActivity", "Last activity", "Last observed author timestamp in this year.", "date"),
      annual("primaryEmail", "Canonical contributor email", "Identity used for contributor aggregation.", "text"),
      annual("githubLogin", "Mapped GitHub login", "GitHub login associated with the contributor, if mapped.", "text")
    ]
  },
  {
    title: "Churn and change classification",
    metrics: [
      annual("grossChurn", "Gross churn", "Raw added plus removed lines."),
      annual("renameAwareChurn", "Rename-aware churn", "Churn after accounting for renames and moves."),
      annual("adjustedChurn", "Adjusted churn", "Churn after estimated move and whitespace adjustments."),
      annual("reviewableChurn", "Reviewable source/test churn", "Reviewable source and test diff changes."),
      annual("sourceChurn", "Source churn", "Changes to files classified as application/source code."),
      annual("testChurn", "Test churn", "Changes to files classified as tests."),
      annual("docsChurn", "Documentation churn", "Changes to files classified as documentation."),
      annual("generatedChurn", "Generated-file churn", "Changes in files classified as generated."),
      annual("estimatedMoveChurn", "Estimated move churn", "Estimated lines moved without substantive edits."),
      annual("estimatedWhitespaceChurn", "Whitespace-only churn", "Estimated whitespace changes."),
      score("boundedDiffCredit", "Bounded weighted diff credit", "Capped and weighted technical change evidence."),
      annual("movedFiles", "Moved files", "Files classified as renamed/moved."),
      annual("pureMoves", "Pure moves", "Moves without substantive changed lines."),
      annual("binaryFiles", "Binary files touched", "Binary files included in commit evidence."),
      derived("fileEvidenceSamples", "Retained file evidence samples",
        "Auditable file samples retained by the scoring policy, not all files.",
        row => row.evidence?.fileEvidence.length ?? null),
      derived("sampleWeightedLines", "Sampled weighted lines",
        "Total weighted lines only among retained file evidence samples.",
        row => row.evidence ? row.evidence.fileEvidence.reduce((n, file) => n + file.weightedLines, 0) : null, "decimal"),
      derived("sampleBoundedLines", "Sampled bounded lines",
        "Total bounded lines among retained evidence samples.",
        row => row.evidence ? row.evidence.fileEvidence.reduce((n, file) => n + file.boundedLines, 0) : null, "decimal"),
      derived("sampleAdjustedLines", "Sampled adjusted lines",
        "Adjusted lines among retained evidence samples.",
        row => row.evidence ? row.evidence.fileEvidence.reduce((n, file) => n + file.adjustedLines, 0) : null)
    ]
  },
  {
    title: "Rates and supporting evidence",
    metrics: [
      annual("substantiveRate", "Substantive commit rate", "Substantive commits as a share of integrated commits.", "percent"),
      annual("retainedChurnRate", "Retained churn rate", "Adjusted churn compared with gross churn.", "percent"),
      annual("testTouchedRate", "Test-touched commit rate", "Commits touching test files as a share of commits.", "percent"),
      annual("testTouchedCommits", "Commits touching tests", "Commits with test-file activity."),
      derived("materialCommitRate", "Material commit rate", "Material commits divided by total integrated commits.",
        row => row.evidence && row.person.commits ? row.evidence.materialCommits * 100 / row.person.commits : null, "percent"),
      derived("commitsPerActiveDay", "Commits per active day", "Average integrated commits per active day.",
        row => row.person.activeDays ? row.person.commits / row.person.activeDays : null, "decimal"),
      derived("materialCommitsPerActiveMonth", "Material commits per active month",
        "Material commits divided by the score's active months.",
        row => row.evidence?.activeMonths ? row.evidence.materialCommits / row.evidence.activeMonths : null, "decimal"),
      derived("diffCreditPerActiveMonth", "Bounded diff per active month",
        "Bounded weighted diff divided by active months.",
        row => row.evidence?.activeMonths ? row.evidence.boundedDiffCredit / row.evidence.activeMonths : null, "decimal")
    ]
  },
  {
    title: "GitHub collaboration",
    metrics: [
      annual("mergedPullRequests", "Merged pull requests", "Merged PRs mapped to this contributor; unavailable when no snapshot."),
      annual("reviewedPullRequests", "Reviewed pull requests", "Distinct pull requests with a mapped review."),
      annual("approvedPullRequests", "Approved pull requests", "Distinct pull requests with a mapped approval.")
    ]
  },
  {
    title: "Monthly distribution",
    metrics: [
      derived("monthsWithCommits", "Months with commits", "Months in the year with any authored commits.",
        row => row.monthly.filter(item => item.commits > 0).length),
      derived("monthlyCommits", "Monthly indexed commits total", "Sum of integrated commits in the monthly series.",
        row => monthlyValue(row, m => m.commits)),
      derived("peakMonthlyCommits", "Peak commits in a month", "Largest monthly integrated-commit count.",
        row => Math.max(0, ...row.monthly.map(m => m.commits))),
      derived("averageCommitsPerMonth", "Average commits per active month",
        "Mean commits across months containing commits.",
        row => row.monthly.length ? monthlyValue(row, m => m.commits) /
          row.monthly.filter(item => item.commits > 0).length : null, "decimal"),
      derived("monthlyAdjustedChurn", "Monthly adjusted churn total", "Sum of adjusted churn in the monthly series.",
        row => monthlyValue(row, m => m.adjustedChurn)),
      derived("monthlyReviewableChurn", "Monthly reviewable churn total", "Sum of reviewable churn across months.",
        row => monthlyValue(row, m => m.reviewableChurn)),
      derived("monthlyTestTouches", "Monthly test touch total", "Sum of test-touch commits across months.",
        row => monthlyValue(row, m => m.testTouchedCommits))
    ]
  }
];

/** Key coverage is testable, so new contributor and score fields cannot quietly vanish from Compare. */
export const ANNUAL_FIELD_KEYS = COMPARISON_METRIC_GROUPS.flatMap(group =>
  group.metrics.map(metric => metric.key));

export function formatComparisonValue(value: MetricValue, format: MetricFormat): string {
  if (value === null || value === "") return "N/A";
  if (typeof value === "string") {
    if (format === "date") {
      const date = new Date(value);
      return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-US");
    }
    return value;
  }
  if (!Number.isFinite(value)) return "N/A";
  if (format === "percent") return value.toFixed(1) + "%";
  return value.toLocaleString("en-US", { maximumFractionDigits: format === "decimal" ? 2 : 0 });
}
