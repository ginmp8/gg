import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeRepository, ensureMirrorRepository, resolveRepositoryInput } from "./repository";

describe("repository analysis", () => {
  it("rejects embedded HTTPS credentials unless deliberately enabled", () => {
    const previous = process.env.GITA_ALLOW_URL_CREDENTIALS;
    delete process.env.GITA_ALLOW_URL_CREDENTIALS;
    try {
      expect(() => resolveRepositoryInput("https://user:sample-pass@example.test/org/repo.git"))
        .toThrow(/embedded credentials/);
      expect(() => resolveRepositoryInput("https://example.test/org/repo.git?access_token=sample-token"))
        .toThrow(/embedded credentials/);
      expect(resolveRepositoryInput("https://example.test/org/repo.git").fetchUrl)
        .toBe("https://example.test/org/repo.git");
      process.env.GITA_ALLOW_URL_CREDENTIALS = "1";
      expect(resolveRepositoryInput("https://user:sample-pass@example.test/org/repo.git").fetchUrl)
        .toContain("sample-pass");
    } finally {
      if (previous === undefined) delete process.env.GITA_ALLOW_URL_CREDENTIALS;
      else process.env.GITA_ALLOW_URL_CREDENTIALS = previous;
    }
  });

  it("analyzes commits from all branches while keeping file inventory on the analysis branch", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gita-git-engine-"));
    try {
      const sourcePath = path.join(tmpDir, "source");
      const cachePath = path.join(tmpDir, "cache.git");

      git(["init", "--initial-branch=dev", sourcePath]);
      fs.writeFileSync(path.join(sourcePath, "README.md"), "base\n");
      git(["-C", sourcePath, "add", "README.md"]);
      git([
        "-C",
        sourcePath,
        "-c",
        "user.name=Ada",
        "-c",
        "user.email=ada@example.com",
        "commit",
        "-m",
        "base"
      ]);

      git(["-C", sourcePath, "checkout", "-b", "feature/extra"]);
      fs.writeFileSync(path.join(sourcePath, "feature.txt"), "feature\n");
      git(["-C", sourcePath, "add", "feature.txt"]);
      git([
        "-C",
        sourcePath,
        "-c",
        "user.name=Grace",
        "-c",
        "user.email=grace@example.com",
        "commit",
        "-m",
        "feature work"
      ]);
      git(["-C", sourcePath, "checkout", "dev"]);

      await ensureMirrorRepository({
        fetchUrl: sourcePath,
        cachePath,
        reposRoot: tmpDir
      });

      const analysis = await analyzeRepository(cachePath, "dev");

      expect(analysis.commits.map((commit) => commit.subject).sort()).toEqual([
        "base",
        "feature work"
      ]);
      expect(analysis.files.map((file) => file.path)).toEqual(["README.md"]);
      expect(analysis.branches.map((branch) => branch.name).sort()).toEqual([
        "dev",
        "feature/extra"
      ]);
      expect(analysis.commitBranches).toContainEqual(
        expect.objectContaining({
          branchName: "feature/extra",
          remote: null
        })
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function git(args: string[]): void {
  execFileSync("git", args, {
    stdio: "ignore"
  });
}
