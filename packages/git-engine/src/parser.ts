import path from "node:path";

import type { CommitFileStat, CommitRecord } from "@gg/core";

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\0";

export function parseGitLog(output: string): {
  commits: Array<Omit<CommitRecord, "repoId" | "contributorId">>;
  fileStats: Array<Omit<CommitFileStat, "repoId">>;
} {
  const commits: Array<Omit<CommitRecord, "repoId" | "contributorId">> = [];
  const fileStats: Array<Omit<CommitFileStat, "repoId">> = [];

  for (const rawRecord of output.split(RECORD_SEPARATOR)) {
    const record = rawRecord.trimStart();
    if (!record) {
      continue;
    }

    const fields = record.split(FIELD_SEPARATOR);
    if (fields.length < 12) {
      throw new Error("Unable to parse git log record: not enough fields.");
    }

    const [
      hash,
      shortHash,
      authorName,
      authorEmail,
      authorDate,
      committerName,
      committerEmail,
      committerDate,
      subject,
      body,
      parents
    ] = fields;
    const numstatText = fields.slice(11).join(FIELD_SEPARATOR);
    const stats = parseNumstat(numstatText).map((stat) => ({
      ...stat,
      commitHash: hash
    }));
    const insertions = stats.reduce((sum, stat) => sum + stat.insertions, 0);
    const deletions = stats.reduce((sum, stat) => sum + stat.deletions, 0);

    commits.push({
      hash,
      shortHash,
      authorName,
      authorEmail,
      authorDate,
      committerName,
      committerEmail,
      committerDate,
      subject,
      body: body.trim(),
      parents: parents.trim() ? parents.trim().split(/\s+/) : [],
      isMerge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
      insertions,
      deletions,
      filesChanged: stats.length
    });
    fileStats.push(...stats);
  }

  return { commits, fileStats };
}

export function parseNumstat(text: string): Array<Omit<CommitFileStat, "repoId" | "commitHash">> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseNumstatLine);
}

export function parseNumstatLine(line: string): Omit<CommitFileStat, "repoId" | "commitHash"> {
  const [insertionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
  const rawPath = pathParts.join("\t");
  if (!insertionsRaw || !deletionsRaw || !rawPath) {
    throw new Error(`Unable to parse numstat line: ${line}`);
  }

  const isBinary = insertionsRaw === "-" || deletionsRaw === "-";
  const parsedPath = parseNumstatPath(rawPath);
  const insertions = isBinary ? 0 : Number.parseInt(insertionsRaw, 10);
  const deletions = isBinary ? 0 : Number.parseInt(deletionsRaw, 10);

  if (!Number.isFinite(insertions) || !Number.isFinite(deletions)) {
    throw new Error(`Unable to parse numstat counts: ${line}`);
  }

  return {
    path: parsedPath.path,
    oldPath: parsedPath.oldPath,
    status: parsedPath.oldPath ? "renamed" : "modified",
    insertions,
    deletions,
    isBinary,
    extension: getExtension(parsedPath.path),
    topLevelDirectory: getTopLevelDirectory(parsedPath.path)
  };
}

function parseNumstatPath(rawPath: string): { path: string; oldPath: string | null } {
  const braceRename = rawPath.match(/^(.*)\{(.+) => (.+)\}(.*)$/);
  if (braceRename) {
    const [, prefix = "", oldName = "", newName = "", suffix = ""] = braceRename;
    return {
      oldPath: `${prefix}${oldName}${suffix}`,
      path: `${prefix}${newName}${suffix}`
    };
  }

  const arrowIndex = rawPath.indexOf(" => ");
  if (arrowIndex >= 0) {
    return {
      oldPath: rawPath.slice(0, arrowIndex),
      path: rawPath.slice(arrowIndex + 4)
    };
  }

  return {
    path: rawPath,
    oldPath: null
  };
}

function getExtension(filePath: string): string | null {
  const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();
  return extension || null;
}

function getTopLevelDirectory(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/");
  const [firstSegment] = normalized.split("/");
  return firstSegment && firstSegment !== normalized ? firstSegment : null;
}
