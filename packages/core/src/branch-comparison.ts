/** A read-only three-dot Git diff between two existing local branches. */
export interface BranchComparison {
  base: string;
  head: string;
  ahead: number;
  behind: number;
  files: Array<{ path: string; status: string }>;
  totalChangedFiles: number;
  truncated: boolean;
}
