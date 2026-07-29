import { describe, expect, it } from "vitest";

import { parseGitLog, parseNumstatLine } from "./parser";

describe("git log parser", () => {
  it("parses commits, numstat rows, renames, and binary files", () => {
    const header = [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "aaaaaaa",
      "Ada",
      "ada@example.com",
      "2026-01-02T10:00:00+00:00",
      "Ada",
      "ada@example.com",
      "2026-01-02T10:01:00+00:00",
      "Subject",
      "Body",
      ""
    ].join("\0");
    const output = `\x1e${header}\0${[
      "12\t2\tsrc/index.ts",
      "0\t1\tsrc/{old.ts => new.ts}",
      "-\t-\tassets/logo.png"
    ].join("\n")}\n`;

    const parsed = parseGitLog(output);

    expect(parsed.commits).toHaveLength(1);
    expect(parsed.commits[0]).toMatchObject({
      shortHash: "aaaaaaa",
      insertions: 12,
      deletions: 3,
      filesChanged: 3,
      isMerge: false
    });
    expect(parsed.fileStats[1]).toMatchObject({
      oldPath: "src/old.ts",
      path: "src/new.ts",
      status: "renamed"
    });
    expect(parsed.fileStats[2]).toMatchObject({
      isBinary: true,
      insertions: 0,
      deletions: 0,
      extension: "png"
    });
  });

  it("detects simple rename paths", () => {
    expect(parseNumstatLine("1\t2\told/path.ts => new/path.ts")).toMatchObject({
      oldPath: "old/path.ts",
      path: "new/path.ts"
    });
  });
});
