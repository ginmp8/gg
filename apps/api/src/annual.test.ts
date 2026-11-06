import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createProject, createRepositoryRecord, getAnnualReport, openGitaDatabase,
  saveAnnualCollaboration, storeRepositoryAnalysis, upsertAnnualIdentity
} from "@gita/db";
import { analyzeRepository, ensureMirrorRepository } from "@gita/git-engine";
import { describe, expect, it } from "vitest";

import { indexAnnualRepository } from "./annual";

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: "2026-02-03T10:00:00+00:00",
      GIT_COMMITTER_DATE: "2026-02-03T10:00:00+00:00" }
  }).trim();
}

function commit(root: string, name: string, message: string): string {
  fs.writeFileSync(path.join(root, name), message + "\n");
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.name=Developer", "-c", "user.email=dev@example.test", "commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

describe("full-year SQLite annual contribution index", () => {
  it("indexes all reachable SHAs, reuses metrics, and reconciles force-updated references", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-annual-index-"));
    const original = path.join(root, "original");
    fs.mkdirSync(original);
    execFileSync("git", ["init", "--initial-branch=main", original], { stdio: "ignore" });
    const database = openGitaDatabase(root);
    try {
      const project = await createProject(database, { name: "Annual fixture" });
      const repo = await createRepositoryRecord(database, project.id, {
        name: "repository", fetchUrl: original, localPath: original,
        provider: "local", githubOwnerRepo: null
      });

      const first = commit(original, "one.ts", "first");
      const second = commit(original, "two.ts", "second");
      await ensureMirrorRepository({
        fetchUrl: original, cachePath: repo.cachePath, reposRoot: database.paths.reposDir
      });
      storeRepositoryAnalysis(database, repo, await analyzeRepository(repo.cachePath));

      const initial = await indexAnnualRepository(database, repo);
      expect(initial.reachableCommits).toBe(2);
      expect(initial.newCommits).toBe(2);
      const repeated = await indexAnnualRepository(database, repo);
      expect(repeated.newCommits).toBe(0);
      expect(repeated.reusedCommits).toBe(2);
      const report = getAnnualReport(database, project.id, 2026);
      expect(report.complete).toBe(true);
      expect(report.totals.commits).toBe(2);
      expect(report.contributors).toHaveLength(1);

      const third = commit(original, "third.test.ts", "third");
      await ensureMirrorRepository({
        fetchUrl: original, cachePath: repo.cachePath, reposRoot: database.paths.reposDir
      });
      storeRepositoryAnalysis(database, repo, await analyzeRepository(repo.cachePath));
      expect((await indexAnnualRepository(database, repo)).newCommits).toBe(1);
      expect(getAnnualReport(database, project.id, 2026).totals.testTouchedCommits).toBe(1);

      git(original, ["reset", "--hard", second]);
      await ensureMirrorRepository({
        fetchUrl: original, cachePath: repo.cachePath, reposRoot: database.paths.reposDir
      });
      storeRepositoryAnalysis(database, repo, await analyzeRepository(repo.cachePath));
      const afterMove = await indexAnnualRepository(database, repo);
      expect(afterMove.reachableCommits).toBe(2);
      expect(afterMove.newCommits).toBe(0);
      expect(getAnnualReport(database, project.id, 2026).totals.commits).toBe(2);

      git(original, ["reset", "--hard", third]);
      await ensureMirrorRepository({
        fetchUrl: original, cachePath: repo.cachePath, reposRoot: database.paths.reposDir
      });
      storeRepositoryAnalysis(database, repo, await analyzeRepository(repo.cachePath));
      const restored = await indexAnnualRepository(database, repo);
      expect(restored.newCommits).toBe(0);
      expect(restored.reachableCommits).toBe(3);

      upsertAnnualIdentity(database, project.id, {
        email: "dev@example.test", canonicalEmail: "dev@example.test", githubLogin: "developer"
      });
      saveAnnualCollaboration(database, repo.id, {
        complete: true,
        pullRequests: [{
          number: 7, authorLogin: "developer",
          mergedAt: "2026-04-01T00:00:00Z", url: "https://github.com/example/fixture/pull/7",
          reviews: [{ reviewerLogin: "developer", state: "APPROVED", submittedAt: "2026-04-01T00:00:00Z" }]
        }]
      });
      const collaborated = getAnnualReport(database, project.id, 2026);
      expect(collaborated.contributors[0]?.mergedPullRequests).toBe(1);
      expect(collaborated.contributors[0]?.reviewedPullRequests).toBe(1);
      expect(collaborated.contributors[0]?.approvedPullRequests).toBe(1);
      const cacheCount = database.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM annual_commit_metrics WHERE repo_id = ?"
      ).get(repo.id) as { count: number };
      expect(cacheCount.count).toBe(3);
      expect([first, second, third]).toHaveLength(3);
    } finally {
      database.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
