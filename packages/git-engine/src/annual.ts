import path from "node:path";

import type { AnnualChangeCategory, AnnualChangeRow, AnnualCommitMetrics } from "@gita/core";

import { runGit } from "./command";
import { parseGitLog } from "./parser";

export const ANNUAL_ANALYSIS_VERSION = 1;
export const ANNUAL_GIT_BATCH_SIZE = 120;

const HASH = /^[a-f0-9]{40,64}$/i;
const FORMAT = [
  "%x1e%H", "%h", "%aN", "%aE", "%aI", "%cN", "%cE", "%cI", "%s", "%b", "%P", ""
].join("%x00");

/**
 * Conservative file categorization, preserving all totals. Generated paths
 * and lockfiles are excluded from "reviewable" churn, not from raw activity.
 */
export function categorizeChange(filePath: string): AnnualChangeCategory {
  const value = filePath.replaceAll("\\", "/").toLowerCase();
  const base = path.posix.basename(value);
  if (
    /(^|\/)(?:node_modules|vendor|dist|build|target|bin|obj|coverage|\.next|generated)(\/|$)/.test(value) ||
    /(?:^|[-.])(?:lock|generated|min)\.(?:json|yaml|yml|js|css)$/.test(base) ||
    /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|poetry\.lock|composer\.lock)$/.test(base) ||
    /\.(?:g\.cs|designer\.cs|map)$/.test(base)
  ) return "generated";
  if (
    /(^|\/)(?:tests?|__tests__|specs?|testdata)(\/|$)/.test(value) ||
    /(?:^|[._-])(?:test|spec|tests)(?:[._-]|$)/.test(base)
  ) return "test";
  if (
    /(^|\/)(?:docs?|documentation)(\/|$)/.test(value) ||
    /^(?:readme|changelog|license|contributing)(?:\.|$)/.test(base) ||
    /\.(?:md|mdx|rst|adoc|txt)$/.test(base)
  ) return "docs";
  return "source";
}

/** Enumerate the full set of reachable commits for an integration branch. */
export async function readAnnualReference(
  cachePath: string,
  defaultBranch: string | null
): Promise<{ ref: string; head: string; hashes: string[] }> {
  const shallow = (await runGit(["-C", cachePath, "rev-parse", "--is-shallow-repository"],
    { timeoutMs: 30_000, allowRemoteGit: false })).stdout.trim();
  if (shallow !== "false") {
    throw new Error("Shallow Git clone: fetch the full history before claiming complete annual coverage.");
  }
  const selected = defaultBranch?.replace(/^refs\/heads\//, "") ?? "";
  const branch = selected || (await runGit(
    ["-C", cachePath, "symbolic-ref", "--quiet", "--short", "HEAD"], { timeoutMs: 30_000 }
  )).stdout.trim().replace(/^refs\/heads\//, "");
  if (!branch || branch.startsWith("-") || !/^[a-zA-Z0-9_./-]+$/.test(branch) || branch.includes("..")) {
    throw new Error("An explicit, valid integration branch is required for annual analytics.");
  }
  const ref = `refs/heads/${branch}`;
  const head = (await runGit(
    ["-C", cachePath, "rev-parse", "--verify", `${ref}^{commit}`],
    { timeoutMs: 30_000 }
  )).stdout.trim();
  if (!HASH.test(head)) throw new Error("The selected integration reference has no valid HEAD.");
  const lines = (await runGit(
    ["-C", cachePath, "rev-list", ref], { timeoutMs: 300_000 }
  )).stdout.split("\n").map((item) => item.trim()).filter(Boolean);
  if (lines.some((item) => !HASH.test(item))) throw new Error("Invalid Git revision in annual index.");
  return { ref, head, hashes: lines };
}

/** Only hashes absent from the local cache are examined through Git diff. */
export async function analyzeAnnualBatch(
  cachePath: string,
  hashes: string[]
): Promise<AnnualCommitMetrics[]> {
  if (!hashes.length) return [];
  if (hashes.length > ANNUAL_GIT_BATCH_SIZE || hashes.some((hash) => !HASH.test(hash))) {
    throw new Error("Invalid or oversized annual analysis batch.");
  }
  type Parsed = ReturnType<typeof parseGitLog>;
  const variants: Array<{ mode: AnnualChangeRow["mode"]; flags: string[] }> = [
    { mode: "gross", flags: ["--no-renames"] },
    { mode: "renameAware", flags: ["--find-renames=50%"] },
    { mode: "adjusted", flags: ["--find-renames=50%", "-w"] }
  ];
  const entries: Array<{ mode: AnnualChangeRow["mode"]; parsed: Parsed }> = [];
  for (const variant of variants) {
    const response = await runGit([
      "-C", cachePath, "log", "--no-walk=unsorted", "--root", "--no-merges",
      "--no-ext-diff", "--numstat", `--format=${FORMAT}`, ...variant.flags,
      ...hashes, "--"
    ], { timeoutMs: 300_000, allowRemoteGit: false });
    entries.push({ mode: variant.mode, parsed: parseGitLog(response.stdout) });
  }

  const rawAuthor = new Map(entries[0].parsed.commits.map((commit) => [commit.hash, commit]));
  const byHash = new Map<string, AnnualChangeRow[]>();
  for (const { mode, parsed } of entries) {
    for (const change of parsed.fileStats) {
      const current = byHash.get(change.commitHash) ?? [];
      current.push({
        hash: change.commitHash,
        mode,
        path: change.path,
        oldPath: change.oldPath,
        additions: change.insertions,
        deletions: change.deletions,
        binary: change.isBinary,
        category: categorizeChange(change.path)
      });
      byHash.set(change.commitHash, current);
    }
  }

  return hashes.map((hash) => {
    const changes = byHash.get(hash) ?? [];
    const stats = (mode: AnnualChangeRow["mode"]) =>
      changes.filter((change) => change.mode === mode);
    const sum = (rows: AnnualChangeRow[]) =>
      rows.reduce((total, row) => total + row.additions + row.deletions, 0);
    const gross = stats("gross");
    const aware = stats("renameAware");
    const adjusted = stats("adjusted");
    const grossChurn = sum(gross);
    const renameAwareChurn = sum(aware);
    const adjustedChurn = sum(adjusted);
    const category = (value: AnnualChangeCategory) => sum(adjusted.filter((row) => row.category === value));
    const sourceChurn = category("source");
    const testChurn = category("test");
    const docsChurn = category("docs");
    const generatedChurn = category("generated");
    const author = rawAuthor.get(hash);

    return {
      hash,
      authorEmail: author?.authorEmail ?? "",
      authorName: author?.authorName ?? "",
      authorDate: author?.authorDate ?? "",
      grossChurn,
      renameAwareChurn,
      adjustedChurn,
      estimatedMoveChurn: Math.max(0, grossChurn - renameAwareChurn),
      estimatedWhitespaceChurn: Math.max(0, renameAwareChurn - adjustedChurn),
      sourceChurn,
      testChurn,
      docsChurn,
      generatedChurn,
      reviewableChurn: sourceChurn + testChurn,
      movedFiles: aware.filter((row) => row.oldPath !== null).length,
      pureMoves: aware.filter((row) => row.oldPath !== null && row.additions + row.deletions === 0).length,
      binaryFiles: gross.filter((row) => row.binary).length,
      substantiveCommits: adjustedChurn > 0 ? 1 : 0,
      cosmeticOnlyCommits: grossChurn > 0 && adjustedChurn === 0 ? 1 : 0,
      testTouchedCommits: aware.some((row) => row.category === "test") ? 1 : 0,
      changes
    };
  });
}
