import type { ProviderState, PullRequest } from "@gita/core";
import { isGitHubMetadataAllowed, runProcess, type GitCommandResult } from "@gita/git-engine";
import { z } from "zod";

export interface GhRunner {
  (args: string[]): Promise<GitCommandResult>;
}

export interface GitHubAdapter {
  getStatus(): Promise<ProviderState>;
  fetchPullRequests(ownerRepo: string): Promise<{
    state: ProviderState;
    pullRequests: PullRequest[];
  }>;
}

const prSchema = z.array(
  z.object({
    id: z.string(),
    number: z.number(),
    title: z.string(),
    state: z.string(),
    author: z.object({ login: z.string().nullable().optional() }).nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    closedAt: z.string().nullable().optional(),
    mergedAt: z.string().nullable().optional(),
    baseRefName: z.string(),
    headRefName: z.string(),
    additions: z.number().nullable().optional(),
    deletions: z.number().nullable().optional(),
    changedFiles: z.number().nullable().optional(),
    reviewDecision: z.string().nullable().optional(),
    url: z.string()
  })
);

export function createGitHubAdapter(runner: GhRunner = defaultGhRunner): GitHubAdapter {
  return {
    async getStatus() {
      return checkStatus(runner);
    },
    async fetchPullRequests(ownerRepo) {
      const state = await checkStatus(runner);
      if (!state.available) {
        return { state, pullRequests: [] };
      }

      try {
        const result = await runner([
          "pr",
          "list",
          "--repo",
          ownerRepo,
          "--state",
          "all",
          "--limit",
          "200",
          "--json",
          [
            "id",
            "number",
            "title",
            "state",
            "author",
            "createdAt",
            "updatedAt",
            "closedAt",
            "mergedAt",
            "baseRefName",
            "headRefName",
            "additions",
            "deletions",
            "changedFiles",
            "reviewDecision",
            "url"
          ].join(",")
        ]);
        const parsed = prSchema.parse(JSON.parse(result.stdout));
        const pullRequests: PullRequest[] = parsed.map((item) => ({
          repoId: "",
          provider: "github",
          providerId: item.id,
          number: item.number,
          title: item.title,
          state: normalizePullRequestState(item.state, item.mergedAt ?? null),
          authorLogin: item.author?.login ?? null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          closedAt: item.closedAt ?? null,
          mergedAt: item.mergedAt ?? null,
          baseBranch: item.baseRefName,
          headBranch: item.headRefName,
          additions: item.additions ?? null,
          deletions: item.deletions ?? null,
          changedFiles: item.changedFiles ?? null,
          reviewDecision: item.reviewDecision ?? null,
          url: item.url
        }));
        return { state, pullRequests };
      } catch (error) {
        return {
          state: classifyGhError(error),
          pullRequests: []
        };
      }
    }
  };
}

async function checkStatus(runner: GhRunner): Promise<ProviderState> {
  if (!isGitHubMetadataAllowed()) {
    return {
      available: false,
      reason: "network_disabled",
      message: "GitHub metadata is disabled by GITA_OFFLINE=1 or GITA_ALLOW_GITHUB_METADATA=0."
    };
  }

  try {
    await runner(["auth", "status"]);
    return {
      available: true,
      message: "GitHub metadata available through gh."
    };
  } catch (error) {
    return classifyGhError(error);
  }
}

function classifyGhError(error: unknown): ProviderState {
  const message = error instanceof Error ? error.message : String(error);
  const stderr = typeof error === "object" && error && "result" in error
    ? String((error as { result?: { stderr?: string } }).result?.stderr ?? "")
    : "";
  const combined = `${message}\n${stderr}`.toLowerCase();

  if (combined.includes("enoent") || combined.includes("failed to start")) {
    return {
      available: false,
      reason: "missing_gh",
      message: "GitHub metadata unavailable because the gh CLI is not installed."
    };
  }

  if (combined.includes("not logged") || combined.includes("authentication") || combined.includes("login")) {
    return {
      available: false,
      reason: "unauthenticated",
      message: "GitHub metadata unavailable because gh is not authenticated."
    };
  }

  if (combined.includes("rate limit")) {
    return {
      available: false,
      reason: "rate_limited",
      message: "GitHub metadata unavailable because the GitHub API rate limit was reached."
    };
  }

  return {
    available: false,
    reason: "unknown",
    message: "GitHub metadata unavailable. Git-only analytics remain available."
  };
}

function normalizePullRequestState(state: string, mergedAt: string | null): PullRequest["state"] {
  if (mergedAt) {
    return "merged";
  }

  const normalized = state.toLowerCase();
  if (normalized === "open" || normalized === "closed") {
    return normalized;
  }

  return "unknown";
}

async function defaultGhRunner(args: string[]): Promise<GitCommandResult> {
  return runProcess("gh", args, { timeoutMs: 120_000 });
}
