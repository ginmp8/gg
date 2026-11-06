import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createProject, createRefreshRun, createRepositoryRecord, getProject,
  openGitaDatabase
} from "@gita/db";
import { describe, expect, it } from "vitest";

import { buildServer } from "./server";

describe("permanent project deletion", () => {
  it("requires exact confirmation, deletes owned mirrors, and preserves source repositories and other projects", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-delete-project-"));
    const db = openGitaDatabase(root);
    const server = await buildServer(db);
    try {
      const original = path.join(root, "user-owned-source");
      fs.mkdirSync(original);
      fs.writeFileSync(path.join(original, "keep.txt"), "never delete this");
      const project = await createProject(db, { name: "Sensitive project" });
      const other = await createProject(db, { name: "Other project" });
      const repo = await createRepositoryRecord(db, project.id, {
        name: "local source", provider: "local", fetchUrl: original,
        localPath: original, githubOwnerRepo: null
      });
      const otherRepo = await createRepositoryRecord(db, other.id, {
        name: "other", provider: "local", fetchUrl: original,
        localPath: original, githubOwnerRepo: null
      });
      fs.mkdirSync(repo.cachePath);
      fs.writeFileSync(path.join(repo.cachePath, "mirror-data"), "delete only this");
      fs.mkdirSync(otherRepo.cachePath);
      fs.writeFileSync(path.join(otherRepo.cachePath, "keep"), "keep");

      const declined = await server.inject({
        method: "DELETE", url: `/api/projects/${project.id}`,
        payload: { confirmName: "incorrect", deleteLocalData: true }
      });
      expect(declined.statusCode).toBe(400);
      expect(fs.existsSync(repo.cachePath)).toBe(true);

      const result = await server.inject({
        method: "DELETE", url: `/api/projects/${project.id}`,
        payload: { confirmName: project.name, deleteLocalData: true }
      });
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json()).toMatchObject({ deleted: true, removedMirrors: 1, cleanupComplete: true });
      expect(await getProject(db, project.id)).toBeNull();
      expect(fs.existsSync(repo.cachePath)).toBe(false);
      expect(fs.existsSync(path.join(original, "keep.txt"))).toBe(true);
      expect(fs.existsSync(otherRepo.cachePath)).toBe(true);
      expect(await getProject(db, other.id)).not.toBeNull();
    } finally {
      await server.close();
      db.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects forged cache paths without touching the outside directory", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-delete-safety-"));
    const db = openGitaDatabase(root);
    const server = await buildServer(db);
    try {
      const outside = path.join(root, "outside-folder");
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "important.txt"), "keep");
      const project = await createProject(db, { name: "Keep on invalid cache" });
      const repo = await createRepositoryRecord(db, project.id, {
        name: "repo", provider: "unknown", fetchUrl: "https://example.invalid/repo.git",
        localPath: null, githubOwnerRepo: null
      });
      db.sqlite.prepare("UPDATE repositories SET cache_path = ? WHERE id = ?").run(outside, repo.id);
      const response = await server.inject({
        method: "DELETE", url: `/api/projects/${project.id}`,
        payload: { confirmName: project.name, deleteLocalData: true }
      });
      expect(response.statusCode).toBe(409);
      expect(fs.readFileSync(path.join(outside, "important.txt"), "utf8")).toBe("keep");
      expect(await getProject(db, project.id)).not.toBeNull();
    } finally {
      await server.close();
      db.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses deletion while a refresh is pending", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-delete-active-"));
    const db = openGitaDatabase(root);
    const server = await buildServer(db);
    try {
      const project = await createProject(db, { name: "Active" });
      await createRefreshRun(db, { projectId: project.id, repositoryId: null, scope: "project", status: "running" });
      const response = await server.inject({
        method: "DELETE", url: `/api/projects/${project.id}`,
        payload: { confirmName: project.name, deleteLocalData: true }
      });
      expect(response.statusCode).toBe(409);
      expect(await getProject(db, project.id)).not.toBeNull();
    } finally {
      await server.close();
      db.sqlite.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
