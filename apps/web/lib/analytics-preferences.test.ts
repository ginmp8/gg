import { describe, expect, it } from "vitest";
import {
  currentYearToDate, parseComparisonPreferences, parseDashboardScopePreference,
  toggleAllMatching
} from "./analytics-preferences";

describe("local analytics preferences and bulk comparison selection", () => {
  it("defaults the dashboard to January 1 through today's local date across year boundaries", () => {
    expect(currentYearToDate(new Date(2026, 10, 6))).toEqual({
      from: "2026-01-01", to: "2026-11-06"
    });
    expect(currentYearToDate(new Date(2027, 0, 1))).toEqual({
      from: "2027-01-01", to: "2027-01-01"
    });
  });
  it("selects every matching person beyond the former 4-person cap and toggles only visible matches", () => {
    const all = Array.from({length:61},(_,i)=>"person"+i+"@example.test");
    const chosen = toggleAllMatching(["outsider@example.test"],all);
    expect(chosen).toHaveLength(62);
    expect(new Set(chosen).size).toBe(62);
    expect(toggleAllMatching(chosen,all)).toEqual(["outsider@example.test"]);
    expect(toggleAllMatching([],[])).toEqual([]);
    expect(toggleAllMatching(chosen,all.slice(0,5))).toHaveLength(57);
  });
  it("retains selections per year and rejects corrupt saved browser values", () => {
    const saved = parseComparisonPreferences({
      year: 2025, tagId: "team-a", search: "ada",
      selections: {"2025":["ada@example.test","ada@example.test","bob@example.test"],
        "2026":["c@example.test"], "invalid":["x@example.test"]}
    },2026);
    expect(saved).toEqual({
      year:2025,tagId:"team-a",search:"ada",
      selections:{"2025":["ada@example.test","bob@example.test"],"2026":["c@example.test"]}
    });
    expect(parseComparisonPreferences({year:"2026",selections:[]},2026)).toEqual({
      year:2026,tagId:"",search:"",selections:{}
    });
    expect(parseDashboardScopePreference({
      projectId:"project-1",repositoryId:"repo-2",metric:"churn"
    })).toEqual({projectId:"project-1",repositoryId:"repo-2",metric:"churn"});
    expect(parseDashboardScopePreference({projectId:123,repositoryId:"repo-2",metric:"commits"}))
      .toBeNull();
  });
});
