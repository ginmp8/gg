import fs from "node:fs";
import { performance } from "node:perf_hooks";

import {
  ANNUAL_GIT_BATCH_SIZE, analyzeAnnualBatch, isGitHubMetadataAllowed,
  readAnnualReference, runGit, runProcess
} from "@gita/git-engine";
import {
  annualCachedHashes, listRepositories, publishAnnualReference, saveAnnualBatch,
  saveAnnualCollaboration, updateRefreshRun, type CollaborationSnapshot, type GitaDatabase
} from "@gita/db";
import type { AnnualIndexResult, Repository } from "@gita/core";

/** Git-only read of the existing Gita-owned mirror. Never contacts remotes. */
export async function indexAnnualRepository(
  database: GitaDatabase, repo: Repository
): Promise<AnnualIndexResult> {
  const started = performance.now();
  const reference = await readAnnualReference(repo.cachePath, repo.defaultBranch);
  const cached = annualCachedHashes(database, repo.id);
  const missing = reference.hashes.filter((sha) => !cached.has(sha));
  for (let index = 0; index < missing.length; index += ANNUAL_GIT_BATCH_SIZE) {
    const batch = missing.slice(index, index + ANNUAL_GIT_BATCH_SIZE);
    const metrics = await analyzeAnnualBatch(repo.cachePath, batch);
    if (metrics.length !== batch.length) throw new Error("Annual diff batch was incomplete.");
    saveAnnualBatch(database, repo.id, metrics);
  }
  // Reject concurrent branch movement; an incomplete snapshot must never look current.
  const liveHead = (await runGit([
    "-C", repo.cachePath, "rev-parse", "--verify", reference.ref + "^{commit}"
  ], { timeoutMs: 30_000, allowRemoteGit: false })).stdout.trim();
  if (liveHead !== reference.head) {
    throw new Error("The integration reference moved during annual indexing; retry with the current HEAD.");
  }
  // Publish membership only after all diffs are available and HEAD is unchanged.
  publishAnnualReference(database, repo.id, reference.ref, reference.head, reference.hashes);
  return {
    repoId: repo.id, ref: reference.ref, head: reference.head,
    reachableCommits: reference.hashes.length, newCommits: missing.length,
    reusedCommits: reference.hashes.length - missing.length,
    elapsedMs: Math.round(performance.now() - started)
  };
}

interface GraphQLResult {
  data?: {
    repository?: {
      pullRequests?: {
        nodes: Array<{
          number: number;
          url: string;
          mergedAt: string | null;
          author: { login: string } | null;
          reviews: {
            nodes: Array<{
              author: { login: string } | null;
              submittedAt: string | null;
              state: string;
            }>;
            pageInfo: { hasNextPage: boolean };
          } | null;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const GRAPHQL = `query($owner:String!, $repo:String!, $cursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequests(first:50, after:$cursor, orderBy:{field:CREATED_AT,direction:DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number url mergedAt author { login }
        reviews(first:100) {
          pageInfo { hasNextPage }
          nodes { author { login } submittedAt state }
        }
      }
    }
  }
}`;

/**
 * Optional, user-requested GitHub collaboration snapshot. GraphQL requests
 * are read-only; no code/file content or metrics are sent to a third party.
 * Per-PR review pagination is capped and the coverage flag exposes gaps.
 */
export async function syncAnnualGitHubCollaboration(
  database: GitaDatabase,
  repo: Repository & { githubOwnerRepo: string | null }
): Promise<{ repoId: string; received: number; complete: boolean }> {
  if (!isGitHubMetadataAllowed()) {
    throw new Error("GitHub metadata is disabled by GITA_OFFLINE=1 or GITA_ALLOW_GITHUB_METADATA=0.");
  }
  const id = repo.githubOwnerRepo;
  if (!id || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(id)) {
    throw new Error("GitHub collaboration is available only for a configured GitHub repository.");
  }
  const [owner, repoName] = id.split("/") as [string, string];
  const items: CollaborationSnapshot["pullRequests"] = [];
  let cursor: string | null = null;
  let complete = true;

  // 5,000 PR upper bound; a saturated page or review connection is explicitly
  // marked partial rather than falsely reporting unavailable items as zero.
  for (let page = 0; page < 100; page++) {
    const args = [
      "api", "graphql", "-f", `query=${GRAPHQL}`,
      "-f", `owner=${owner}`, "-f", `repo=${repoName}`
    ];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    const result = await runProcess("gh", args, { timeoutMs: 120_000 });
    const parsed = JSON.parse(result.stdout) as GraphQLResult;
    if (parsed.errors?.length || !parsed.data?.repository?.pullRequests) {
      throw new Error("GitHub collaboration query failed or returned an incomplete response.");
    }
    const connection = parsed.data.repository.pullRequests;
    for (const pr of connection.nodes) {
      if (pr.reviews?.pageInfo.hasNextPage) complete = false;
      items.push({
        number: pr.number,
        authorLogin: pr.author?.login ?? "",
        mergedAt: pr.mergedAt,
        url: pr.url,
        reviews: (pr.reviews?.nodes ?? []).filter((item) => item.author?.login && item.submittedAt)
          .map((item) => ({
            reviewerLogin: item.author!.login,
            submittedAt: item.submittedAt!,
            state: item.state
          }))
      });
    }
    if (!connection.pageInfo.hasNextPage) {
      saveAnnualCollaboration(database, repo.id, { complete, pullRequests: items });
      return { repoId: repo.id, received: items.length, complete };
    }
    if (!connection.pageInfo.endCursor) throw new Error("Missing GitHub pagination cursor.");
    cursor = connection.pageInfo.endCursor;
  }

  saveAnnualCollaboration(database, repo.id, { complete: false, pullRequests: items });
  return { repoId: repo.id, received: items.length, complete: false };
}

/** Explicit local reindex without fetching anything from the network. */
export function enqueueAnnualProjectIndex(
  database: GitaDatabase, runId: string, projectId: string
): void {
  setTimeout(() => { void runAnnualProjectIndex(database, runId, projectId); }, 0);
}

async function runAnnualProjectIndex(
  database: GitaDatabase, runId: string, projectId: string
): Promise<void> {
  try {
    const repos = await listRepositories(database, projectId);
    await updateRefreshRun(database, runId, {
      status: "running", progressTotal: repos.length, progressCompleted: 0,
      currentStep: "Indexing locally cached Git history", currentRepositoryName: null
    });
    const errors: string[] = [];
    for (const [index, repo] of repos.entries()) {
      await updateRefreshRun(database, runId, {
        progressCompleted: index, currentRepositoryName: repo.name,
        currentStep: "Indexing annual contribution"
      });
      try {
        if (!fs.existsSync(repo.cachePath)) throw new Error("Refresh this repository to create a local mirror.");
        await indexAnnualRepository(database, repo);
      } catch (error) {
        errors.push(`${repo.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await updateRefreshRun(database, runId, { progressCompleted: index + 1 });
    }
    await updateRefreshRun(database, runId, {
      status: errors.length ? "failed" : "succeeded",
      finishedAt: new Date().toISOString(),
      progressTotal: repos.length, progressCompleted: repos.length,
      errorMessage: errors.length ? errors.join("\n") : null,
      currentStep: errors.length ? "Annual index completed with errors" : "Annual index completed",
      currentRepositoryName: null
    });
  } catch (error) {
    await updateRefreshRun(database, runId, {
      status: "failed", finishedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
      currentStep: "Annual index failed"
    });
  }
}
