import type {
  ActivityBucket,
  CommitFileStat,
  CommitRecord,
  ContributorLeaderboardRow,
  ProjectSummary,
  RepositoryComparisonRow
} from "./types";

export const metricDefinitions = {
  insertions: "Added lines reported by git.",
  deletions: "Removed lines reported by git.",
  netLines: "Insertions minus deletions.",
  churn: "Insertions plus deletions.",
  activeContributor: "Contributor with activity in the selected period.",
  lastActivity: "Latest commit or provider activity depending on the view.",
  ownership:
    "Change ownership: a contributor's share of churn for a path in the selected range."
} as const;

export function netLines(insertions: number, deletions: number): number {
  return insertions - deletions;
}

export function churn(insertions: number, deletions: number): number {
  return insertions + deletions;
}

export function summarizeCommits(projectId: string, commits: CommitRecord[], branches = 0): ProjectSummary {
  const contributors = new Set<string>();
  let insertions = 0;
  let deletions = 0;
  let filesChanged = 0;
  let lastActivity: string | null = null;

  for (const commit of commits) {
    if (commit.contributorId) {
      contributors.add(commit.contributorId);
    }

    if (!commit.isMerge) {
      insertions += commit.insertions;
      deletions += commit.deletions;
      filesChanged += commit.filesChanged;
    }

    if (!lastActivity || commit.authorDate > lastActivity) {
      lastActivity = commit.authorDate;
    }
  }

  return {
    projectId,
    repositories: new Set(commits.map((commit) => commit.repoId)).size,
    commits: commits.length,
    contributors: contributors.size,
    insertions,
    deletions,
    netLines: netLines(insertions, deletions),
    filesChanged,
    branches,
    lastActivity
  };
}

export function buildContributorLeaderboard(
  commits: CommitRecord[],
  contributorNames: Map<string, { displayName: string; primaryEmail: string | null }> = new Map()
): ContributorLeaderboardRow[] {
  const rows = new Map<string, ContributorLeaderboardRow>();

  for (const commit of commits) {
    const contributorId = commit.contributorId ?? `${commit.authorName}<${commit.authorEmail}>`;
    const contributor = contributorNames.get(contributorId);
    const row =
      rows.get(contributorId) ??
      {
        contributorId,
        displayName: contributor?.displayName ?? (commit.authorName || commit.authorEmail || "Unknown"),
        primaryEmail: contributor?.primaryEmail ?? (commit.authorEmail || null),
        commits: 0,
        insertions: 0,
        deletions: 0,
        netLines: 0,
        filesChanged: 0,
        firstActivity: null,
        lastActivity: null
      };

    row.commits += 1;
    if (!commit.isMerge) {
      row.insertions += commit.insertions;
      row.deletions += commit.deletions;
      row.filesChanged += commit.filesChanged;
      row.netLines = netLines(row.insertions, row.deletions);
    }
    row.firstActivity =
      row.firstActivity === null || commit.authorDate < row.firstActivity
        ? commit.authorDate
        : row.firstActivity;
    row.lastActivity =
      row.lastActivity === null || commit.authorDate > row.lastActivity
        ? commit.authorDate
        : row.lastActivity;
    rows.set(contributorId, row);
  }

  return [...rows.values()].sort((left, right) => {
    if (right.commits !== left.commits) {
      return right.commits - left.commits;
    }
    return right.insertions + right.deletions - (left.insertions + left.deletions);
  });
}

export function buildActivityBuckets(commits: CommitRecord[]): ActivityBucket[] {
  const buckets = new Map<string, ActivityBucket & { contributorSet: Set<string> }>();

  for (const commit of commits) {
    const date = commit.authorDate.slice(0, 10);
    const bucket =
      buckets.get(date) ??
      {
        date,
        commits: 0,
        insertions: 0,
        deletions: 0,
        activeContributors: 0,
        contributorSet: new Set<string>()
      };

    bucket.commits += 1;
    if (!commit.isMerge) {
      bucket.insertions += commit.insertions;
      bucket.deletions += commit.deletions;
    }
    if (commit.contributorId) {
      bucket.contributorSet.add(commit.contributorId);
    }
    bucket.activeContributors = bucket.contributorSet.size;
    buckets.set(date, bucket);
  }

  return [...buckets.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((bucket) => ({
      date: bucket.date,
      commits: bucket.commits,
      insertions: bucket.insertions,
      deletions: bucket.deletions,
      activeContributors: bucket.activeContributors
    }));
}

export function buildRepositoryComparison(
  commits: CommitRecord[],
  repositoryNames: Map<string, string>
): RepositoryComparisonRow[] {
  const rows = new Map<
    string,
    RepositoryComparisonRow & {
      contributorSet: Set<string>;
    }
  >();

  for (const commit of commits) {
    const row =
      rows.get(commit.repoId) ??
      {
        repositoryId: commit.repoId,
        repositoryName: repositoryNames.get(commit.repoId) ?? commit.repoId,
        commits: 0,
        insertions: 0,
        deletions: 0,
        contributors: 0,
        lastActivity: null,
        contributorSet: new Set<string>()
      };

    row.commits += 1;
    if (!commit.isMerge) {
      row.insertions += commit.insertions;
      row.deletions += commit.deletions;
    }
    if (commit.contributorId) {
      row.contributorSet.add(commit.contributorId);
      row.contributors = row.contributorSet.size;
    }
    row.lastActivity =
      row.lastActivity === null || commit.authorDate > row.lastActivity
        ? commit.authorDate
        : row.lastActivity;
    rows.set(commit.repoId, row);
  }

  return [...rows.values()]
    .sort((left, right) => right.commits - left.commits)
    .map((row) => ({
      repositoryId: row.repositoryId,
      repositoryName: row.repositoryName,
      commits: row.commits,
      insertions: row.insertions,
      deletions: row.deletions,
      contributors: row.contributors,
      lastActivity: row.lastActivity
    }));
}

export function computePathOwnership(stats: CommitFileStat[]): Array<{
  path: string;
  owner: string;
  score: number;
  label: "change ownership";
}> {
  const churnByPath = new Map<string, Map<string, number>>();

  for (const stat of stats) {
    const pathMap = churnByPath.get(stat.path) ?? new Map<string, number>();
    const contributorKey = stat.commitHash;
    pathMap.set(contributorKey, (pathMap.get(contributorKey) ?? 0) + churn(stat.insertions, stat.deletions));
    churnByPath.set(stat.path, pathMap);
  }

  return [...churnByPath.entries()].map(([path, pathMap]) => {
    const total = [...pathMap.values()].reduce((sum, value) => sum + value, 0);
    const [owner, ownerChurn] = [...pathMap.entries()].sort((left, right) => right[1] - left[1])[0] ?? [
      "shared",
      0
    ];
    const score = total === 0 ? 0 : ownerChurn / total;

    return {
      path,
      owner: score >= 0.35 ? owner : "shared",
      score,
      label: "change ownership"
    };
  });
}
