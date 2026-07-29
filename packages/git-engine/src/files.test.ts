import { describe, expect, it } from "vitest";

import { applyLineCounts, parseGrepLineCounts, parseLsTreeFiles } from "./files";

describe("repository file inventory parsing", () => {
  it("parses ls-tree files and applies grep line counts", () => {
    const updatedAt = "2026-06-11T10:00:00.000Z";
    const files = parseLsTreeFiles(
      [
        "100644 blob abc123      42\tsrc/app.ts",
        "100644 blob def456       0\tREADME",
        "100644 blob fed789    2000\tassets/logo.png"
      ].join("\0"),
      updatedAt
    );
    const counts = parseGrepLineCounts("refs/heads/dev:src/app.ts:12\nrefs/heads/dev:README:0\n", "refs/heads/dev");

    expect(applyLineCounts(files, counts)).toEqual([
      {
        path: "src/app.ts",
        extension: "ts",
        topLevelDirectory: "src",
        byteSize: 42,
        lineCount: 12,
        isBinary: false,
        updatedAt
      },
      {
        path: "README",
        extension: null,
        topLevelDirectory: null,
        byteSize: 0,
        lineCount: 0,
        isBinary: false,
        updatedAt
      },
      {
        path: "assets/logo.png",
        extension: "png",
        topLevelDirectory: "assets",
        byteSize: 2000,
        lineCount: null,
        isBinary: true,
        updatedAt
      }
    ]);
  });
});
