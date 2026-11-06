/** ICE-Git/1 and Gita-Throughput/1: relative, auditable Git evidence, not measured human productivity. */
export const ICE_GIT_POLICY = {
  methodology: "ICE-Git/1",
  productivityMethodology: "Gita-Throughput/1",
  referenceQuantile: 0.75,
  minimumCohort: 3,
  maxLinesPerFile: 120,
  maxWeightedLinesPerCommit: 150,
  sourceWeight: 1,
  testWeight: 0.85,
  docsWeight: 0.65,
  supportRatioTarget: 0.25,
  deliveryWeight: 0.30,
  technicalWeight: 0.30,
  supportWeight: 0.25,
  collaborationWeight: 0.15,
  maximumEvidenceFiles: 20
} as const;

export interface IceFileEvidence {
  repoId: string;
  hash: string;
  path: string;
  category: "source" | "test" | "docs";
  adjustedLines: number;
  boundedLines: number;
  weightedLines: number;
}

export interface IceSignal {
  email: string;
  displayName: string;
  commits: number;
  materialCommits: number;
  boundedDiffCredit: number;
  supportedCommits: number;
  activeMonths: number;
  mergedPullRequests: number | null;
  reviewedPullRequests: number | null;
  fileEvidence: IceFileEvidence[];
}

export interface IceComponents {
  integratedDelivery: number | null;
  technicalDiff: number | null;
  testDocs: number | null;
  githubCollaboration: number | null;
  deliveryPerActiveMonth: number | null;
  diffPerActiveMonth: number | null;
  activityContinuity: number | null;
}

export interface IceContributorScore extends IceSignal {
  effectiveContributionScore: number | null;
  productivityProxyScore: number | null;
  combinedContributionScore: number | null;
  evidenceCoveragePercent: number;
  components: IceComponents;
}

export type IceScoreStatus = "ok" | "insufficient_cohort" | "incomplete_history";

export interface IceScoreReport {
  methodology: "ICE-Git/1";
  productivityMethodology: "Gita-Throughput/1";
  status: IceScoreStatus;
  policy: typeof ICE_GIT_POLICY;
  references: {
    cohortSize: number;
    materialCommitsP75: number;
    boundedDiffCreditP75: number;
    materialCommitsPerActiveMonthP75: number;
    diffCreditPerActiveMonthP75: number;
    mergedPullRequestsP75: number | null;
    reviewedPullRequestsP75: number | null;
    collaborationMapped: number;
  };
  contributors: IceContributorScore[];
  warnings: string[];
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return (sorted[lower] ?? 0) * (1 - fraction) +
    (sorted[Math.min(lower + 1, sorted.length - 1)] ?? 0) * fraction;
}

/** Avoid a zero P75 reference when a sparse cohort still contains real work. */
function reference(values: readonly number[]): number {
  const p75 = quantile(values, ICE_GIT_POLICY.referenceQuantile);
  return p75 > 0 ? p75 :
    quantile(values.filter((value) => value > 0), ICE_GIT_POLICY.referenceQuantile);
}

function scaled(value: number, p75: number): number {
  return value > 0 && p75 > 0
    ? Math.min(100, 100 * Math.log1p(value) / Math.log1p(p75))
    : 0;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function validateSignals(rows: readonly IceSignal[]): void {
  const identities = new Set<string>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email || identities.has(email)) throw new Error("Developer identities must be unique and nonempty.");
    identities.add(email);
    for (const key of ["commits", "materialCommits", "boundedDiffCredit", "supportedCommits", "activeMonths"] as const) {
      if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error("Invalid ICE-Git signal: " + key);
    }
    for (const key of ["commits", "materialCommits", "supportedCommits", "activeMonths"] as const) {
      if (!Number.isInteger(row[key])) throw new Error("ICE-Git counts must be integers: " + key);
    }
    if (row.materialCommits > row.commits || row.supportedCommits > row.materialCommits ||
        (row.commits > 0 && row.activeMonths === 0)) {
      throw new Error("Inconsistent ICE-Git commit or activity counts.");
    }
    for (const key of ["mergedPullRequests", "reviewedPullRequests"] as const) {
      if (row[key] !== null && (!Number.isInteger(row[key]) || row[key] < 0)) {
        throw new Error("Invalid GitHub collaboration signal: " + key);
      }
    }
  }
}

