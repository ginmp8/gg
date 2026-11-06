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
    "-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
    "commit", "-m", "initial"
  ], { stdio: "ignore" });
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
});
