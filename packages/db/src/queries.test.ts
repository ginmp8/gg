import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openGitaDatabase } from "./client";
import {
  createBranchView,
  createProject,
  createRepositoryRecord,
  deleteBranchView,
  getBranchView,
  getContributorLeaderboard,
  getProjectSummary,
  listBranchViews,
  storeRepositoryAnalysis,
  updateBranchView
} from "./queries";

describe("analytics queries", () => {
  it("filters commit metrics by branch membership", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gita-db-"));
    const database = openGitaDatabase(tmpDir);
    try {
      const project = await createProject(database, { name: "Fixture" });
      const repository = await createRepositoryRecord(database, project.id, {
        fetchUrl: "/tmp/fixture.git",
        name: "fixture",
        provider: "local",
        localPath: "/tmp/fixture",
        githubOwnerRepo: null
      });

      storeRepositoryAnalysis(database, repository, {
        defaultBranch: "dev",
        commits: [
          commit("a".repeat(40), "base", "Ada", "ada@example.com", "2026-01-01T10:00:00.000Z"),
          commit(
            "b".repeat(40),
            "feature",
            "Grace",
            "grace@example.com",
            "2026-01-02T10:00:00.000Z"
          )
        ],
        commitBranches: [
          { commitHash: "a".repeat(40), branchName: "dev", remote: null },
          { commitHash: "a".repeat(40), branchName: "feature/extra", remote: null },
          { commitHash: "b".repeat(40), branchName: "feature/extra", remote: null }
        ],
        fileStats: [],
        files: [],
        branches: []
      });

      await expect(getProjectSummary(database, project.id)).resolves.toMatchObject({ commits: 2 });
      await expect(
        getProjectSummary(database, project.id, { branchScope: "default" })
      ).resolves.toMatchObject({ commits: 1 });
      await expect(
        getProjectSummary(database, project.id, { branch: "dev" })
      ).resolves.toMatchObject({ commits: 1 });
      await expect(
        getProjectSummary(database, project.id, { branch: "feature/extra" })
      ).resolves.toMatchObject({
        commits: 2
      });
      await expect(
        getProjectSummary(database, project.id, {
          branchScope: "custom",
          branches: [`${repository.id}:feature/extra`]
        })
      ).resolves.toMatchObject({ commits: 2 });
      await expect(
        getProjectSummary(database, project.id, {
          branchScope: "custom",
          branches: []
        })
      ).resolves.toMatchObject({ commits: 0 });
    } finally {
      database.sqlite.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("stores editable branch views per project", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gita-db-"));
    const database = openGitaDatabase(tmpDir);
    try {
      const project = await createProject(database, { name: "Fixture" });
      const view = await createBranchView(database, project.id, {
        name: "Dev only",
        branches: ["repo-b:dev", "repo-a:main", "repo-a:main"],
        folderFilters: [
          { repositoryId: "repo-a", mode: "include", paths: ["src", "/src/", "apps/web"] },
          { repositoryId: "repo-b", mode: "exclude", paths: ["dist"] }
        ]
      });

      await expect(listBranchViews(database, project.id)).resolves.toMatchObject([
        {
          id: view.id,
          name: "Dev only",
          branches: ["repo-a:main", "repo-b:dev"],
          folderFilters: [
            { repositoryId: "repo-a", mode: "include", paths: ["apps/web", "src"] },
            { repositoryId: "repo-b", mode: "exclude", paths: ["dist"] }
          ]
        }
      ]);

      const updated = await updateBranchView(database, view.id, {
        name: "Focused",
        branches: ["repo-c:release"],
        folderFilters: [{ repositoryId: "repo-c", mode: "include", paths: ["packages/core"] }]
      });
      expect(updated).toMatchObject({
        id: view.id,
        name: "Focused",
        branches: ["repo-c:release"],
        folderFilters: [{ repositoryId: "repo-c", mode: "include", paths: ["packages/core"] }]
      });
      await expect(getBranchView(database, view.id)).resolves.toMatchObject({
        name: "Focused"
      });
      expect(await deleteBranchView(database, view.id)).toBe(true);
      await expect(listBranchViews(database, project.id)).resolves.toEqual([]);
    } finally {
      database.sqlite.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("scopes commit metrics to included and excluded repository folders", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gita-db-"));
    const database = openGitaDatabase(tmpDir);
    try {
      const project = await createProject(database, { name: "Fixture" });
      const repository = await createRepositoryRecord(database, project.id, {
        fetchUrl: "/tmp/fixture.git",
        name: "fixture",
        provider: "local",
        localPath: "/tmp/fixture",
        githubOwnerRepo: null
      });
      const otherRepository = await createRepositoryRecord(database, project.id, {
        fetchUrl: "/tmp/other.git",
        name: "other",
        provider: "local",
        localPath: "/tmp/other",
        githubOwnerRepo: null
      });
      const firstHash = "c".repeat(40);
      const secondHash = "d".repeat(40);

      storeRepositoryAnalysis(database, repository, {
        defaultBranch: "main",
        commits: [
          commit(firstHash, "mixed", "Ada", "ada@example.com", "2026-01-03T10:00:00.000Z")
        ],
        commitBranches: [{ commitHash: firstHash, branchName: "main", remote: null }],
        fileStats: [
          fileStat(firstHash, "src/app.ts", 10, 2),
          fileStat(firstHash, "docs/readme.md", 40, 1)
        ],
        files: [],
        branches: []
      });
      storeRepositoryAnalysis(database, otherRepository, {
        defaultBranch: "main",
        commits: [
          commit(secondHash, "other", "Grace", "grace@example.com", "2026-01-04T10:00:00.000Z")
        ],
        commitBranches: [{ commitHash: secondHash, branchName: "main", remote: null }],
        fileStats: [fileStat(secondHash, "lib/index.ts", 7, 0)],
        files: [],
        branches: []
      });

      await expect(
        getProjectSummary(database, project.id, {
          folderFilters: [`${repository.id}:include:src`]
        })
      ).resolves.toMatchObject({
        commits: 2,
        insertions: 17,
        deletions: 2,
        filesChanged: 2
      });
      await expect(
        getProjectSummary(database, project.id, {
          folderFilters: [`${repository.id}:exclude:docs`]
        })
      ).resolves.toMatchObject({
        commits: 2,
        insertions: 17,
        deletions: 2,
        filesChanged: 2
      });
      await expect(
        getProjectSummary(database, project.id, {
          repositoryId: repository.id,
          folderFilters: [`${repository.id}:include:src`]
        })
      ).resolves.toMatchObject({
        commits: 1,
        insertions: 10,
        deletions: 2,
          filesChanged: 1
        });
      await expect(
        getContributorLeaderboard(database, project.id, {
          folderFilters: [`${repository.id}:include:src`]
        })
      ).resolves.toMatchObject([
        {
          displayName: "Ada",
          commits: 1,
          insertions: 10,
          deletions: 2,
          filesChanged: 1
        },
        {
          displayName: "Grace",
          commits: 1,
          insertions: 7,
          deletions: 0,
          filesChanged: 1
        }
      ]);
    } finally {
      database.sqlite.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function commit(
  hash: string,
  subject: string,
  authorName: string,
  authorEmail: string,
  authorDate: string
) {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    authorName,
    authorEmail,
    authorDate,
    committerName: authorName,
    committerEmail: authorEmail,
    committerDate: authorDate,
    subject,
    body: "",
    parents: [],
    isMerge: false,
    insertions: 1,
    deletions: 0,
    filesChanged: 1
  };
}

function fileStat(commitHash: string, pathValue: string, insertions: number, deletions: number) {
  const extension = path.extname(pathValue).replace(/^\./, "") || null;
  const [topLevelDirectory] = pathValue.split("/");
  return {
    commitHash,
    path: pathValue,
    oldPath: null,
    status: "modified" as const,
    insertions,
    deletions,
    isBinary: false,
    extension,
    topLevelDirectory: topLevelDirectory || null
  };
}
