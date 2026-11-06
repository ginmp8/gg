import { describe, expect, it } from "vitest";
import { hasAllTags, tagsForTarget, type TagsSnapshot } from "./tags";

describe("custom tag predicates", () => {
  it("filters matching contributor emails and allows multiple assigned tags", () => {
    const snapshot: TagsSnapshot = {
      items: [],
      assignments: [
        {tagId:"team-a",targetType:"contributor",targetKey:"user@example.test"},
        {tagId:"role-b",targetType:"contributor",targetKey:"user@example.test"},
        {tagId:"team-a",targetType:"repository",targetKey:"repo-1"}
      ]
    };
    expect(tagsForTarget(snapshot,"contributor","USER@example.test")).toEqual(["team-a","role-b"]);
    expect(hasAllTags(snapshot,"contributor","user@example.test",["team-a","role-b"])).toBe(true);
    expect(hasAllTags(snapshot,"contributor","user@example.test",["role-c"])).toBe(false);
    expect(hasAllTags(snapshot,"repository","repo-1",["role-b"])).toBe(false);
    expect(hasAllTags(snapshot,"branch","repo-1:main",[])).toBe(true);
  });
});
