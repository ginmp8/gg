import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createProject, createRepositoryRecord, getAnnualReport, openGGDatabase,
  saveAnnualCollaboration, storeRepositoryAnalysis, upsertAnnualIdentity
} from "@gg/db";
import { analyzeRepository, ensureMirrorRepository } from "@gg/git-engine";
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-annual-index-"));
    const original = path.join(root, "original");
    fs.mkdirSync(original);
    execFileSync("git", ["init", "--initial-branch=main", original], { stdio: "ignore" });
    const database = openGGDatabase(root);
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

  it("scores material authors and generated-only changes from persisted file diffs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-"));
    const original = path.join(root, "original");
    fs.mkdirSync(original);
    execFileSync("git", ["init", "--initial-branch=main", original], { stdio: "ignore" });
    const database = openGGDatabase(root);
    try {
      const project = await createProject(database, { name: "Evidence fixture" });
      const repo = await createRepositoryRecord(database, project.id, {
        name: "test", fetchUrl: original, localPath: original, provider: "local", githubOwnerRepo: null
      });
      for (const [author, name, value] of [
        ["alpha", "a.py", "x = 1\n"], ["beta", "b.py", "x = 2\n"],
        ["gamma", "c.py", "x = 3\n"], ["cosmetic", "package-lock.json", "{\"lockfileVersion\":3}\n"]
      ]) {
        fs.writeFileSync(path.join(original, name), value);
        git(original, ["add", "-A"]);
        git(original, ["-c", "user.name=" + author, "-c", "user.email=" + author + "@example.test",
          "commit", "-m", "Add " + name]);
      }
      await ensureMirrorRepository({
        fetchUrl: original, cachePath: repo.cachePath, reposRoot: database.paths.reposDir
      });
      storeRepositoryAnalysis(database, repo, await analyzeRepository(repo.cachePath));
      expect((await indexAnnualRepository(database, repo)).newCommits).toBe(4);
      const initial = getAnnualReport(database, project.id, 2026);
      expect(initial.evidenceScores.status).toBe("ok");
      const scores = new Map(initial.evidenceScores.contributors.map((row) => [row.email, row]));
      expect(scores.get("alpha@example.test")?.effectiveContributionScore).toBeGreaterThan(0);
      expect(scores.get("cosmetic@example.test")?.effectiveContributionScore).toBe(0);
      expect(scores.get("cosmetic@example.test")?.productivityProxyScore).toBe(0);
      expect(scores.get("alpha@example.test")?.fileEvidence.some((file) => file.path === "a.py")).toBe(true);
      expect(scores.get("alpha@example.test")?.combinedContributionScore).toBeNull();
      expect((await indexAnnualRepository(database, repo)).newCommits).toBe(0);
      expect(getAnnualReport(database, project.id, 2026).evidenceScores).toEqual(initial.evidenceScores);
    } finally {
      database.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
  it("indexes over 500 commits without truncation and reuses every cached SHA", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-annual-over-500-"));
    const original = path.join(root, "original");
    fs.mkdirSync(original);
    execFileSync("git", ["init", "--initial-branch=main", original], { stdio:"ignore" });
    const count = 521;
    const stream = ["blob", "mark :1", "data 1", "x"];
    for (let index=0; index<count; index++) {
      const message = "Annual commit " + index;
      stream.push("commit refs/heads/main", "mark :" + (index+2),
        "author Historical Author <history@example.test> 1780000000 +0000",
        "committer Historical Author <history@example.test> 1780000000 +0000",
        "data " + Buffer.byteLength(message), message);
      if (index > 0) stream.push("from :" + (index+1));
      stream.push("M 100644 :1 history.txt", "");
    }
    execFileSync("git", ["-C", original, "fast-import", "--quiet"],
      { input:stream.join("\n")+"\n", encoding:"utf8" });
    const db = openGGDatabase(root);
    try {
      const project = await createProject(db, { name:"Large annual history" });
      const repo = await createRepositoryRecord(db,project.id,{
        name:"history",fetchUrl:original,localPath:original,
        provider:"local",githubOwnerRepo:null
      });
      await ensureMirrorRepository({
        fetchUrl:original, cachePath:repo.cachePath, reposRoot:db.paths.reposDir
      });
      const first = await indexAnnualRepository(db,repo);
      expect(first.reachableCommits).toBe(count);
      expect(first.newCommits).toBe(count);
      expect(first.reusedCommits).toBe(0);
      const report = getAnnualReport(db,project.id,2026);
      expect(report.complete).toBe(true);
      expect(report.totals.commits).toBe(count);
      expect(report.coverage[0]?.eligibleCommits).toBe(count);
      const second = await indexAnnualRepository(db,repo);
      expect(second.newCommits).toBe(0);
      expect(second.reusedCommits).toBe(count);
      const cached = db.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM annual_commit_metrics WHERE repo_id=?"
      ).get(repo.id) as {count:number};
      expect(cached.count).toBe(count);
    } finally {
      db.sqlite.close();
      fs.rmSync(root,{recursive:true,force:true});
    }
  }, 60_000);


});
