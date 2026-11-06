import type { AnnualReport } from "@gg/core";
import { describe, expect, it } from "vitest";
import { buildContributorRankings, rankMetric } from "./contributor-rankings";

function fixture(complete = true, status = "ok") {
  return {
    complete,
    contributors: [
      { primaryEmail: "ada@example.test", displayName: "Ada", commits: 14 },
      { primaryEmail: "bo@example.test", displayName: "Bo", commits: 8 },
      { primaryEmail: "cy@example.test", displayName: "Cy", commits: 4 },
      { primaryEmail: "di@example.test", displayName: "Di", commits: 0 }
    ],
    evidenceScores: {
      status,
      contributors: [
        { email: "ada@example.test", effectiveContributionScore: 88, productivityProxyScore: 70,
          components: { integratedDelivery: 95, technicalDiff: 70, testDocs: 55, activityContinuity: 60, githubCollaboration: null } },
        { email: "bo@example.test", effectiveContributionScore: 88, productivityProxyScore: 90,
          components: { integratedDelivery: 75, technicalDiff: 80, testDocs: 65, activityContinuity: 55, githubCollaboration: null } },
        { email: "cy@example.test", effectiveContributionScore: 42, productivityProxyScore: 75,
          components: { integratedDelivery: 25, technicalDiff: 40, testDocs: 90, activityContinuity: 100, githubCollaboration: null } },
        { email: "di@example.test", effectiveContributionScore: null, productivityProxyScore: null,
          components: { integratedDelivery: null, technicalDiff: null, testDocs: null, activityContinuity: null, githubCollaboration: null } }
      ]
    }
  } as unknown as AnnualReport;
}

describe("executive contributor ranking", () => {
  it("uses the full scored cohort, competition ties and stable identities", () => {
    const ranked = buildContributorRankings(fixture());
    expect(ranked.available).toBe(true);
    expect(rankMetric(ranked, "ada@example.test", "overall")).toMatchObject({ rank: 1, value: 88, cohort: 3 });
    expect(rankMetric(ranked, "bo@example.test", "overall")).toMatchObject({ rank: 1, value: 88, cohort: 3 });
    expect(rankMetric(ranked, "cy@example.test", "overall")).toMatchObject({ rank: 3, value: 42, cohort: 3 });
    expect(rankMetric(ranked, "di@example.test", "overall")).toBeNull();
    expect(rankMetric(ranked, "bo@example.test", "throughput")).toMatchObject({ rank: 1, cohort: 3 });
    expect(rankMetric(ranked, "cy@example.test", "support")).toMatchObject({ rank: 1, cohort: 3 });
    expect(rankMetric(ranked, "ada@example.test", "collaboration")).toBeNull();
    expect(rankMetric(ranked, "ada@example.test", "commits")).toMatchObject({ rank: 1, cohort: 4 });
  });
  it("withholds rankings when annual coverage is incomplete", () => {
    const ranked = buildContributorRankings(fixture(false));
    expect(ranked.available).toBe(false);
    expect(rankMetric(ranked, "ada@example.test", "overall")).toBeNull();
    expect(rankMetric(ranked, "ada@example.test", "commits")).toBeNull();
  });
  it("does not fabricate overall scores when the cohort is too small", () => {
    const ranked = buildContributorRankings(fixture(true, "insufficient_cohort"));
    expect(rankMetric(ranked, "ada@example.test", "overall")).toBeNull();
    expect(rankMetric(ranked, "ada@example.test", "commits")).toMatchObject({ rank: 1 });
  });
});
