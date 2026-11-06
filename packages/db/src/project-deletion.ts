import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { GGDatabase } from "./client";

export class ProjectDeletionConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectDeletionConflict";
  }
}

export class ProjectDeletionConfirmationError extends Error {
  constructor() {
    super("Type the exact project name to confirm permanent deletion.");
    this.name = "ProjectDeletionConfirmationError";
  }
}

export interface ProjectDeletionResult {
  deleted: true;
  removedMirrors: number;
  cleanupComplete: boolean;
  cleanupWarning: string | null;
}

/** Refuse user directories, modified database paths, symlinks and shared caches. */
function samePath(left: string, right: string): boolean {
  const a = path.normalize(left);
  const b = path.normalize(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function ownedMirror(
  database: GGDatabase,
  id: string,
  cachePath: string,
  projectId: string
): string {
  const root = path.resolve(database.paths.reposDir);
  const expected = path.join(root, `${id}.git`);
  if (!/^[a-f0-9-]{36}$/i.test(id) || path.resolve(cachePath) !== expected) {
    throw new ProjectDeletionConflict("The mirror path is not exclusively owned by GG.");
  }
  const dataRoot = path.resolve(database.paths.dataDir);
  if (!samePath(fs.realpathSync(dataRoot), dataRoot) || !samePath(fs.realpathSync(root), root)) {
    throw new ProjectDeletionConflict("Refusing to clean up through a symlinked data directory.");
  }
  if (fs.existsSync(expected)) {
    const stat = fs.lstatSync(expected);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new ProjectDeletionConflict("Refusing to delete a symlink or unexpected mirror type.");
    }
  }
  const shared = database.sqlite.prepare(
    "SELECT COUNT(*) AS count FROM repositories WHERE project_id <> ? " +
    "AND (cache_path = ? OR local_path = ? OR url = ?)"
  ).get(projectId, expected, expected, expected) as { count: number };
  if (shared.count > 0) {
    throw new ProjectDeletionConflict("A mirror is still referenced by another project.");
  }
  return expected;
}

/**
 * This removes only GG-generated mirrors, plus the project's database rows.
 * It never deletes the source path of a local repository or shared global data.
 *
 * The mirrors are renamed to a GG-owned quarantine before the transaction:
 * a failed SQL deletion can restore them without touching the source repos.
 * A post-commit filesystem failure is reported, never silently hidden.
 */
export function deleteProjectWithLocalData(
  database: GGDatabase,
  projectId: string,
  confirmName: string
): ProjectDeletionResult | null {
  const existing = database.sqlite.prepare(
    "SELECT name FROM projects WHERE id = ?"
  ).get(projectId) as { name: string } | undefined;
  if (!existing) return null;
  if (existing.name !== confirmName) throw new ProjectDeletionConfirmationError();

  const active = database.sqlite.prepare(
    "SELECT COUNT(*) AS count FROM refresh_runs WHERE project_id = ? AND status IN ('queued', 'running')"
  ).get(projectId) as { count: number };
  if (active.count > 0) {
    throw new ProjectDeletionConflict("Wait for the active project refresh to finish.");
  }

  const repos = database.sqlite.prepare(
    "SELECT id, cache_path AS cachePath FROM repositories WHERE project_id = ?"
  ).all(projectId) as Array<{ id: string; cachePath: string }>;
  const mirrors = repos.map((repo) => ({
    id: repo.id,
    source: ownedMirror(database, repo.id, repo.cachePath, projectId)
  }));

  const stagingRoot = path.join(database.paths.tmpDir, `project-delete-${randomUUID()}`);
  const staged: Array<{ source: string; temporary: string }> = [];
  if (mirrors.some((mirror) => fs.existsSync(mirror.source))) {
    if (!samePath(fs.realpathSync(database.paths.tmpDir), path.resolve(database.paths.tmpDir))) {
      throw new ProjectDeletionConflict("Refusing to stage through a symlinked temporary directory.");
    }
    fs.mkdirSync(stagingRoot, { recursive: false });
  }

  try {
    for (const mirror of mirrors) {
      if (!fs.existsSync(mirror.source)) continue;
      const temporary = path.join(stagingRoot, `${mirror.id}.git`);
      fs.renameSync(mirror.source, temporary);
      staged.push({ source: mirror.source, temporary });
    }

    const transaction = database.sqlite.transaction(() => {
      const result = database.sqlite.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      if (result.changes !== 1) throw new Error("Project changed during deletion.");
      // These identities are global, so remove only those with no remaining
      // commit references from other projects.
      database.sqlite.prepare(
        "DELETE FROM contributors WHERE id NOT IN " +
        "(SELECT DISTINCT contributor_id FROM commits WHERE contributor_id IS NOT NULL)"
      ).run();
    });
    transaction();
  } catch (error) {
    for (const item of staged.reverse()) {
      fs.renameSync(item.temporary, item.source);
    }
    if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  try {
    if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    return {
      deleted: true,
      removedMirrors: staged.length,
      cleanupComplete: true,
      cleanupWarning: null
    };
  } catch {
    return {
      deleted: true,
      removedMirrors: staged.length,
      cleanupComplete: false,
      cleanupWarning: "Project deleted, but a GG-owned quarantine remains under .gg/tmp."
    };
  }
}
