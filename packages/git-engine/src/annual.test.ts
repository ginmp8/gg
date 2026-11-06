import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeAnnualBatch, categorizeChange, readAnnualReference } from "./annual";

function run(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}
function commit(root: string, message: string): string {
  run(root, ["add", "-A"]);
  run(root, ["-c", "user.name=Test Author", "-c", "user.email=author@example.test", "commit", "-m", message]);
  return run(root, ["rev-parse", "HEAD"]);
}

describe("annual Git diff metrics", () => {
  it("classifies source, test, documentation, and generated paths", () => {
    expect(categorizeChange("src/logic.ts")).toBe("source");
    expect(categorizeChange("tests/logic.test.ts")).toBe("test");
    expect(categorizeChange("docs/guide.md")).toBe("docs");
    expect(categorizeChange("package-lock.json")).toBe("generated");
    expect(categorizeChange("src/App.Tests.cs")).toBe("test");
  });

  it("separates substantive diffs, whitespace changes, and pure renames", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-annual-git-"));
    try {
      execFileSync("git", ["init", "--initial-branch=main", root], { stdio: "ignore" });
      fs.mkdirSync(path.join(root, "src"));
      fs.writeFileSync(path.join(root, "src", "main.ts"), "const answer=42;\n");
      const first = commit(root, "initial source");

      fs.writeFileSync(path.join(root, "src", "main.ts"), "const answer = 42;\n");
      const whitespace = commit(root, "format only");

      run(root, ["mv", "src/main.ts", "src/renamed.ts"]);
      const moved = commit(root, "pure rename");

      fs.writeFileSync(path.join(root, "src", "renamed.ts"), "const answer = 43;\n");
      fs.mkdirSync(path.join(root, "tests"));
      fs.writeFileSync(path.join(root, "tests", "main.test.ts"), "expect(43).toBe(43);\n");
      const substantive = commit(root, "change behavior and test");

      const reference = await readAnnualReference(root, "main");
      expect(reference.ref).toBe("refs/heads/main");
      expect(reference.hashes).toHaveLength(4);
      const measured = await analyzeAnnualBatch(root, [first, whitespace, moved, substantive]);
      const byHash = new Map(measured.map((row) => [row.hash, row]));
      expect(byHash.get(first)?.substantiveCommits).toBe(1);
      expect(byHash.get(whitespace)?.grossChurn).toBeGreaterThan(0);
      expect(byHash.get(whitespace)?.adjustedChurn).toBe(0);
      expect(byHash.get(whitespace)?.cosmeticOnlyCommits).toBe(1);
      expect(byHash.get(moved)?.movedFiles).toBe(1);
      expect(byHash.get(moved)?.pureMoves).toBe(1);
      expect(byHash.get(moved)?.estimatedMoveChurn).toBeGreaterThan(0);
      expect(byHash.get(substantive)?.substantiveCommits).toBe(1);
      expect(byHash.get(substantive)?.testTouchedCommits).toBe(1);
      expect(byHash.get(substantive)?.testChurn).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses shallow clones rather than reporting a full annual history", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-annual-shallow-"));
    const original = path.join(root, "original");
    const shallow = path.join(root, "shallow");
    fs.mkdirSync(original);
    try {
      execFileSync("git", ["init", "--initial-branch=main", original], { stdio: "ignore" });
      fs.writeFileSync(path.join(original, "code.ts"), "const x = 1;\n");
      commit(original, "initial");
      fs.writeFileSync(path.join(original, "code.ts"), "const x = 2;\n");
      commit(original, "second");
      execFileSync("git", ["clone", "--quiet", "--depth", "1", "file://" + original, shallow]);
      expect(run(shallow, ["rev-parse", "--is-shallow-repository"])).toBe("true");
      await expect(readAnnualReference(shallow, "main")).rejects.toThrow(/Shallow Git clone/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
