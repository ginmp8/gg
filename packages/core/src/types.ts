export type ISODateString = string;

export type Provider = "local" | "github" | "unknown";
export type RefreshScope = "project" | "repository";
export type RefreshStatus = "queued" | "running" | "succeeded" | "failed";
export type PullRequestState = "open" | "closed" | "merged" | "unknown";
export type BranchTimeSource = "headCommit" | "defaultBranchReachability" | "providerMetadata";
export type BranchScope = "default" | "all" | "custom";
export type FolderFilterMode = "include" | "exclude";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Repository {
  id: string;
  projectId: string;
  name: string;
  url: string;
  localPath: string | null;
  provider: Provider;
  defaultBranch: string | null;
  cachePath: string;
  lastRefreshAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface BranchView {
  id: string;
  projectId: string;
  name: string;
  branches: string[];
  folderFilters: RepositoryFolderFilter[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface RepositoryFolderFilter {
  repositoryId: string;
  mode: FolderFilterMode;
  paths: string[];
}

export interface RefreshRun {
  id: string;
  projectId: string;
  repositoryId: string | null;
  scope: RefreshScope;
  status: RefreshStatus;
  startedAt: ISODateString;
  finishedAt: ISODateString | null;
  errorMessage: string | null;
  gitFetchMs: number | null;
  analysisMs: number | null;
  providerFetchMs: number | null;
  progressTotal: number | null;
  progressCompleted: number | null;
  currentStep: string | null;
  currentRepositoryName: string | null;
}

export interface Contributor {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  avatarUrl: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ContributorIdentity {
  id: string;
  contributorId: string;
  name: string;
  email: string;
  source: "git" | "github" | "manual";
}

export interface CommitRecord {
  repoId: string;
  hash: string;
  shortHash: string;
  contributorId: string | null;
  authorName: string;
  authorEmail: string;
  authorDate: ISODateString;
  committerName: string;
  committerEmail: string;
  committerDate: ISODateString;
  subject: string;
  body: string;
  parents: string[];
  isMerge: boolean;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface CommitBranchMembership {
  repoId: string;
  commitHash: string;
  branchName: string;
  remote: string | null;
}

export interface CommitFileStat {
  repoId: string;
  commitHash: string;
  path: string;
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
  insertions: number;
  deletions: number;
  isBinary: boolean;
  extension: string | null;
  topLevelDirectory: string | null;
}

export interface RepositoryFile {
  repoId: string;
  path: string;
  extension: string | null;
  topLevelDirectory: string | null;
  byteSize: number;
  lineCount: number | null;
  isBinary: boolean;
  updatedAt: ISODateString;
}

export interface Branch {
  repoId: string;
  name: string;
  remote: string | null;
  isDefault: boolean;
  headCommitHash: string | null;
  lastCommitAt: ISODateString | null;
  createdAtEstimate: ISODateString | null;
  providerCreatedAt: ISODateString | null;
  branchTimeSource: BranchTimeSource;
  updatedAt: ISODateString;
}

export interface PullRequest {
  repoId: string;
  provider: "github";
  providerId: string;
  number: number;
  title: string;
  state: PullRequestState;
  authorLogin: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  closedAt: ISODateString | null;
  mergedAt: ISODateString | null;
  baseBranch: string;
  headBranch: string;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  reviewDecision: string | null;
  url: string;
}

export interface AnalyticsFilters {
  from?: ISODateString;
  to?: ISODateString;
  repositoryId?: string;
  contributorId?: string;
  branch?: string;
  branchScope?: BranchScope;
  branches?: string[];
  folderFilters?: string[];
  metric?: string;
  limit?: number;
  offset?: number;
}

export interface ContributorLeaderboardRow {
  contributorId: string;
  displayName: string;
  primaryEmail: string | null;
  commits: number;
  insertions: number;
  deletions: number;
  netLines: number;
  filesChanged: number;
  firstActivity: ISODateString | null;
  lastActivity: ISODateString | null;
}

export interface ActivityBucket {
  date: string;
  commits: number;
  insertions: number;
  deletions: number;
  activeContributors: number;
}

export interface RepositoryComparisonRow {
  repositoryId: string;
  repositoryName: string;
  commits: number;
  insertions: number;
  deletions: number;
  contributors: number;
  lastActivity: ISODateString | null;
}

export interface FileTypeAnalyticsRow {
  extension: string | null;
  fileCount: number;
  lineCount: number;
  byteSize: number;
  binaryFiles: number;
  touchedFiles: number;
  touches: number;
  commits: number;
  contributors: number;
  insertions: number;
  deletions: number;
  netLines: number;
  churn: number;
}

export interface HotFileAnalyticsRow {
  repositoryId: string;
  repositoryName: string;
  path: string;
  extension: string | null;
  topLevelDirectory: string | null;
  currentLines: number | null;
  byteSize: number | null;
  touchedFiles: number;
  touches: number;
  commits: number;
  contributors: number;
  insertions: number;
  deletions: number;
  netLines: number;
  churn: number;
  firstActivity: ISODateString | null;
  lastActivity: ISODateString | null;
}

export interface ContributorFileTypeRow {
  contributorId: string;
  displayName: string;
  primaryEmail: string | null;
  extension: string | null;
  touchedFiles: number;
  touches: number;
  commits: number;
  insertions: number;
  deletions: number;
  netLines: number;
  churn: number;
  shareOfContributorChurn: number;
  firstActivity: ISODateString | null;
  lastActivity: ISODateString | null;
}

export interface ProjectSummary {
  projectId: string;
  repositories: number;
  commits: number;
  contributors: number;
  insertions: number;
  deletions: number;
  netLines: number;
  filesChanged: number;
  branches: number;
  lastActivity: ISODateString | null;
}

export interface ProviderDegradedState {
  available: false;
  reason: "network_disabled" | "missing_gh" | "unauthenticated" | "rate_limited" | "unsupported_provider" | "unknown";
  message: string;
}

export interface ProviderReadyState {
  available: true;
  message: string;
}

export type ProviderState = ProviderDegradedState | ProviderReadyState;
