import fs from "node:fs";
import path from "node:path";

import type {
  Branch,
  CommitBranchMembership,
  CommitFileStat,
  CommitRecord,
  Provider,
  RepositoryFile
} from "@gita/core";

import { applyLineCounts, parseGrepLineCounts, parseLsTreeFiles } from "./files";
import { parseGitLog } from "./parser";
import { GitCommandError, runGit } from "./command";

export interface ResolvedRepositoryInput {
  originalInput: string;
  fetchUrl: string;
  name: string;
  provider: Provider;
  localPath: string | null;
  githubOwnerRepo: string | null;
}

export interface GitAnalysisResult {
  defaultBranch: string | null;
  commits: Array<Omit<CommitRecord, "repoId" | "contributorId">>;
  commitBranches: Array<Omit<CommitBranchMembership, "repoId">>;
  fileStats: Array<Omit<CommitFileStat, "repoId">>;
  files: Array<Omit<RepositoryFile, "repoId">>;
  branches: Array<Omit<Branch, "repoId">>;
}

const GITHUB_SHORTHAND = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;
const SSH_URL = /^(ssh:\/\/)?git@[A-Za-z0-9_.-]+[:/][A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/i;

export function resolveRepositoryInput(
  input: string,
  explicitName?: string
): ResolvedRepositoryInput {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Repository input is required.");
  }

  if (GITHUB_SHORTHAND.test(trimmed)) {
    const name = explicitName ?? trimmed.split("/")[1] ?? trimmed;
    return {
      originalInput: trimmed,
      fetchUrl: `https://github.com/${trimmed}.git`,
      name,
      provider: "github",
      localPath: null,
      githubOwnerRepo: trimmed
    };
  }

  if (HTTPS_URL.test(trimmed) || SSH_URL.test(trimmed)) {
    const githubOwnerRepo = parseGitHubOwnerRepo(trimmed);
    return {
      originalInput: trimmed,
      fetchUrl: trimmed,
      name: explicitName ?? inferRepositoryName(trimmed),
      provider: githubOwnerRepo ? "github" : "unknown",
      localPath: null,
      githubOwnerRepo
    };
  }

  const resolvedPath = path.resolve(trimmed);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Local repository path does not exist.");
  }

  return {
    originalInput: trimmed,
    fetchUrl: resolvedPath,
    name: explicitName ?? path.basename(resolvedPath),
    provider: "local",
    localPath: resolvedPath,
    githubOwnerRepo: null
  };
}

export function assertAppOwnedCachePath(cachePath: string, reposRoot: string): void {
  const resolvedCache = path.resolve(cachePath);
  const resolvedRoot = path.resolve(reposRoot);
  const rootWithSeparator = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : `${resolvedRoot}${path.sep}`;

  if (resolvedCache !== resolvedRoot && !resolvedCache.startsWith(rootWithSeparator)) {
    throw new Error("Repository cache path must be inside the app-owned .gita/repos directory.");
  }
}

export async function ensureMirrorRepository(params: {
  fetchUrl: string;
  cachePath: string;
  reposRoot: string;
}): Promise<{ gitFetchMs: number; operation: "clone" | "fetch" }> {
  assertAppOwnedCachePath(params.cachePath, params.reposRoot);
  fs.mkdirSync(path.dirname(params.cachePath), { recursive: true });

  if (fs.existsSync(params.cachePath)) {
    const result = await runGit(["-C", params.cachePath, "fetch", "--prune"], {
      timeoutMs: 300_000
    });
    return { gitFetchMs: result.durationMs, operation: "fetch" };
  }

  const result = await runGit(["clone", "--mirror", params.fetchUrl, params.cachePath], {
    timeoutMs: 300_000
  });
  return { gitFetchMs: result.durationMs, operation: "clone" };
}

