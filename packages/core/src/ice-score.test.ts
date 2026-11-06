import { describe, expect, it } from "vitest";
import { scoreIceCohort, type IceSignal } from "./ice-score";

function item(email: string, material: number, diff: number, months = 6, commits = material): IceSignal {
  return {
    email, displayName: email, commits, materialCommits: material, boundedDiffCredit: diff,
    supportedCommits: Math.floor(material / 5), activeMonths: months,
    mergedPullRequests: null, reviewedPullRequests: null, fileEvidence: []
  };
}

describe("ICE-Git/1 and GG-Throughput/1", () => {
  it("does not reward high-volume cosmetic or generated-only contributions", () => {
    const cohort = [item("cosmetic@test.com", 0, 0, 12, 8000),
      item("a@test.com", 100, 80), item("b@test.com", 80, 65),
      item("c@test.com", 60, 50), item("d@test.com", 75, 55)];
    const result = scoreIceCohort(cohort);
    expect(result.status).toBe("ok");
    expect(result.contributors[0]?.effectiveContributionScore).toBe(0);
    expect(result.contributors[0]?.productivityProxyScore).toBe(0);
    expect(result.contributors[1]?.effectiveContributionScore).toBeGreaterThan(0);
    expect(result.contributors[1]?.combinedContributionScore).toBeNull();
  });

  it("saturates cohort-relative evidence scores despite an outlier", () => {
    const cohort = [item("a@test.com", 8000, 7600), item("b@test.com", 950, 850),
      item("c@test.com", 1100, 1000), item("d@test.com", 1050, 950)];
    const scored = scoreIceCohort(cohort).contributors;
    expect((scored[0]?.effectiveContributionScore ?? 0) - (scored[1]?.effectiveContributionScore ?? 0)).toBeLessThan(15);
    expect(scored.every((item) => (item.effectiveContributionScore ?? 0) <= 100)).toBe(true);
  });

  it("keeps optional PR collaboration unknown until the complete mapped snapshot exists", () => {
    const cohort = [item("a@test.com", 10, 5), item("b@test.com", 9, 4), item("c@test.com", 8, 3)];
    cohort[0]!.mergedPullRequests = 3; cohort[0]!.reviewedPullRequests = 5;
    cohort[1]!.mergedPullRequests = 2; cohort[1]!.reviewedPullRequests = 2;
    cohort[2]!.mergedPullRequests = 0; cohort[2]!.reviewedPullRequests = 0;
    const absent = scoreIceCohort(cohort, false);
    expect(absent.contributors.every((row) => row.combinedContributionScore === null)).toBe(true);
    const done = scoreIceCohort(cohort, true);
    expect(done.contributors.every((row) => row.combinedContributionScore !== null)).toBe(true);
    expect(done.contributors.every((row) => row.evidenceCoveragePercent === 100)).toBe(true);
  });

  it("does not infer ranking from an incomplete history or a two-person group", () => {
    const rows = [item("a@test.com", 3, 2), item("b@test.com", 2, 1)];
    expect(scoreIceCohort(rows).status).toBe("insufficient_cohort");
    expect(scoreIceCohort(rows, false, "incomplete_history").contributors[0]?.effectiveContributionScore).toBeNull();
  });

  it("rejects fabricated counts and preserves 50-developer deterministic comparisons", () => {
    expect(() => scoreIceCohort([item("invalid@test.com", 12, -1)])).toThrow();
    const rows = Array.from({ length: 50 }, (_, i) => item("dev" + i + "@test.com", 10 + i, 5 + i, 2 + i % 10));
    const first = scoreIceCohort(rows);
    expect(first.references.cohortSize).toBe(50);
    expect(scoreIceCohort(rows)).toEqual(first);
    expect(first.contributors.every((row) => Number.isFinite(row.productivityProxyScore))).toBe(true);
  });
});
