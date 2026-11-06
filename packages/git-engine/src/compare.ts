import type { BranchComparison } from "@gg/core";

import { runGit } from "./command";

/** Accept only local Git branch refs. Never interpret revision options or paths. */
function safeRef(value: string): string {
  if (
    value.length < 1 || value.length > 200 || value.startsWith("-") ||
    !/^[a-zA-Z0-9_./-]+$/.test(value) ||
    value.includes("..") || value.includes("//") || value.includes("@{") ||
    value.endsWith("/") || value.split("/").some((part) => part.endsWith(".lock"))
  ) {
    throw new Error("Invalid branch name.");
  }
  return `refs/heads/${value}`;
}

/**
 * Compare two existing local mirror branches. Reads the common ancestor but
 * never checks out, fetches, merges, or modifies analyzed repositories.
 */
export async function compareLocalBranches(
  cachePath: string, base: string, head: string, limit = 500
): Promise<BranchComparison> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Comparison limit must be between 1 and 500.");
  }
  const baseRef = safeRef(base), headRef = safeRef(head);
  for (const ref of [baseRef, headRef]) {
    await runGit(
      ["-C", cachePath, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      { timeoutMs: 30_000, allowRemoteGit: false }
    );
  }
  const counts = (await runGit(
    ["-C", cachePath, "rev-list", "--left-right", "--count", `${baseRef}...${headRef}`],
    { timeoutMs: 60_000, allowRemoteGit: false }
  )).stdout.trim().split(/\s+/);
  const behind = Number(counts[0]), ahead = Number(counts[1]);
  if (counts.length !== 2 || !Number.isSafeInteger(behind) || !Number.isSafeInteger(ahead)) {
    throw new Error("Invalid Git comparison result.");
  }
  const response = await runGit(
    ["-C", cachePath, "diff", "--no-ext-diff", "--no-renames", "--name-status", "-z",
      `${baseRef}...${headRef}`, "--"],
    { timeoutMs: 120_000, allowRemoteGit: false }
  );
  const fields = response.stdout.split("\0").filter(Boolean);
  if (fields.length % 2 !== 0) throw new Error("Incomplete Git diff status output.");
  const totalChangedFiles = fields.length / 2;
  const files: BranchComparison["files"] = [];
  for (let i = 0; i < Math.min(fields.length, limit * 2); i += 2) {
    const status = fields[i], filePath = fields[i + 1];
    if (!status || !filePath || !/^[A-Z]$/.test(status)) {
      throw new Error("Unexpected Git diff file status.");
    }
    files.push({ status, path: filePath });
  }
  return { base, head, ahead, behind, files, totalChangedFiles,
    truncated: totalChangedFiles > limit };
}
