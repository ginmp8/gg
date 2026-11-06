import { describe, expect, it } from "vitest";

import { annualCsv, csvCell } from "./annual-export";
import type { AnnualReport } from "@gita/core";

describe("annual CSV export", () => {
  it("neutralizes spreadsheet formulas in commit author names and email fields", () => {
    expect(csvCell('=IMPORTXML("https://example.invalid")')).toBe(
      `"'=IMPORTXML(""https://example.invalid"")"`
    );
    expect(csvCell("  +1+1")).toBe(`"'  +1+1"`);
    expect(csvCell("-SUM(1,2)")).toBe(`"'-SUM(1,2)"`);
    expect(csvCell("normal")).toBe(`"normal"`);
  });

  it("exports unambiguous empty PR cells rather than invented zeroes", () => {
    const report: AnnualReport = {
      projectId: "project", year: 2026, complete: false, coverage: [],
      totals: {
        commits: 1, activeDays: 1, grossChurn: 1, renameAwareChurn: 1,
        adjustedChurn: 1, estimatedMoveChurn: 0, estimatedWhitespaceChurn: 0,
        sourceChurn: 1, testChurn: 0, docsChurn: 0, generatedChurn: 0,
        reviewableChurn: 1, movedFiles: 0, pureMoves: 0, binaryFiles: 0,
        substantiveCommits: 1, cosmeticOnlyCommits: 0, testTouchedCommits: 0
      },
      contributors: [], monthly: []
    };
    const result = annualCsv(report);
    expect(result).toContain("Merged PRs (optional)");
    expect(result.split("\r\n").length).toBe(2);
  });
});
