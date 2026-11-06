import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
  createProject,
  createRepositoryRecord,
  getProjectSummary,
  getRefreshRun,
  listRepositories,
  openGGDatabase
} from "@gg/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "./server";

function createSource(root: string, name: string): string {
  const source = path.join(root, name);
  execFileSync("git", ["init", "--initial-branch=main", source], { stdio: "ignore" });
  fs.writeFileSync(path.join(source, "README.md"), `# ${name}\n`);
  execFileSync("git", ["-C", source, "add", "README.md"], { stdio: "ignore" });
  execFileSync("git", [
    "-C", source, "-c", "user.name=Fixture", "-c", `user.email=${name}@example.test`,
    "commit", "-m", "initial"
  ], {
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-02-03T10:00:00+00:00",
      GIT_COMMITTER_DATE: "2026-02-03T10:00:00+00:00"
    }
  });
  return source;
}

afterEach(() => vi.unstubAllEnvs());

describe("explicit project refresh network consent", () => {
  it("refreshes two registered remotes without global Git opt-in, including cached mirrors", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-refresh-"));
    vi.stubEnv("GG_ALLOW_REMOTE_GIT", "");
    vi.stubEnv("GG_OFFLINE", "0");
    vi.stubEnv("GG_ALLOW_GITHUB_METADATA", "0");
    const database = openGGDatabase(root);
    const server = await buildServer(database);

    try {
      const project = await createProject(database, { name: "Two remote repositories" });
      const sources = [
        createSource(root, "repo-one"),
        createSource(root, "repo-two")
      ];
      for (const [index, source] of sources.entries()) {
        await createRepositoryRecord(database, project.id, {
          fetchUrl: pathToFileURL(source).href,
          name: `repo-${index + 1}`,
          provider: "unknown",
          localPath: null,
          githubOwnerRepo: null
        });
      }

      async function refreshProject(): Promise<void> {
        // Real POST endpoint: a deliberate user action authorizes this
        // refresh, not arbitrary Git commands or implicit page loads.
        const response = await server.inject({
          method: "POST",
          url: `/api/projects/${project.id}/refresh`
        });
        expect(response.statusCode).toBe(202);
        const runId = response.json().id as string;
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline) {
          const run = await getRefreshRun(database, runId);
          if (run?.status === "succeeded" || run?.status === "failed") {
            expect(run.status, run.errorMessage ?? undefined).toBe("succeeded");
            expect(run.progressTotal).toBe(2);
            expect(run.progressCompleted).toBe(2);
            return;
          }
          await sleep(30);
        }
        throw new Error("Project refresh did not reach a terminal state");
      }

      await refreshProject();
      expect((await getProjectSummary(database, project.id)).commits).toBe(2);

      // Compare must use every indexed repository when the repository filter
      // is omitted, and only the requested repository when it is supplied.
      const allResponse = await server.inject({
        method: "GET",
        url: `/api/projects/${project.id}/annual?year=2026`
      });
      expect(allResponse.statusCode).toBe(200);
      const all = allResponse.json() as {
        complete: boolean;
        coverage: Array<{ repoId: string; complete: boolean }>;
        contributors: Array<{ primaryEmail: string; commits: number; repositories: number }>;
        totals: { commits: number };
        evidenceScores: { status: string };
      };
      const projectRepos = await listRepositories(database, project.id);
      expect(all.complete).toBe(true);
      // Successful indexing is separate from the scoring cohort threshold.
      expect(all.evidenceScores.status).toBe("insufficient_cohort");
      expect(all.coverage.map((item) => item.repoId).sort()).toEqual(
        projectRepos.map((item) => item.id).sort()
      );
      expect(all.totals.commits).toBe(2);
      expect(all.contributors.map((item) => item.primaryEmail).sort()).toEqual([
        "repo-one@example.test", "repo-two@example.test"
      ]);
      for (const repo of projectRepos) {
        const response = await server.inject({
          method: "GET",
          url: `/api/projects/${project.id}/annual?year=2026&repositoryId=${repo.id}`
        });
        expect(response.statusCode).toBe(200);
        const report = response.json() as typeof all;
        expect(report.complete).toBe(true);
        expect(report.evidenceScores.status).toBe("insufficient_cohort");
        expect(report.coverage.map((item) => item.repoId)).toEqual([repo.id]);
        expect(report.totals.commits).toBe(1);
        expect(report.contributors.map((item) => item.primaryEmail)).toEqual([
          repo.name === "repo-1" ? "repo-one@example.test" : "repo-two@example.test"
        ]);
      }

      // Even if a cached origin is tampered with, refresh uses the
      // repository URL registered in GG, not the cache's stale origin.
      const [repo] = await listRepositories(database, project.id);
      execFileSync("git", [
        "-C", repo.cachePath, "remote", "set-url", "origin",
        "https://untrusted.example/private.git"
      ], { stdio: "ignore" });
      await refreshProject();
      expect((await getProjectSummary(database, project.id)).commits).toBe(2);
    } finally {
      await server.close();
      database.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 25_000);

  it("separates Git-only, local index, and combined sync without stale annual coverage", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-sync-modes-"));
    vi.stubEnv("GG_OFFLINE", "0");
    vi.stubEnv("GG_ALLOW_GITHUB_METADATA", "0");
    const database = openGGDatabase(root);
    const server = await buildServer(database);
    try {
      const project = await createProject(database, { name: "Sync modes fixture" });
      const source = createSource(root, "sync-source");
      await createRepositoryRecord(database, project.id, {
        fetchUrl: pathToFileURL(source).href, name: "source", provider: "unknown",
        localPath: null, githubOwnerRepo: null
      });

      async function run(endpoint: string, body?: object): Promise<void> {
        const response = await server.inject({
          method: "POST", url: endpoint, payload: body ?? {}
        });
        expect(response.statusCode).toBe(202);
        const runId = response.json().id as string;
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline) {
          const status = await getRefreshRun(database, runId);
          if (status?.status === "failed" || status?.status === "succeeded") {
            expect(status.status, status.errorMessage ?? undefined).toBe("succeeded");
            return;
          }
          await sleep(25);
        }
        throw new Error("Synchronization did not finish");
      }
      async function annual(): Promise<{ complete: boolean; totals: { commits: number } }> {
        const response = await server.inject({
          method: "GET", url: `/api/projects/${project.id}/annual?year=2026`
        });
        expect(response.statusCode).toBe(200);
        return response.json() as { complete: boolean; totals: { commits: number } };
      }

      await run(`/api/projects/${project.id}/refresh`, { indexAnnual: false });
      expect(await annual()).toMatchObject({ complete: false, totals: { commits: 0 } });

      await run(`/api/projects/${project.id}/annual/reindex`);
      expect(await annual()).toMatchObject({ complete: true, totals: { commits: 1 } });

      fs.writeFileSync(path.join(source, "new.ts"), "export const value = 2;\n");
      execFileSync("git", ["-C", source, "add", "new.ts"], { stdio: "ignore" });
      execFileSync("git", [
        "-C", source, "-c", "user.name=Fixture",
        "-c", "user.email=sync-source@example.test", "commit", "-m", "follow-up"
      ], {
        stdio: "ignore",
        env: { ...process.env, GIT_AUTHOR_DATE: "2026-03-01T10:00:00+00:00",
          GIT_COMMITTER_DATE: "2026-03-01T10:00:00+00:00" }
      });

      await run(`/api/projects/${project.id}/refresh`, { indexAnnual: false });
      // Old cached metrics remain inspectable but cannot claim complete coverage.
      expect(await annual()).toMatchObject({ complete: false, totals: { commits: 1 } });

      await run(`/api/projects/${project.id}/refresh`, { indexAnnual: true });
      expect(await annual()).toMatchObject({ complete: true, totals: { commits: 2 } });
    } finally {
      await server.close();
      database.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 25_000);
});
