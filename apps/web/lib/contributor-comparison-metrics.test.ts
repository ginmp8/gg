import { describe, expect, it } from "vitest";
import { ANNUAL_FIELD_KEYS, COMPARISON_METRIC_GROUPS, formatComparisonValue } from "./contributor-comparison-metrics";

describe("complete contributor comparison metric catalog", () => {
  it("includes all annual numeric metrics, score components, rates, collaboration and monthly distributions", () => {
    const expected = [
      "commits","activeDays","grossChurn","renameAwareChurn","adjustedChurn",
      "estimatedMoveChurn","estimatedWhitespaceChurn","sourceChurn","testChurn",
      "docsChurn","generatedChurn","reviewableChurn","movedFiles","pureMoves",
      "binaryFiles","substantiveCommits","cosmeticOnlyCommits","testTouchedCommits",
      "repositories","substantiveRate","retainedChurnRate","testTouchedRate",
      "mergedPullRequests","reviewedPullRequests","approvedPullRequests","githubLogin",
      "firstActivity","lastActivity","primaryEmail",
      "effectiveContributionScore","productivityProxyScore","combinedContributionScore",
      "evidenceCoveragePercent","materialCommits","boundedDiffCredit","supportedCommits","activeMonths",
      "component.integratedDelivery","component.technicalDiff","component.testDocs",
      "component.githubCollaboration","component.deliveryPerActiveMonth",
      "component.diffPerActiveMonth","component.activityContinuity",
      "monthsWithCommits","peakMonthlyCommits","monthlyAdjustedChurn","monthlyReviewableChurn",
      "monthlyTestTouches"
    ];
    expect(new Set(ANNUAL_FIELD_KEYS).size).toBe(ANNUAL_FIELD_KEYS.length);
    for (const key of expected) expect(ANNUAL_FIELD_KEYS).toContain(key);
    expect(COMPARISON_METRIC_GROUPS.length).toBeGreaterThanOrEqual(6);
    expect(ANNUAL_FIELD_KEYS.length).toBeGreaterThanOrEqual(55);
  });
  it("does not confuse unavailable collaboration evidence with zero", () => {
    expect(formatComparisonValue(null,"number")).toBe("N/A");
    expect(formatComparisonValue(0,"number")).toBe("0");
    expect(formatComparisonValue(12.345,"percent")).toBe("12.3%");
    expect(formatComparisonValue(1.234,"decimal")).toBe("1.23");
  });
});
