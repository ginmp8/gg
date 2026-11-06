import { performance } from "node:perf_hooks";

import { createGitHubAdapter } from "@gg/github-adapter";
import { indexAnnualRepository } from "./annual";
import { analyzeRepository, ensureMirrorRepository, GitCommandError } from "@gg/git-engine";
import {
  createRefreshRun,
  getRefreshRun,
  getRepositoryWithProviderDetails,
  listRepositories,
  replacePullRequests,
  storeRepositoryAnalysis,
  updateRefreshRun,
  type GGDatabase
} from "@gg/db";

export function enqueueRepositoryRefresh(
  database: GGDatabase, runId: string, repoId: string, indexAnnual = true
): void {
  setTimeout(() => {
    void refreshRepositoryRun(database, runId, repoId, undefined, indexAnnual);
  }, 0);
}

export function enqueueProjectRefresh(
  database: GGDatabase, runId: string, projectId: string, indexAnnual = true
): void {
  setTimeout(() => {
    void refreshProjectRun(database, runId, projectId, indexAnnual);
  }, 0);
}

async function refreshProjectRun(
  database: GGDatabase, runId: string, projectId: string, indexAnnual: boolean
): Promise<void> {
  const repos = await listRepositories(database, projectId);
  await updateRefreshRun(database, runId, {
    status: "running",
    progressTotal: repos.length,
    progressCompleted: 0,
    currentStep: repos.length === 0 ? "No repositories to refresh" : "Preparing repositories",
    currentRepositoryName: null
  });
  const failures: string[] = [];

  for (const [index, repo] of repos.entries()) {
    await updateRefreshRun(database, runId, {
      progressTotal: repos.length,
      progressCompleted: index,
      currentStep: "Starting repository refresh",
      currentRepositoryName: repo.name
    });

    const childRun = await createRefreshRun(database, {
      projectId,
      repositoryId: repo.id,
      scope: "repository",
      status: "queued"
    });
    await refreshRepositoryRun(database, childRun.id, repo.id, async (progress) => {
      await updateRefreshRun(database, runId, {
        progressTotal: repos.length,
        progressCompleted: index,
        currentStep: progress.currentStep,
        currentRepositoryName: repo.name
      });
    }, indexAnnual);
    const completed = await getRefreshRun(database, childRun.id);
    if (completed?.status === "failed") {
      failures.push(`${repo.name}: ${completed.errorMessage ?? "unknown error"}`);
    }
    await updateRefreshRun(database, runId, {
      progressTotal: repos.length,
      progressCompleted: index + 1,
      currentStep: completed?.status === "failed" ? "Repository refresh failed" : "Repository refreshed",
      currentRepositoryName: repo.name
    });
  }

  await updateRefreshRun(database, runId, {
    status: failures.length > 0 ? "failed" : "succeeded",
    finishedAt: new Date().toISOString(),
    errorMessage: failures.length > 0 ? failures.join("\n") : null,
    progressTotal: repos.length,
    progressCompleted: repos.length,
    currentStep: failures.length > 0 ? "Completed with errors" : "Refresh completed",
    currentRepositoryName: null
  });
}

interface RepositoryRefreshProgress {
  currentStep: string;
}

async function refreshRepositoryRun(
  database: GGDatabase,
  runId: string,
  repoId: string,
  onProgress?: (progress: RepositoryRefreshProgress) => Promise<void>,
  indexAnnual = true
): Promise<void> {
  const repo = await getRepositoryWithProviderDetails(database, repoId);
  if (!repo) {
    await updateRefreshRun(database, runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: "Repository not found."
    });
    return;
  }

  const progressTotal = repo.provider === "github" && repo.githubOwnerRepo ? 3 : 2;
  await updateRefreshRun(database, runId, {
    status: "running",
    progressTotal,
    progressCompleted: 0,
    currentStep: "Fetching repository",
    currentRepositoryName: repo.name
  });
  await onProgress?.({ currentStep: "Fetching repository" });

  let gitFetchMs: number | null = null;
  let analysisMs: number | null = null;
  let providerFetchMs: number | null = null;

  try {
    const fetchResult = await ensureMirrorRepository({
      fetchUrl: repo.localPath ?? repo.url,
      cachePath: repo.cachePath,
      reposRoot: database.paths.reposDir,
      // This worker is reached only from explicit POST Refresh actions.
      // No network fetch is scheduled when the dashboard merely loads.
      userInitiated: true
    });
    gitFetchMs = fetchResult.gitFetchMs;
    await updateRefreshRun(database, runId, {
      gitFetchMs,
      progressTotal,
      progressCompleted: 1,
      currentStep: "Analyzing git history",
      currentRepositoryName: repo.name
    });
    await onProgress?.({ currentStep: "Analyzing git history" });

    const analysisStart = performance.now();
    const analysis = await analyzeRepository(repo.cachePath, repo.defaultBranch);
    analysisMs = Math.round(performance.now() - analysisStart);
    storeRepositoryAnalysis(database, repo, analysis);
    if (indexAnnual) {
      await updateRefreshRun(database, runId, {
        currentStep: "Indexing annual contribution incrementally",
        currentRepositoryName: repo.name
      });
      await onProgress?.({ currentStep: "Indexing annual contribution incrementally" });
      await indexAnnualRepository(database, repo);
    }
    const githubOwnerRepo = repo.provider === "github" ? repo.githubOwnerRepo : null;
    const shouldFetchProvider = Boolean(githubOwnerRepo);
    await updateRefreshRun(database, runId, {
      analysisMs,
      progressTotal,
      progressCompleted: shouldFetchProvider ? 2 : progressTotal,
      currentStep: shouldFetchProvider ? "Fetching GitHub metadata" : "Finalizing analytics",
      currentRepositoryName: repo.name
    });
    await onProgress?.({
      currentStep: shouldFetchProvider ? "Fetching GitHub metadata" : "Finalizing analytics"
    });

    if (githubOwnerRepo) {
      const providerStart = performance.now();
      const adapter = createGitHubAdapter();
      const providerResult = await adapter.fetchPullRequests(githubOwnerRepo);
      providerFetchMs = Math.round(performance.now() - providerStart);
      if (providerResult.state.available) {
        replacePullRequests(
          database,
          repo.id,
          providerResult.pullRequests.map((pullRequest) => ({ ...pullRequest, repoId: repo.id }))
        );
      }
      await updateRefreshRun(database, runId, {
        providerFetchMs,
        progressTotal,
        progressCompleted: progressTotal,
        currentStep: "Finalizing analytics",
        currentRepositoryName: repo.name
      });
      await onProgress?.({ currentStep: "Finalizing analytics" });
    }

    await updateRefreshRun(database, runId, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      errorMessage: null,
      gitFetchMs,
      analysisMs,
      providerFetchMs,
      progressTotal,
      progressCompleted: progressTotal,
      currentStep: "Refresh completed",
      currentRepositoryName: repo.name
    });
  } catch (error) {
    await updateRefreshRun(database, runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: summarizeRefreshError(error),
      gitFetchMs,
      analysisMs,
      providerFetchMs,
      progressTotal,
      currentStep: "Refresh failed",
      currentRepositoryName: repo.name
    });
  }
}

function summarizeRefreshError(error: unknown): string {
  if (error instanceof GitCommandError) {
    const stderr = error.result.stderr.trim();
    return stderr ? `${error.message}: ${stderr.slice(0, 1000)}` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