export async function analyzeRepository(
  cachePath: string,
  analysisBranch: string | null = null
): Promise<GitAnalysisResult> {
  const detectedDefaultBranch = await readDefaultBranch(cachePath);
  const requestedBranch = normalizeBranchName(analysisBranch ?? detectedDefaultBranch);
  const treeRef = requestedBranch ? await resolveBranchRef(cachePath, requestedBranch) : null;
  const [commits, commitBranches, files, branches] = await Promise.all([
    readCommits(cachePath, null),
    readCommitBranches(cachePath),
    readRepositoryFiles(cachePath, treeRef),
    readBranches(cachePath, requestedBranch ?? detectedDefaultBranch)
  ]);

  return {
    defaultBranch: requestedBranch ?? detectedDefaultBranch,
    commits: commits.commits,
    commitBranches,
    fileStats: commits.fileStats,
    files,
    branches
  };
}

async function readDefaultBranch(cachePath: string): Promise<string | null> {
  try {
    const result = await runGit(["-C", cachePath, "symbolic-ref", "--quiet", "--short", "HEAD"], {
      timeoutMs: 30_000
    });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readCommits(
  cachePath: string,
  commitRef: string | null
): Promise<{
  commits: Array<Omit<CommitRecord, "repoId" | "contributorId">>;
  fileStats: Array<Omit<CommitFileStat, "repoId">>;
}> {
  const format = [
    "%x1e%H",
    "%h",
    "%an",
    "%ae",
    "%aI",
    "%cn",
    "%ce",
    "%cI",
    "%s",
    "%b",
    "%P",
    ""
  ].join("%x00");

  const revisionArgs = commitRef ? [commitRef, "--"] : ["--all"];
  const result = await runGit(
    [
      "-C",
      cachePath,
      "log",
      "--date=iso-strict",
      "--numstat",
      "--find-renames=50%",
      `--format=${format}`,
      ...revisionArgs
    ],
    { timeoutMs: 300_000 }
  );
  return parseGitLog(result.stdout);
}

async function readCommitBranches(
  cachePath: string
): Promise<Array<Omit<CommitBranchMembership, "repoId">>> {
  const refs = await listBranchRefs(cachePath);
  const memberships: Array<Omit<CommitBranchMembership, "repoId">> = [];
  const seen = new Set<string>();

  for (const branch of refs) {
    const result = await runGit(["-C", cachePath, "rev-list", branch.refname], {
      timeoutMs: 300_000
    });
    for (const commitHash of result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)) {
      const remote = branch.remote ?? "";
      const key = `${commitHash}\0${branch.name}\0${remote}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      memberships.push({
        commitHash,
        branchName: branch.name,
        remote: branch.remote
      });
    }
  }

  return memberships;
}

async function readRepositoryFiles(
  cachePath: string,
  treeRef: string | null
): Promise<Array<Omit<RepositoryFile, "repoId">>> {
  if (!treeRef) {
    return [];
  }

  const updatedAt = new Date().toISOString();
  const tree = await runGit(["-C", cachePath, "ls-tree", "-r", "-z", "--long", treeRef], {
    timeoutMs: 120_000
  });
  const files = parseLsTreeFiles(tree.stdout, updatedAt);
  const lineCounts = await readRepositoryLineCounts(cachePath, treeRef);
  return applyLineCounts(files, lineCounts);
}

async function readRepositoryLineCounts(
  cachePath: string,
  treeRef: string
): Promise<Map<string, number>> {
  try {
    const result = await runGit(
      ["-C", cachePath, "grep", "-I", "-c", "-e", "", treeRef, "--", "."],
      {
        timeoutMs: 120_000
      }
    );
    return parseGrepLineCounts(result.stdout, treeRef);
  } catch (error) {
    if (error instanceof GitCommandError && error.result.exitCode === 1) {
      return new Map();
    }
    throw error;
  }
}

async function resolveBranchRef(cachePath: string, branchName: string): Promise<string> {
  const candidates = [`refs/heads/${branchName}`, `refs/remotes/${branchName}`];

  for (const candidate of candidates) {
    try {
      await runGit(["-C", cachePath, "rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], {
        timeoutMs: 30_000
      });
      return candidate;
    } catch {
      // Try the next fully-qualified ref candidate.
    }
  }

  throw new Error(`Branch '${branchName}' was not found in the repository cache.`);
}

function normalizeBranchName(branchName: string | null): string | null {
  const normalized = branchName
    ?.trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "");
  if (!normalized) {
    return null;
  }

  assertSafeBranchName(normalized);
  return normalized;
}

function assertSafeBranchName(branchName: string): void {
  const invalid =
    branchName.startsWith("-") ||
    branchName.startsWith("/") ||
    branchName.endsWith("/") ||
    branchName.endsWith(".") ||
    branchName.includes("..") ||
    branchName.includes("@{") ||
    branchName.includes("//") ||
    branchName.includes("\\") ||
    branchName.includes(" ") ||
    branchName.includes("~") ||
    branchName.includes("^") ||
    branchName.includes(":") ||
    branchName.includes("?") ||
    branchName.includes("*") ||
    branchName.includes("[") ||
    branchName.split("/").some((segment) => segment === "" || segment.endsWith(".lock"));

  if (invalid) {
    throw new Error(`Invalid branch name '${branchName}'.`);
  }
}

async function readBranches(
  cachePath: string,
  defaultBranch: string | null
): Promise<Array<Omit<Branch, "repoId">>> {
  const result = await runGit(
    [
      "-C",
      cachePath,
      "for-each-ref",
      "refs/heads",
      "refs/remotes",
      "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)"
    ],
    { timeoutMs: 60_000 }
  );
  const now = new Date().toISOString();

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [refname = "", shortName = "", objectName = "", lastCommitAt = ""] = line.split("\0");
      const branchRef = parseBranchRef(refname, shortName);
      const normalizedDefaultBranch = defaultBranch?.replace(/^refs\/heads\//, "") ?? null;

      return {
        name: branchRef.name,
        remote: branchRef.remote,
        isDefault:
          branchRef.name === normalizedDefaultBranch ||
          refname === `refs/heads/${normalizedDefaultBranch}` ||
          shortName === normalizedDefaultBranch,
        headCommitHash: objectName || null,
        lastCommitAt: lastCommitAt || null,
        createdAtEstimate: null,
        providerCreatedAt: null,
        branchTimeSource: "headCommit" as const,
        updatedAt: now
      };
    })
    .filter((branch) => branch.name && branch.name !== "HEAD");
}

async function listBranchRefs(
  cachePath: string
): Promise<Array<{ refname: string; name: string; remote: string | null }>> {
  const result = await runGit(
    [
      "-C",
      cachePath,
      "for-each-ref",
      "refs/heads",
      "refs/remotes",
      "--format=%(refname)%00%(refname:short)"
    ],
    { timeoutMs: 60_000 }
  );

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [refname = "", shortName = ""] = line.split("\0");
      return { refname, ...parseBranchRef(refname, shortName) };
    })
    .filter((branch) => branch.refname && branch.name && branch.name !== "HEAD");
}

function parseBranchRef(
  refname: string,
  shortName: string
): { name: string; remote: string | null } {
  if (refname.startsWith("refs/heads/")) {
    return {
      name: refname.slice("refs/heads/".length),
      remote: null
    };
  }

  if (refname.startsWith("refs/remotes/")) {
    const remoteAndName = refname.slice("refs/remotes/".length);
    const [remote = "", ...nameParts] = remoteAndName.split("/");
    return {
      name: nameParts.join("/"),
      remote: remote || null
    };
  }

  return {
    name: shortName,
    remote: null
  };
}

function parseGitHubOwnerRepo(value: string): string | null {
  const httpsMatch = value.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(\.git)?$/i);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = value.match(/^(ssh:\/\/)?git@github\.com[:/]([^/\s]+)\/([^/\s]+?)(\.git)?$/i);
  if (sshMatch) {
    return `${sshMatch[2]}/${sshMatch[3]}`;
  }

  return null;
}

function inferRepositoryName(value: string): string {
  const withoutTrailingSlash = value.replace(/\/$/, "");
  const lastPart = withoutTrailingSlash.split(/[/:]/).pop() ?? withoutTrailingSlash;
  return lastPart.replace(/\.git$/i, "") || "repository";
}
