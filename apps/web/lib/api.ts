import type {
  ActivityBucket,
  AnnualIdentityLink,
  AnnualReport,
  Branch,
  BranchView,
  BranchScope,
  BranchComparison,
  ContributorFileTypeRow,
  ContributorLeaderboardRow,
  FileTypeAnalyticsRow,
  HotFileAnalyticsRow,
  Project,
  ProjectSummary,
  ProviderState,
  PullRequest,
  ProjectBranch,
  ProjectPullRequest,
  RefreshRun,
  RepositoryFolderFilter,
  Repository,
  RepositoryComparisonRow
} from "@gita/core";

const API_URL = process.env.NEXT_PUBLIC_GITA_API_URL ?? "http://127.0.0.1:4443";

// Injected at document start by the trusted native Tauri window only.
// The normal browser/self-hosted workflow does not receive a session token.
declare global {
  interface Window {
    __GITA_DESKTOP__?: Readonly<{ apiBase: string; token: string }>;
  }
}

function backendConnection(): { apiBase: string; token?: string } {
  if (typeof window !== "undefined" && window.__GITA_DESKTOP__) {
    return window.__GITA_DESKTOP__;
  }
  return { apiBase: API_URL };
}

export interface ProjectSummaryResponse extends ProjectSummary {
  repositoryComparison: RepositoryComparisonRow[];
}

export interface PullRequestResponse {
  providerState: ProviderState;
  items: PullRequest[];
}

export interface ListResponse<T> {
  items: T[];
}

export interface DashboardFilters {
  repositoryId?: string;
  contributorId?: string;
  from?: string;
  to?: string;
  branchScope?: BranchScope;
  branches?: string[];
  folderFilters?: string[];
  metric?: string;
  limit?: number;
  offset?: number;
}

export async function getProjects(): Promise<ListResponse<Project>> {
  return apiRequest("/api/projects");
}

