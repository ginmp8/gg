import type { AnnualContributor, AnnualReport, IceContributorScore } from "@gg/core";

export type RankingMetricId =
  | "overall" | "throughput" | "delivery" | "technical"
  | "support" | "continuity" | "collaboration" | "commits";

export interface RankingMetric {
  id: RankingMetricId;
  label: string;
  description: string;
  kind: "score" | "volume";
  getValue: (person: AnnualContributor, evidence: IceContributorScore | undefined) => number | null;
}

/** Rank only interpretable, available signals. Activity volume is not a quality score. */
export const RANKING_METRICS: readonly RankingMetric[] = [
  { id: "overall", label: "Overall contribution", kind: "score",
    description: "ICE-Git/1: relative integrated delivery, technical diff and tests/docs evidence.",
    getValue: (_, score) => score?.effectiveContributionScore ?? null },
  { id: "throughput", label: "Technical pace", kind: "score",
    description: "GG-Throughput/1: material delivery, technical changes per active month and continuity.",
    getValue: (_, score) => score?.productivityProxyScore ?? null },
  { id: "delivery", label: "Delivery", kind: "score",
    description: "ICE-Git component: relative material integrated commit evidence.",
    getValue: (_, score) => score?.components.integratedDelivery ?? null },
  { id: "technical", label: "Technical changes", kind: "score",
    description: "ICE-Git component: bounded, weighted source and test diff evidence.",
    getValue: (_, score) => score?.components.technicalDiff ?? null },
  { id: "support", label: "Tests & docs", kind: "score",
    description: "ICE-Git component: material work supported by tests or documentation.",
    getValue: (_, score) => score?.components.testDocs ?? null },
  { id: "continuity", label: "Continuity", kind: "score",
    description: "GG-Throughput component: months with material activity relative to the cohort.",
    getValue: (_, score) => score?.components.activityContinuity ?? null },
  { id: "collaboration", label: "Collaboration", kind: "score",
    description: "Optional GitHub PR/review evidence. Unavailable without complete mapped snapshots.",
    getValue: (_, score) => score?.components.githubCollaboration ?? null },
  { id: "commits", label: "Commits (volume)", kind: "volume",
    description: "Integrated commits: activity volume only; a higher count does not imply better work.",
    getValue: (person) => person.commits }
];

export interface RankedMetric {
  value: number;
  rank: number;
  cohort: number;
}

export interface ContributorRank {
  email: string;
  displayName: string;
  metrics: Partial<Record<RankingMetricId, RankedMetric>>;
}

export interface ContributorRankingSnapshot {
  available: boolean;
  cohortSize: number;
  rows: ContributorRank[];
  byEmail: Map<string, ContributorRank>;
}

/**
 * Rank against the entire project/repository/year cohort, never just selected
 * or searched contributors. Ties use competition ranking: 1, 1, 3.
 * Missing values are N/A and excluded from that metric's denominator.
 */
export function buildContributorRankings(report: AnnualReport): ContributorRankingSnapshot {
  const rows: ContributorRank[] = report.contributors.map(person => ({
    email: person.primaryEmail, displayName: person.displayName, metrics: {}
  }));
  const byEmail = new Map(rows.map(row => [row.email, row]));
  const scores = new Map(report.evidenceScores.contributors.map(item => [item.email, item]));
  if (report.complete) {
    for (const metric of RANKING_METRICS) {
      if (metric.kind === "score" && report.evidenceScores.status !== "ok") continue;
      const eligible = report.contributors.flatMap(person => {
        const value = metric.getValue(person, scores.get(person.primaryEmail));
        return value !== null && Number.isFinite(value)
          ? [{ email: person.primaryEmail, value }] : [];
      }).sort((a, b) => b.value - a.value || a.email.localeCompare(b.email));
      let rank = 0;
      for (let index = 0; index < eligible.length; index++) {
        const item = eligible[index]!;
        if (index === 0 || item.value !== eligible[index - 1]!.value) rank = index + 1;
        const target = byEmail.get(item.email);
        if (target) target.metrics[metric.id] = { value: item.value, rank, cohort: eligible.length };
      }
    }
  }
  return {
    available: report.complete && report.evidenceScores.status === "ok",
    cohortSize: report.contributors.length, rows, byEmail
  };
}

export function rankMetric(
  snapshot: ContributorRankingSnapshot, email: string, metric: RankingMetricId
): RankedMetric | null {
  return snapshot.byEmail.get(email)?.metrics[metric] ?? null;
}
