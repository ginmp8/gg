import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compareLocalBranches } from "./compare";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}
function commit(root: string, filename: string, text: string): void {
  fs.writeFileSync(path.join(root, filename), text + "\n");
  git(root, "add", "-A");
  git(root, "-c", "user.name=Author", "-c", "user.email=author@example.test", "commit", "-m", text);
}

describe("local read-only branch comparison", () => {
  it("returns correct three-dot ahead/behind and a bounded list of changed files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-branch-compare-"));
    try {
      execFileSync("git", ["init", "--initial-branch=main", root], { stdio: "ignore" });
      commit(root, "common.txt", "common");
      git(root, "branch", "feature");
      commit(root, "main.txt", "main-only");
      git(root, "checkout", "feature");
      commit(root, "feature.txt", "feature-only");
      commit(root, "feature-second.txt", "feature-two");

      const result = await compareLocalBranches(root, "main", "feature", 1);
      expect(result.behind).toBe(1);
      expect(result.ahead).toBe(2);
      expect(result.totalChangedFiles).toBe(2);
      expect(result.files).toHaveLength(1);
      expect(result.truncated).toBe(true);
      expect(result.files[0]?.path).toMatch(/feature/);
      await expect(compareLocalBranches(root, "--upload-pack=evil", "feature")).rejects.toThrow(/Invalid branch/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