export async function createProject(input: {
  name: string;
  description?: string | null;
}): Promise<Project> {
  return apiRequest("/api/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export interface ProjectDeletionResult {
  deleted: true;
  removedMirrors: number;
  cleanupComplete: boolean;
  cleanupWarning: string | null;
}

export async function deleteProjectAndLocalData(projectId: string, confirmName: string): Promise<ProjectDeletionResult> {
  return apiRequest(`/api/projects/${projectId}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmName, deleteLocalData: true })
  });
}

export async function getAnnualReport(
  projectId: string, year: number, repositoryId?: string
): Promise<AnnualReport> {
  const params = new URLSearchParams({ year: String(year) });
  if (repositoryId && repositoryId !== "all") params.set("repositoryId", repositoryId);
  return apiRequest(`/api/projects/${projectId}/annual?${params}`);
}

export async function getAnnualIdentities(projectId: string): Promise<ListResponse<AnnualIdentityLink>> {
  return apiRequest(`/api/projects/${projectId}/annual/identities`);
}

export async function saveAnnualIdentity(
  projectId: string, link: AnnualIdentityLink
): Promise<ListResponse<AnnualIdentityLink>> {
  return apiRequest(`/api/projects/${projectId}/annual/identities`, {
    method: "POST", body: JSON.stringify(link)
  });
}

export async function indexAnnualProject(projectId: string): Promise<RefreshRun> {
  return apiRequest(`/api/projects/${projectId}/annual/reindex`, { method: "POST" });
}

export async function syncAnnualGitHub(
  projectId: string, repositoryId?: string
): Promise<{ items: Array<{ repoId: string; received: number; complete: boolean }> }> {
  return apiRequest(`/api/projects/${projectId}/annual/github-sync`, {
    method: "POST",
    body: JSON.stringify(repositoryId && repositoryId !== "all" ? { repositoryId } : {})
  });
}

export interface GitHubDiscoveredRepository {
  fullName: string;
  cloneUrl: string;
  isPrivate: boolean;
  archived: boolean;
  pushedAt: string | null;
  defaultBranch: string | null;
}

export async function discoverGitHubRepositories(): Promise<ListResponse<GitHubDiscoveredRepository>> {
  return apiRequest("/api/github/discover", { method: "POST", body: JSON.stringify({ limit: 5000 }) });
}

export async function bulkImportGitHubRepositories(
  projectId: string, repositories: string[]
): Promise<{ items: Repository[]; skipped: string[] }> {
  return apiRequest(`/api/projects/${projectId}/repositories/bulk`, {
    method: "POST", body: JSON.stringify({ repositories })
  });
}

export async function getBranchViews(projectId: string): Promise<ListResponse<BranchView>> {
  return apiRequest(`/api/projects/${projectId}/branch-views`);
}

export async function createBranchView(
  projectId: string,
  input: {
    name: string;
    branches: string[];
    folderFilters: RepositoryFolderFilter[];
  }
): Promise<BranchView> {
  return apiRequest(`/api/projects/${projectId}/branch-views`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateBranchView(
  branchViewId: string,
  input: {
    name?: string;
    branches?: string[];
    folderFilters?: RepositoryFolderFilter[];
  }
): Promise<BranchView> {
  return apiRequest(`/api/branch-views/${branchViewId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteBranchView(branchViewId: string): Promise<void> {
  await apiRequest(`/api/branch-views/${branchViewId}`, { method: "DELETE" });
}

export async function getRepositories(projectId: string): Promise<ListResponse<Repository>> {
  return apiRequest(`/api/projects/${projectId}/repositories`);
}

export async function createRepository(
  projectId: string,
  input: {
    input: string;
    name?: string;
  }
): Promise<Repository> {
  return apiRequest(`/api/projects/${projectId}/repositories`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateRepository(
  repoId: string,
  input: {
    name?: string;
    defaultBranch?: string | null;
  }
): Promise<Repository> {
  return apiRequest(`/api/repositories/${repoId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function refreshProject(projectId: string): Promise<RefreshRun> {
  return apiRequest(`/api/projects/${projectId}/refresh`, { method: "POST" });
}

export async function refreshRepository(repoId: string): Promise<RefreshRun> {
  return apiRequest(`/api/repositories/${repoId}/refresh`, { method: "POST" });
}

export async function getRefreshRun(runId: string): Promise<RefreshRun> {
  return apiRequest(`/api/refresh-runs/${runId}`);
}

export async function getProjectSummary(
  projectId: string,
  filters: DashboardFilters
): Promise<ProjectSummaryResponse> {
  return apiRequest(`/api/projects/${projectId}/summary${queryString(filters)}`);
}

export async function getProjectActivity(
  projectId: string,
  filters: DashboardFilters
): Promise<ListResponse<ActivityBucket>> {
  return apiRequest(
    `/api/projects/${projectId}/activity${queryString({ ...filters, limit: 400 })}`
  );
}

export async function getLeaderboard(
  projectId: string,
  filters: DashboardFilters
): Promise<ListResponse<ContributorLeaderboardRow>> {
  return apiRequest(`/api/projects/${projectId}/leaderboard${queryString(filters)}`);
}

export async function getFileTypes(
  projectId: string,
  filters: DashboardFilters
): Promise<ListResponse<FileTypeAnalyticsRow>> {
  return apiRequest(`/api/projects/${projectId}/file-types${queryString(filters)}`);
}

export async function getHotFiles(
  projectId: string,
  filters: DashboardFilters
): Promise<ListResponse<HotFileAnalyticsRow>> {
  return apiRequest(`/api/projects/${projectId}/hot-files${queryString(filters)}`);
}

export async function getContributorFileTypes(
  projectId: string,
  filters: DashboardFilters
): Promise<ListResponse<ContributorFileTypeRow>> {
  return apiRequest(`/api/projects/${projectId}/contributor-file-types${queryString(filters)}`);
}


export interface ProjectPage<T> extends ListResponse<T> {
  total: number;
}

export function getProjectBranches(projectId: string, page = 0, size = 200): Promise<ProjectPage<ProjectBranch>> {
  return apiRequest("/api/projects/" + encodeURIComponent(projectId) +
    "/branches?limit=" + size + "&offset=" + page * size);
}

export function getProjectPullRequests(
  projectId: string, page = 0, size = 200
): Promise<ProjectPage<ProjectPullRequest> & { providerState: ProviderState }> {
  return apiRequest("/api/projects/" + encodeURIComponent(projectId) +
    "/pull-requests?limit=" + size + "&offset=" + page * size);
}

export async function getBranches(
  repoId: string
): Promise<ListResponse<Branch> & { branchTimeSource: string }> {
  return apiRequest(`/api/repositories/${repoId}/branches?limit=100`);
}

export async function getBranchComparison(
  repoId: string, base: string, head: string, limit = 500
): Promise<BranchComparison> {
  const params = new URLSearchParams({
    base, head, limit: String(limit)
  });
  return apiRequest(`/api/repositories/${repoId}/compare?${params}`);
}

export async function getPullRequests(repoId: string): Promise<PullRequestResponse> {
  return apiRequest(`/api/repositories/${repoId}/pull-requests?limit=50`);
}

function queryString(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === "all") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          params.append(key, item);
        }
      }
      continue;
    }
    if ((key === "from" || key === "to") && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      params.set(key, key === "from" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`);
      continue;
    }
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const backend = backendConnection();
  if (backend.token) {
    headers.set("authorization", `Bearer ${backend.token}`);
  }

  const response = await fetch(`${backend.apiBase}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message : response.statusText;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
