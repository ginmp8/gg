/** Read-only evidence, not a numeric score of individual productivity. */
export type AnnualChangeCategory = "source" | "test" | "docs" | "generated";

export interface AnnualChangeRow {
  hash: string;
  mode: "gross" | "renameAware" | "adjusted";
  path: string;
  oldPath: string | null;
  additions: number;
  deletions: number;
  binary: boolean;
  category: AnnualChangeCategory;
}

export interface AnnualCommitMetrics {
  hash: string;
  authorEmail: string;
  authorName: string;
  authorDate: string;
  grossChurn: number;
  renameAwareChurn: number;
  adjustedChurn: number;
  estimatedMoveChurn: number;
  estimatedWhitespaceChurn: number;
  sourceChurn: number;
  testChurn: number;
  docsChurn: number;
  generatedChurn: number;
  reviewableChurn: number;
  movedFiles: number;
  pureMoves: number;
  binaryFiles: number;
  substantiveCommits: number;
  cosmeticOnlyCommits: number;
  testTouchedCommits: number;
  changes: AnnualChangeRow[];
}

export interface AnnualTotals {
  commits: number;
  activeDays: number;
  grossChurn: number;
  renameAwareChurn: number;
  adjustedChurn: number;
  estimatedMoveChurn: number;
  estimatedWhitespaceChurn: number;
  sourceChurn: number;
  testChurn: number;
  docsChurn: number;
  generatedChurn: number;
  reviewableChurn: number;
  movedFiles: number;
  pureMoves: number;
  binaryFiles: number;
  substantiveCommits: number;
  cosmeticOnlyCommits: number;
  testTouchedCommits: number;
}

export interface AnnualContributor extends AnnualTotals {
  primaryEmail: string;
  displayName: string;
  githubLogin: string | null;
  repositories: number;
  firstActivity: string | null;
  lastActivity: string | null;
  substantiveRate: number | null;
  retainedChurnRate: number | null;
  testTouchedRate: number | null;
  mergedPullRequests: number | null;
  reviewedPullRequests: number | null;
  approvedPullRequests: number | null;
}

export interface AnnualMonthly {
  email: string;
  month: string;
  commits: number;
  adjustedChurn: number;
  reviewableChurn: number;
  testTouchedCommits: number;
}

export interface AnnualCoverage {
  repoId: string;
  repositoryName: string;
  ref: string | null;
  head: string | null;
  indexedAt: string | null;
  eligibleCommits: number;
  indexedCommits: number;
  complete: boolean;
  prCoverageComplete: boolean;
  prSnapshotAt: string | null;
}

export interface AnnualReport {
  projectId: string;
  year: number;
  complete: boolean;
  coverage: AnnualCoverage[];
  totals: AnnualTotals;
  contributors: AnnualContributor[];
  monthly: AnnualMonthly[];
}

export interface AnnualIndexResult {
  repoId: string;
  ref: string;
  head: string;
  reachableCommits: number;
  newCommits: number;
  reusedCommits: number;
  elapsedMs: number;
}

export interface AnnualIdentityLink {
  email: string;
  canonicalEmail: string;
  githubLogin: string | null;
}
