import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createProject, listRepositories, openGitaDatabase } from "@gita/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "./server";

import { parseDiscoveredRepositories } from "./github-discovery";

describe("GitHub CLI repository discovery", () => {
  it("normalizes, de-duplicates, and sorts authorized HTTPS GitHub repositories", () => {
    const rows = [
      ["Org/Second", "https://github.com/Org/Second.git", true, false, "2026-01-01", "main"],
      ["team/first", "https://github.com/team/first.git", false, true, null, null],
      ["org/SECOND", "https://github.com/org/SECOND.git", true, false, null, "development"]
    ];
    const result = parseDiscoveredRepositories(rows.map((row) => JSON.stringify(row)).join("\n"));
    expect(result).toHaveLength(2);
    expect(result[0]?.fullName).toBe("org/SECOND");
    expect(result[0]?.defaultBranch).toBe("development");
    expect(result[1]?.archived).toBe(true);
  });

  it("rejects credential URLs, unexpected hosts, and over-limit output", () => {
    expect(() => parseDiscoveredRepositories(JSON.stringify([
      "user/repo", "https://evil.example/repo.git", true, false, null, "main"
    ]))).toThrow(/unapproved/);
    expect(() => parseDiscoveredRepositories(JSON.stringify([
      "user/repo", "https://token@github.com/user/repo.git", true, false, null, "main"
    ]))).toThrow(/unapproved/);
    expect(() => parseDiscoveredRepositories([
      JSON.stringify(["one/repo", "https://github.com/one/repo.git", false, false, null, "main"]),
      JSON.stringify(["two/repo", "https://github.com/two/repo.git", false, false, null, "main"])
    ].join("\n"), 1)).toThrow(/limit/);
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("GitHub discovery and guarded batch registration", () => {
  it("never queries GitHub unless metadata access is explicitly enabled", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-discovery-offline-"));
    const db = openGitaDatabase(root);
    const server = await buildServer(db);
    try {
      vi.stubEnv("GITA_ALLOW_GITHUB_METADATA", "0");
      const response = await server.inject({
        method: "POST", url: "/api/github/discover",
        payload: { limit: 100 }
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "network_disabled" });
    } finally {
      await server.close();
      db.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("registers 25 at most, avoids duplicates, and never clones until Refresh", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-discovery-bulk-"));
    const db = openGitaDatabase(root);
    const server = await buildServer(db);
    try {
      const project = await createProject(db, { name: "My GitHub projects" });
      const names = Array.from({ length: 25 }, (_, index) => `team/repo-${index}`);
      const response = await server.inject({
        method: "POST",
        url: `/api/projects/${project.id}/repositories/bulk`,
        payload: { repositories: names }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().items).toHaveLength(25);
      expect(await listRepositories(db, project.id)).toHaveLength(25);
      expect(fs.readdirSync(db.paths.reposDir)).toHaveLength(0);

      const repeat = await server.inject({
        method: "POST",
        url: `/api/projects/${project.id}/repositories/bulk`,
        payload: { repositories: ["TEAM/REPO-0", "team/repo-1"] }
      });
      expect(repeat.statusCode).toBe(201);
      expect(repeat.json().items).toHaveLength(0);
      expect(repeat.json().skipped).toHaveLength(2);

      const excessive = await server.inject({
        method: "POST",
        url: `/api/projects/${project.id}/repositories/bulk`,
        payload: { repositories: [...names, "team/excess"] }
      });
      expect(excessive.statusCode).toBe(400);
      expect(await listRepositories(db, project.id)).toHaveLength(25);
    } finally {
      await server.close();
      db.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