export function scoreIceCohort(
  signals: readonly IceSignal[],
  collaborationComplete = false,
  statusOverride?: "incomplete_history"
): IceScoreReport {
  validateSignals(signals);
  const sufficient = signals.length >= ICE_GIT_POLICY.minimumCohort && statusOverride === undefined;
  const mapped = signals.filter((person) =>
    person.mergedPullRequests !== null && person.reviewedPullRequests !== null
  );
  const canCompareCollaboration = sufficient && collaborationComplete &&
    mapped.length >= ICE_GIT_POLICY.minimumCohort;
  const matP75 = reference(signals.map((person) => person.materialCommits));
  const diffP75 = reference(signals.map((person) => person.boundedDiffCredit));
  const materialPerMonth = (person: IceSignal) =>
    person.activeMonths > 0 ? person.materialCommits / person.activeMonths : 0;
  const diffPerMonth = (person: IceSignal) =>
    person.activeMonths > 0 ? person.boundedDiffCredit / person.activeMonths : 0;
  const materialRateP75 = reference(signals.map(materialPerMonth));
  const diffRateP75 = reference(signals.map(diffPerMonth));
  const maxMonths = Math.max(0, ...signals.map((person) => person.activeMonths));
  const mergedP75 = canCompareCollaboration ? reference(mapped.map((person) => person.mergedPullRequests ?? 0)) : null;
  const reviewedP75 = canCompareCollaboration ? reference(mapped.map((person) => person.reviewedPullRequests ?? 0)) : null;
  const coreWeight = ICE_GIT_POLICY.deliveryWeight + ICE_GIT_POLICY.technicalWeight +
    ICE_GIT_POLICY.supportWeight;

  const contributors: IceContributorScore[] = signals.map((person) => {
    const emptyComponents: IceComponents = {
      integratedDelivery: null, technicalDiff: null, testDocs: null, githubCollaboration: null,
      deliveryPerActiveMonth: null, diffPerActiveMonth: null, activityContinuity: null
    };
    if (!sufficient) {
      return { ...person, effectiveContributionScore: null, productivityProxyScore: null,
        combinedContributionScore: null, evidenceCoveragePercent: 0, components: emptyComponents };
    }
    const delivery = scaled(person.materialCommits, matP75);
    const technical = scaled(person.boundedDiffCredit, diffP75);
    const support = person.materialCommits > 0
      ? Math.min(100, (100 * person.supportedCommits / person.materialCommits) / ICE_GIT_POLICY.supportRatioTarget)
      : 0;
    const mappedPerson = canCompareCollaboration &&
      person.mergedPullRequests !== null && person.reviewedPullRequests !== null;
    const collaboration = mappedPerson
      ? (scaled(person.mergedPullRequests!, mergedP75 ?? 0) +
         scaled(person.reviewedPullRequests!, reviewedP75 ?? 0)) / 2
      : null;
    const base = delivery * ICE_GIT_POLICY.deliveryWeight +
      technical * ICE_GIT_POLICY.technicalWeight + support * ICE_GIT_POLICY.supportWeight;

    const paceDelivery = scaled(materialPerMonth(person), materialRateP75);
    const paceDiff = scaled(diffPerMonth(person), diffRateP75);
    const continuity = maxMonths > 0 ? 100 * person.activeMonths / maxMonths : 0;
    // Generated-only / cosmetic-only work must never gain throughput credit.
    const productivity = person.materialCommits === 0 || person.boundedDiffCredit === 0
      ? 0 : 0.30 * paceDelivery + 0.50 * paceDiff + 0.20 * continuity;

    return {
      ...person,
      effectiveContributionScore: rounded(base / coreWeight),
      productivityProxyScore: rounded(productivity),
      combinedContributionScore: collaboration === null ? null :
        rounded(base + collaboration * ICE_GIT_POLICY.collaborationWeight),
      evidenceCoveragePercent: collaboration === null ? 85 : 100,
      components: {
        integratedDelivery: rounded(delivery), technicalDiff: rounded(technical),
        testDocs: rounded(support),
        githubCollaboration: collaboration === null ? null : rounded(collaboration),
        deliveryPerActiveMonth: rounded(paceDelivery),
        diffPerActiveMonth: rounded(paceDiff),
        activityContinuity: rounded(continuity)
      }
    };
  });

  return {
    methodology: ICE_GIT_POLICY.methodology,
    productivityMethodology: ICE_GIT_POLICY.productivityMethodology,
    status: statusOverride ?? (sufficient ? "ok" : "insufficient_cohort"),
    policy: ICE_GIT_POLICY,
    references: {
      cohortSize: signals.length,
      materialCommitsP75: rounded(matP75), boundedDiffCreditP75: rounded(diffP75),
      materialCommitsPerActiveMonthP75: rounded(materialRateP75),
      diffCreditPerActiveMonthP75: rounded(diffRateP75),
      mergedPullRequestsP75: mergedP75 === null ? null : rounded(mergedP75),
      reviewedPullRequestsP75: reviewedP75 === null ? null : rounded(reviewedP75),
      collaborationMapped: mapped.length
    },
    contributors,
    warnings: [
      "Scores are experimental relative Git evidence indices, not objective human productivity or software quality.",
      "Compare only comparable roles, scopes and time periods. P75 is cohort-dependent.",
      "Commit splitting, missing review evidence, squash attribution and work outside Git may bias both scores."
    ]
  };
}
