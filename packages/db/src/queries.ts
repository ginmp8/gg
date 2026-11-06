import path from "node:path";

import { chooseDisplayName, normalizeEmail, normalizeIdentityKey } from "@gg/core";
import type {
  ActivityBucket,
  AnalyticsFilters,
  Branch,
  ProjectBranch,
  ProjectPullRequest,
  BranchView,
  CommitBranchMembership,
  CommitFileStat,
  CommitRecord,
  ContributorFileTypeRow,
  FileTypeAnalyticsRow,
  FolderFilterMode,
  HotFileAnalyticsRow,
  ContributorLeaderboardRow,
  Project,
  ProjectSummary,
  PullRequest,
  RefreshRun,
  RefreshStatus,
  RepositoryFolderFilter,
  RepositoryFile,
  Repository,
  RepositoryComparisonRow
} from "@gg/core";
import { desc, eq } from "drizzle-orm";

import type { GGDatabase } from "./client";
import { branchViews, projects, refreshRuns, repositories } from "./schema";

type BranchViewRow = typeof branchViews.$inferSelect;
type RepositoryRow = typeof repositories.$inferSelect;
type RefreshRunRow = typeof refreshRuns.$inferSelect;

export interface RepositoryInputForStorage {
  fetchUrl: string;
  name: string;
  provider: Repository["provider"];
  localPath: string | null;
  githubOwnerRepo: string | null;
}

export interface RepositoryAnalysisForStorage {
  defaultBranch: string | null;
  commits: Array<Omit<CommitRecord, "repoId" | "contributorId">>;
  commitBranches: Array<Omit<CommitBranchMembership, "repoId">>;
  fileStats: Array<Omit<CommitFileStat, "repoId">>;
  files: Array<Omit<RepositoryFile, "repoId">>;
  branches: Array<Omit<Branch, "repoId">>;
}

interface QueryFilters {
  whereSql: string;
  params: Record<string, string | number>;
  limit: number;
  offset: number;
}

export async function listProjects(database: GGDatabase): Promise<Project[]> {
  return database.db.select().from(projects).orderBy(desc(projects.updatedAt));
}

export async function createProject(
  database: GGDatabase,
  input: { name: string; description?: string | null }
): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now
  };
  await database.db.insert(projects).values(projectToRow(project));
  return project;
}

export async function getProject(
  database: GGDatabase,
  projectId: string
): Promise<Project | null> {
  const [project] = await database.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

export async function updateProject(
  database: GGDatabase,
  projectId: string,
  input: { name?: string; description?: string | null }
): Promise<Project | null> {
  const existing = await getProject(database, projectId);
  if (!existing) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  await database.db
    .update(projects)
    .set({
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      updatedAt
    })
    .where(eq(projects.id, projectId));
  return getProject(database, projectId);
}

export async function deleteProject(database: GGDatabase, projectId: string): Promise<boolean> {
  const result = database.sqlite.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  return result.changes > 0;
}

export async function listBranchViews(
  database: GGDatabase,
  projectId: string
): Promise<BranchView[]> {
  const rows = await database.db
    .select()
    .from(branchViews)
    .where(eq(branchViews.projectId, projectId))
    .orderBy(desc(branchViews.updatedAt));
  return rows.map(branchViewFromRow);
}

export async function getBranchView(
  database: GGDatabase,
  branchViewId: string
): Promise<BranchView | null> {
  const [view] = await database.db
    .select()
    .from(branchViews)
    .where(eq(branchViews.id, branchViewId))
    .limit(1);
  return view ? branchViewFromRow(view) : null;
}

export async function createBranchView(
  database: GGDatabase,
  projectId: string,
  input: { name: string; branches: string[]; folderFilters?: RepositoryFolderFilter[] }
): Promise<BranchView> {
  const now = new Date().toISOString();
  const view: BranchView = {
    id: crypto.randomUUID(),
    projectId,
    name: input.name,
    branches: normalizeBranchViewBranches(input.branches),
    folderFilters: normalizeRepositoryFolderFilters(input.folderFilters ?? []),
    createdAt: now,
    updatedAt: now
  };
  await database.db.insert(branchViews).values(branchViewToRow(view));
  return view;
}

export async function updateBranchView(
  database: GGDatabase,
  branchViewId: string,
  input: { name?: string; branches?: string[]; folderFilters?: RepositoryFolderFilter[] }
): Promise<BranchView | null> {
  const existing = await getBranchView(database, branchViewId);
  if (!existing) {
    return null;
  }

  const nextBranches =
    input.branches === undefined ? existing.branches : normalizeBranchViewBranches(input.branches);
  const nextFolderFilters =
    input.folderFilters === undefined
      ? existing.folderFilters
      : normalizeRepositoryFolderFilters(input.folderFilters);
  await database.db
    .update(branchViews)
    .set({
      name: input.name ?? existing.name,
      branchesJson: JSON.stringify(nextBranches),
      folderFiltersJson: JSON.stringify(nextFolderFilters),
      updatedAt: new Date().toISOString()
    })
    .where(eq(branchViews.id, branchViewId));
  return getBranchView(database, branchViewId);
}

export async function deleteBranchView(
  database: GGDatabase,
  branchViewId: string
): Promise<boolean> {
  const result = database.sqlite.prepare("DELETE FROM branch_views WHERE id = ?").run(branchViewId);
  return result.changes > 0;
}

export async function listRepositories(
  database: GGDatabase,
  projectId: string
): Promise<Repository[]> {
  const rows = await database.db
    .select()
    .from(repositories)
    .where(eq(repositories.projectId, projectId))
    .orderBy(desc(repositories.updatedAt));
  return rows.map(repositoryFromRow);
}

export async function getRepository(
  database: GGDatabase,
  repoId: string
): Promise<Repository | null> {
  const [repo] = await database.db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);
  return repo ? repositoryFromRow(repo) : null;
}

export async function getRepositoryWithProviderDetails(
  database: GGDatabase,
  repoId: string
): Promise<(Repository & { githubOwnerRepo: string | null }) | null> {
  const [repo] = await database.db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);
  return repo ? { ...repositoryFromRow(repo), githubOwnerRepo: repo.githubOwnerRepo } : null;
}

export async function createRepositoryRecord(
  database: GGDatabase,
  projectId: string,
  resolved: RepositoryInputForStorage
): Promise<Repository> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const cachePath = path.join(database.paths.reposDir, `${id}.git`);
  const repo = {
    id,
    projectId,
    name: resolved.name,
    url: resolved.fetchUrl,
    localPath: resolved.localPath,
    provider: resolved.provider,
    defaultBranch: null,
    cachePath,
    githubOwnerRepo: resolved.githubOwnerRepo,
    lastRefreshAt: null,
    createdAt: now,
    updatedAt: now
  };

  await database.db.insert(repositories).values(repo);
  return repositoryFromRow(repo);
}

export async function updateRepositoryRecord(
  database: GGDatabase,
  repoId: string,
  input: { name?: string; defaultBranch?: string | null }
): Promise<Repository | null> {
  const existing = await getRepository(database, repoId);
  if (!existing) {
    return null;
  }

  await database.db
    .update(repositories)
    .set({
      name: input.name ?? existing.name,
      defaultBranch:
        input.defaultBranch === undefined ? existing.defaultBranch : input.defaultBranch,
      updatedAt: new Date().toISOString()
    })
    .where(eq(repositories.id, repoId));
  return getRepository(database, repoId);
}

export async function deleteRepository(database: GGDatabase, repoId: string): Promise<boolean> {
  const result = database.sqlite.prepare("DELETE FROM repositories WHERE id = ?").run(repoId);
  return result.changes > 0;
}

export async function createRefreshRun(
  database: GGDatabase,
  input: {
    projectId: string;
    repositoryId: string | null;
    scope: "project" | "repository";
    status?: RefreshStatus;
  }
): Promise<RefreshRun> {
  const run: RefreshRun = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    repositoryId: input.repositoryId,
    scope: input.scope,
    status: input.status ?? "queued",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    errorMessage: null,
    gitFetchMs: null,
    analysisMs: null,
    providerFetchMs: null,
    progressTotal: null,
    progressCompleted: null,
    currentStep: null,
    currentRepositoryName: null
  };
  await database.db.insert(refreshRuns).values(refreshRunToRow(run));
  return run;
}

export async function getRefreshRun(
  database: GGDatabase,
  runId: string
): Promise<RefreshRun | null> {
  const [run] = await database.db
    .select()
    .from(refreshRuns)
    .where(eq(refreshRuns.id, runId))
    .limit(1);
  return run ? refreshRunFromRow(run) : null;
}

export async function updateRefreshRun(
  database: GGDatabase,
  runId: string,
  input: Partial<RefreshRun>
): Promise<void> {
  await database.db
    .update(refreshRuns)
    .set(refreshRunPatchToRow(input))
    .where(eq(refreshRuns.id, runId));
}

export function storeRepositoryAnalysis(
  database: GGDatabase,
  repo: Repository,
  analysis: RepositoryAnalysisForStorage
): void {
  const now = new Date().toISOString();
  const transaction = database.sqlite.transaction(() => {
    database.sqlite.prepare("DELETE FROM commit_branches WHERE repo_id = ?").run(repo.id);
    database.sqlite.prepare("DELETE FROM commit_file_stats WHERE repo_id = ?").run(repo.id);
    database.sqlite.prepare("DELETE FROM repository_files WHERE repo_id = ?").run(repo.id);
    database.sqlite.prepare("DELETE FROM commits WHERE repo_id = ?").run(repo.id);
    database.sqlite.prepare("DELETE FROM branches WHERE repo_id = ?").run(repo.id);

    const identityState = loadIdentityState(database);
    const insertCommit = database.sqlite.prepare(`
      INSERT INTO commits (
        repo_id, hash, short_hash, contributor_id, author_name, author_email, author_date,
        committer_name, committer_email, committer_date, subject, body, parents, is_merge,
        insertions, deletions, files_changed
      ) VALUES (
        @repoId, @hash, @shortHash, @contributorId, @authorName, @authorEmail, @authorDate,
        @committerName, @committerEmail, @committerDate, @subject, @body, @parents, @isMerge,
        @insertions, @deletions, @filesChanged
      )
    `);
    const insertCommitBranch = database.sqlite.prepare(`
      INSERT OR IGNORE INTO commit_branches (
        repo_id, commit_hash, branch_name, remote
      ) VALUES (
        @repoId, @commitHash, @branchName, @remote
      )
    `);
    const insertStat = database.sqlite.prepare(`
      INSERT INTO commit_file_stats (
        id, repo_id, commit_hash, path, old_path, status, insertions, deletions,
        is_binary, extension, top_level_directory
      ) VALUES (
        @id, @repoId, @commitHash, @path, @oldPath, @status, @insertions, @deletions,
        @isBinary, @extension, @topLevelDirectory
      )
    `);
    const insertBranch = database.sqlite.prepare(`
      INSERT INTO branches (
        repo_id, name, remote, is_default, head_commit_hash, last_commit_at,
        created_at_estimate, provider_created_at, branch_time_source, updated_at
      ) VALUES (
        @repoId, @name, @remote, @isDefault, @headCommitHash, @lastCommitAt,
        @createdAtEstimate, @providerCreatedAt, @branchTimeSource, @updatedAt
      )
    `);
    const insertRepositoryFile = database.sqlite.prepare(`
      INSERT INTO repository_files (
        id, repo_id, path, extension, top_level_directory, byte_size, line_count,
        is_binary, updated_at
      ) VALUES (
        @id, @repoId, @path, @extension, @topLevelDirectory, @byteSize, @lineCount,
        @isBinary, @updatedAt
      )
    `);

    for (const commit of analysis.commits) {
      const contributorId = findOrCreateContributor(
        database,
        identityState,
        commit.authorName,
        commit.authorEmail
      );
      insertCommit.run({
        repoId: repo.id,
        hash: commit.hash,
        shortHash: commit.shortHash,
        contributorId,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        authorDate: commit.authorDate,
        committerName: commit.committerName,
        committerEmail: commit.committerEmail,
        committerDate: commit.committerDate,
        subject: commit.subject,
        body: commit.body,
        parents: JSON.stringify(commit.parents),
        isMerge: commit.isMerge ? 1 : 0,
        insertions: commit.insertions,
        deletions: commit.deletions,
        filesChanged: commit.filesChanged
      });
    }

    for (const branch of analysis.commitBranches) {
      insertCommitBranch.run({
        repoId: repo.id,
        commitHash: branch.commitHash,
        branchName: branch.branchName,
        remote: branch.remote ?? ""
      });
    }

    for (const stat of analysis.fileStats) {
      insertStat.run({
        id: crypto.randomUUID(),
        repoId: repo.id,
        commitHash: stat.commitHash,
        path: stat.path,
        oldPath: stat.oldPath,
        status: stat.status,
        insertions: stat.insertions,
        deletions: stat.deletions,
        isBinary: stat.isBinary ? 1 : 0,
        extension: stat.extension,
        topLevelDirectory: stat.topLevelDirectory
      });
    }

    for (const branch of analysis.branches) {
      insertBranch.run({
        repoId: repo.id,
        name: branch.name,
        remote: branch.remote ?? "",
        isDefault: branch.isDefault ? 1 : 0,
        headCommitHash: branch.headCommitHash,
        lastCommitAt: branch.lastCommitAt,
        createdAtEstimate: branch.createdAtEstimate,
        providerCreatedAt: branch.providerCreatedAt,
        branchTimeSource: branch.branchTimeSource,
        updatedAt: branch.updatedAt
      });
    }

    for (const file of analysis.files) {
      insertRepositoryFile.run({
        id: crypto.randomUUID(),
        repoId: repo.id,
        path: file.path,
        extension: file.extension,
        topLevelDirectory: file.topLevelDirectory,
        byteSize: file.byteSize,
        lineCount: file.lineCount,
        isBinary: file.isBinary ? 1 : 0,
        updatedAt: file.updatedAt
      });
    }

    database.sqlite
      .prepare(
        "UPDATE repositories SET default_branch = ?, last_refresh_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(analysis.defaultBranch ?? repo.defaultBranch, now, now, repo.id);
  });

  transaction();
}

export async function getProjectSummary(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<ProjectSummary> {
  if (hasFolderFilters(filters)) {
    return getProjectSummaryFromFileStats(database, projectId, filters);
  }

  const query = buildCommitFilterSql(projectId, filters);
  const repoWhere = filters.repositoryId ? " AND id = @repositoryId" : "";
  const repositoriesRow = database.sqlite
    .prepare<
      { projectId: string; repositoryId?: string },
      { count: number }
    >(`SELECT COUNT(*) AS count FROM repositories WHERE project_id = @projectId${repoWhere}`)
    .get({ projectId, repositoryId: filters.repositoryId });
  const summary = database.sqlite
    .prepare<Record<string, string | number>, SummaryRow>(
      `
      SELECT
        COUNT(DISTINCT c.hash) AS commits,
        COUNT(DISTINCT c.contributor_id) AS contributors,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.insertions ELSE 0 END), 0) AS insertions,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.deletions ELSE 0 END), 0) AS deletions,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.files_changed ELSE 0 END), 0) AS filesChanged,
        MAX(c.author_date) AS lastActivity
      FROM commits c
      JOIN repositories r ON r.id = c.repo_id
      ${query.whereSql}
    `
    )
    .get(query.params);
  const branchesRow = database.sqlite
    .prepare<Record<string, string | number>, { count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM branches b
      JOIN repositories r ON r.id = b.repo_id
      WHERE r.project_id = @projectId${filters.repositoryId ? " AND r.id = @repositoryId" : ""}
    `
    )
    .get(query.params);

  return {
    projectId,
    repositories: repositoriesRow?.count ?? 0,
    commits: summary?.commits ?? 0,
    contributors: summary?.contributors ?? 0,
    insertions: summary?.insertions ?? 0,
    deletions: summary?.deletions ?? 0,
    netLines: (summary?.insertions ?? 0) - (summary?.deletions ?? 0),
    filesChanged: summary?.filesChanged ?? 0,
    branches: branchesRow?.count ?? 0,
    lastActivity: summary?.lastActivity ?? null
  };
}

export async function getContributorLeaderboard(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<ContributorLeaderboardRow[]> {
  if (hasFolderFilters(filters)) {
    return getContributorLeaderboardFromFileStats(database, projectId, filters);
  }

  const query = buildCommitFilterSql(projectId, filters);
  return database.sqlite
    .prepare<Record<string, string | number>, ContributorLeaderboardRow>(
      `
      SELECT
        COALESCE(co.id, c.contributor_id, c.author_email, c.author_name) AS contributorId,
        COALESCE(co.display_name, c.author_name, c.author_email, 'Unknown') AS displayName,
        co.primary_email AS primaryEmail,
        COUNT(c.hash) AS commits,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.insertions ELSE 0 END), 0) AS insertions,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.deletions ELSE 0 END), 0) AS deletions,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.insertions - c.deletions ELSE 0 END), 0) AS netLines,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.files_changed ELSE 0 END), 0) AS filesChanged,
        MIN(c.author_date) AS firstActivity,
        MAX(c.author_date) AS lastActivity
      FROM commits c
      JOIN repositories r ON r.id = c.repo_id
      LEFT JOIN contributors co ON co.id = c.contributor_id
      ${query.whereSql}
      GROUP BY contributorId, displayName, primaryEmail
      ORDER BY commits DESC, COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.insertions + c.deletions ELSE 0 END), 0) DESC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

export async function getProjectActivity(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<ActivityBucket[]> {
  if (hasFolderFilters(filters)) {
    return getProjectActivityFromFileStats(database, projectId, filters);
  }

  const query = buildCommitFilterSql(projectId, filters);
  return database.sqlite
    .prepare<Record<string, string | number>, ActivityBucket>(
      `
      SELECT
        substr(c.author_date, 1, 10) AS date,
        COUNT(c.hash) AS commits,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.insertions ELSE 0 END), 0) AS insertions,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.deletions ELSE 0 END), 0) AS deletions,
        COUNT(DISTINCT c.contributor_id) AS activeContributors
      FROM commits c
      JOIN repositories r ON r.id = c.repo_id
      ${query.whereSql}
      GROUP BY date
      ORDER BY date ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

export async function getRepositoryComparison(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<RepositoryComparisonRow[]> {
  if (hasFolderFilters(filters)) {
    return getRepositoryComparisonFromFileStats(database, projectId, filters);
  }

  const query = buildCommitFilterSql(projectId, filters);
  return database.sqlite
    .prepare<Record<string, string | number>, RepositoryComparisonRow>(
      `
      SELECT
        r.id AS repositoryId,
        r.name AS repositoryName,
        COUNT(c.hash) AS commits,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.insertions ELSE 0 END), 0) AS insertions,
        COALESCE(SUM(CASE WHEN c.is_merge = 0 THEN c.deletions ELSE 0 END), 0) AS deletions,
        COUNT(DISTINCT c.contributor_id) AS contributors,
        MAX(c.author_date) AS lastActivity
      FROM repositories r
      LEFT JOIN commits c ON c.repo_id = r.id
      ${query.whereSql.replace("WHERE", "WHERE")}
      GROUP BY r.id, r.name
      ORDER BY commits DESC, repositoryName ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

function getProjectSummaryFromFileStats(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters
): ProjectSummary {
  const query = buildFileChangeFilterSql(projectId, filters);
  const repoWhere = filters.repositoryId ? " AND id = @repositoryId" : "";
  const repositoriesRow = database.sqlite
    .prepare<
      { projectId: string; repositoryId?: string },
      { count: number }
    >(`SELECT COUNT(*) AS count FROM repositories WHERE project_id = @projectId${repoWhere}`)
    .get({ projectId, repositoryId: filters.repositoryId });
  const summary = database.sqlite
    .prepare<Record<string, string | number>, SummaryRow>(
      `
      SELECT
        COUNT(DISTINCT c.hash) AS commits,
        COUNT(DISTINCT c.contributor_id) AS contributors,
        COALESCE(SUM(s.insertions), 0) AS insertions,
        COALESCE(SUM(s.deletions), 0) AS deletions,
        COUNT(*) AS filesChanged,
        MAX(c.author_date) AS lastActivity
      FROM commit_file_stats s
      JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
      JOIN repositories r ON r.id = s.repo_id
      ${query.whereSql}
    `
    )
    .get(query.params);
  const branchesRow = database.sqlite
    .prepare<Record<string, string | number>, { count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM branches b
      JOIN repositories r ON r.id = b.repo_id
      WHERE r.project_id = @projectId${filters.repositoryId ? " AND r.id = @repositoryId" : ""}
    `
    )
    .get(query.params);

  return {
    projectId,
    repositories: repositoriesRow?.count ?? 0,
    commits: summary?.commits ?? 0,
    contributors: summary?.contributors ?? 0,
    insertions: summary?.insertions ?? 0,
    deletions: summary?.deletions ?? 0,
    netLines: (summary?.insertions ?? 0) - (summary?.deletions ?? 0),
    filesChanged: summary?.filesChanged ?? 0,
    branches: branchesRow?.count ?? 0,
    lastActivity: summary?.lastActivity ?? null
  };
}

function getContributorLeaderboardFromFileStats(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters
): ContributorLeaderboardRow[] {
  const query = buildFileChangeFilterSql(projectId, filters);
  return database.sqlite
    .prepare<Record<string, string | number>, ContributorLeaderboardRow>(
      `
      SELECT
        COALESCE(co.id, c.contributor_id, c.author_email, c.author_name) AS contributorId,
        COALESCE(co.display_name, c.author_name, c.author_email, 'Unknown') AS displayName,
        co.primary_email AS primaryEmail,
        COUNT(DISTINCT c.hash) AS commits,
        COALESCE(SUM(s.insertions), 0) AS insertions,
        COALESCE(SUM(s.deletions), 0) AS deletions,
        COALESCE(SUM(s.insertions - s.deletions), 0) AS netLines,
        COUNT(*) AS filesChanged,
        MIN(c.author_date) AS firstActivity,
        MAX(c.author_date) AS lastActivity
      FROM commit_file_stats s
      JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
      JOIN repositories r ON r.id = s.repo_id
      LEFT JOIN contributors co ON co.id = c.contributor_id
      ${query.whereSql}
      GROUP BY contributorId, displayName, primaryEmail
      ORDER BY commits DESC, COALESCE(SUM(s.insertions + s.deletions), 0) DESC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

function getProjectActivityFromFileStats(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters
): ActivityBucket[] {
  const query = buildFileChangeFilterSql(projectId, filters);
  return database.sqlite
    .prepare<Record<string, string | number>, ActivityBucket>(
      `
      SELECT
        substr(c.author_date, 1, 10) AS date,
        COUNT(DISTINCT c.hash) AS commits,
        COALESCE(SUM(s.insertions), 0) AS insertions,
        COALESCE(SUM(s.deletions), 0) AS deletions,
        COUNT(DISTINCT c.contributor_id) AS activeContributors
      FROM commit_file_stats s
      JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
      JOIN repositories r ON r.id = s.repo_id
      ${query.whereSql}
      GROUP BY date
      ORDER BY date ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

function getRepositoryComparisonFromFileStats(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters
): RepositoryComparisonRow[] {
  const query = buildFileChangeFilterSql(projectId, filters);
  return database.sqlite
    .prepare<Record<string, string | number>, RepositoryComparisonRow>(
      `
      SELECT
        r.id AS repositoryId,
        r.name AS repositoryName,
        COUNT(DISTINCT c.hash) AS commits,
        COALESCE(SUM(s.insertions), 0) AS insertions,
        COALESCE(SUM(s.deletions), 0) AS deletions,
        COUNT(DISTINCT c.contributor_id) AS contributors,
        MAX(c.author_date) AS lastActivity
      FROM commit_file_stats s
      JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
      JOIN repositories r ON r.id = s.repo_id
      ${query.whereSql}
      GROUP BY r.id, r.name
      ORDER BY commits DESC, repositoryName ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

export async function getFileTypeAnalytics(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<FileTypeAnalyticsRow[]> {
  const inventoryQuery = buildRepositoryInventoryFilterSql(projectId, filters);
  const changesQuery = buildFileChangeFilterSql(projectId, filters);
  const orderBy = resolveFileTypeMetricOrder(filters.metric);

  return database.sqlite
    .prepare<Record<string, string | number>, FileTypeAnalyticsRow>(
      `
      WITH inventory AS (
        SELECT
          COALESCE(f.extension, '') AS ext_key,
          COUNT(*) AS fileCount,
          COALESCE(SUM(COALESCE(f.line_count, 0)), 0) AS lineCount,
          COALESCE(SUM(f.byte_size), 0) AS byteSize,
          COALESCE(SUM(CASE WHEN f.is_binary = 1 THEN 1 ELSE 0 END), 0) AS binaryFiles
        FROM repository_files f
        JOIN repositories r ON r.id = f.repo_id
        ${inventoryQuery.whereSql}
        GROUP BY ext_key
      ),
      changes AS (
        SELECT
          COALESCE(s.extension, '') AS ext_key,
          COUNT(DISTINCT s.path) AS touchedFiles,
          COUNT(*) AS touches,
          COUNT(DISTINCT c.hash) AS commits,
          COUNT(DISTINCT c.contributor_id) AS contributors,
          COALESCE(SUM(s.insertions), 0) AS insertions,
          COALESCE(SUM(s.deletions), 0) AS deletions,
          COALESCE(SUM(s.insertions - s.deletions), 0) AS netLines,
          COALESCE(SUM(s.insertions + s.deletions), 0) AS churn
        FROM commit_file_stats s
        JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
        JOIN repositories r ON r.id = s.repo_id
        ${changesQuery.whereSql}
        GROUP BY ext_key
      ),
      keys AS (
        SELECT ext_key FROM inventory
        UNION
        SELECT ext_key FROM changes
      )
      SELECT
        NULLIF(k.ext_key, '') AS extension,
        COALESCE(i.fileCount, 0) AS fileCount,
        COALESCE(i.lineCount, 0) AS lineCount,
        COALESCE(i.byteSize, 0) AS byteSize,
        COALESCE(i.binaryFiles, 0) AS binaryFiles,
        COALESCE(ch.touchedFiles, 0) AS touchedFiles,
        COALESCE(ch.touches, 0) AS touches,
        COALESCE(ch.commits, 0) AS commits,
        COALESCE(ch.contributors, 0) AS contributors,
        COALESCE(ch.insertions, 0) AS insertions,
        COALESCE(ch.deletions, 0) AS deletions,
        COALESCE(ch.netLines, 0) AS netLines,
        COALESCE(ch.churn, 0) AS churn
      FROM keys k
      LEFT JOIN inventory i ON i.ext_key = k.ext_key
      LEFT JOIN changes ch ON ch.ext_key = k.ext_key
      ORDER BY ${orderBy} DESC, fileCount DESC, extension ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({
      ...inventoryQuery.params,
      ...changesQuery.params,
      limit: changesQuery.limit,
      offset: changesQuery.offset
    });
}

export async function getHotFiles(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<HotFileAnalyticsRow[]> {
  const query = buildFileChangeFilterSql(projectId, filters);
  const orderBy = resolveHotFileMetricOrder(filters.metric);

  return database.sqlite
    .prepare<Record<string, string | number>, HotFileAnalyticsRow>(
      `
      SELECT
        r.id AS repositoryId,
        r.name AS repositoryName,
        s.path,
        s.extension,
        s.top_level_directory AS topLevelDirectory,
        MAX(f.line_count) AS currentLines,
        MAX(f.byte_size) AS byteSize,
        COUNT(DISTINCT s.path) AS touchedFiles,
        COUNT(*) AS touches,
        COUNT(DISTINCT c.hash) AS commits,
        COUNT(DISTINCT c.contributor_id) AS contributors,
        COALESCE(SUM(s.insertions), 0) AS insertions,
        COALESCE(SUM(s.deletions), 0) AS deletions,
        COALESCE(SUM(s.insertions - s.deletions), 0) AS netLines,
        COALESCE(SUM(s.insertions + s.deletions), 0) AS churn,
        MIN(c.author_date) AS firstActivity,
        MAX(c.author_date) AS lastActivity
      FROM commit_file_stats s
      JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
      JOIN repositories r ON r.id = s.repo_id
      LEFT JOIN repository_files f ON f.repo_id = s.repo_id AND f.path = s.path
      ${query.whereSql}
      GROUP BY r.id, r.name, s.path, s.extension, s.top_level_directory
      ORDER BY ${orderBy} DESC, lastActivity DESC, s.path ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

export async function getContributorFileTypes(
  database: GGDatabase,
  projectId: string,
  filters: AnalyticsFilters = {}
): Promise<ContributorFileTypeRow[]> {
  const query = buildFileChangeFilterSql(projectId, filters);
  const orderBy = resolveContributorFileTypeMetricOrder(filters.metric);

  return database.sqlite
    .prepare<Record<string, string | number>, ContributorFileTypeRow>(
      `
      WITH rows AS (
        SELECT
          COALESCE(co.id, c.contributor_id, c.author_email, c.author_name) AS contributorId,
          COALESCE(co.display_name, c.author_name, c.author_email, 'Unknown') AS displayName,
          co.primary_email AS primaryEmail,
          COALESCE(s.extension, '') AS ext_key,
          COUNT(DISTINCT s.path) AS touchedFiles,
          COUNT(*) AS touches,
          COUNT(DISTINCT c.hash) AS commits,
          COALESCE(SUM(s.insertions), 0) AS insertions,
          COALESCE(SUM(s.deletions), 0) AS deletions,
          COALESCE(SUM(s.insertions - s.deletions), 0) AS netLines,
          COALESCE(SUM(s.insertions + s.deletions), 0) AS churn,
          MIN(c.author_date) AS firstActivity,
          MAX(c.author_date) AS lastActivity
        FROM commit_file_stats s
        JOIN commits c ON c.repo_id = s.repo_id AND c.hash = s.commit_hash
        JOIN repositories r ON r.id = s.repo_id
        LEFT JOIN contributors co ON co.id = c.contributor_id
        ${query.whereSql}
        GROUP BY contributorId, displayName, primaryEmail, ext_key
      )
      SELECT
        contributorId,
        displayName,
        primaryEmail,
        NULLIF(ext_key, '') AS extension,
        touchedFiles,
        touches,
        commits,
        insertions,
        deletions,
        netLines,
        churn,
        CASE
          WHEN SUM(churn) OVER (PARTITION BY contributorId) = 0 THEN 0
          ELSE CAST(churn AS REAL) / SUM(churn) OVER (PARTITION BY contributorId)
        END AS shareOfContributorChurn,
        firstActivity,
        lastActivity
      FROM rows
      ORDER BY ${orderBy} DESC, displayName ASC, extension ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ ...query.params, limit: query.limit, offset: query.offset });
}

export async function getRepositoryContributors(
  database: GGDatabase,
  repoId: string,
  filters: AnalyticsFilters = {}
): Promise<ContributorLeaderboardRow[]> {
  const repo = await getRepository(database, repoId);
  if (!repo) {
    return [];
  }
  return getContributorLeaderboard(database, repo.projectId, { ...filters, repositoryId: repoId });
}

export async function getRepositoryActivity(
  database: GGDatabase,
  repoId: string,
  filters: AnalyticsFilters = {}
): Promise<ActivityBucket[]> {
  const repo = await getRepository(database, repoId);
  if (!repo) {
    return [];
  }
  return getProjectActivity(database, repo.projectId, { ...filters, repositoryId: repoId });
}

export async function getRepositorySummary(
  database: GGDatabase,
  repoId: string,
  filters: AnalyticsFilters = {}
): Promise<ProjectSummary | null> {
  const repo = await getRepository(database, repoId);
  if (!repo) {
    return null;
  }
  return getProjectSummary(database, repo.projectId, { ...filters, repositoryId: repoId });
}


/** Paginated, project-scoped branch inventory. One SQLite read regardless of repo count. */
export function listProjectBranches(
  database: GGDatabase, projectId: string, limit = 200, offset = 0
): { items: ProjectBranch[]; total: number } {
  const total = (database.sqlite.prepare(
    "SELECT COUNT(*) AS count FROM branches b JOIN repositories r ON r.id=b.repo_id WHERE r.project_id=?"
  ).get(projectId) as { count: number }).count;
  const rows = database.sqlite.prepare(
    "SELECT b.repo_id AS repoId, r.name AS repositoryName, b.name, " +
    "NULLIF(b.remote, '') AS remote, b.is_default AS isDefault, " +
    "b.head_commit_hash AS headCommitHash, b.last_commit_at AS lastCommitAt, " +
    "b.created_at_estimate AS createdAtEstimate, b.provider_created_at AS providerCreatedAt, " +
    "b.branch_time_source AS branchTimeSource, b.updated_at AS updatedAt " +
    "FROM branches b JOIN repositories r ON r.id=b.repo_id " +
    "WHERE r.project_id=? ORDER BY r.name COLLATE NOCASE, b.is_default DESC, b.name COLLATE NOCASE " +
    "LIMIT ? OFFSET ?"
  ).all(projectId, limit, offset) as Array<ProjectBranch & { isDefault: number | boolean }>;
  return { items: rows.map(row => ({ ...row, isDefault: Boolean(row.isDefault) })), total };
}

/** Paginated, project-scoped PR inventory. Provider status is resolved once in the API. */
export function listProjectPullRequests(
  database: GGDatabase, projectId: string, limit = 200, offset = 0
): { items: ProjectPullRequest[]; total: number } {
  const total = (database.sqlite.prepare(
    "SELECT COUNT(*) AS count FROM pull_requests p JOIN repositories r ON r.id=p.repo_id WHERE r.project_id=?"
  ).get(projectId) as { count: number }).count;
  const items = database.sqlite.prepare(
    "SELECT p.repo_id AS repoId, r.name AS repositoryName, p.provider, p.provider_id AS providerId, " +
    "p.number, p.title, p.state, p.author_login AS authorLogin, p.created_at AS createdAt, " +
    "p.updated_at AS updatedAt, p.closed_at AS closedAt, p.merged_at AS mergedAt, " +
    "p.base_branch AS baseBranch, p.head_branch AS headBranch, p.additions, p.deletions, " +
    "p.changed_files AS changedFiles, p.review_decision AS reviewDecision, p.url " +
    "FROM pull_requests p JOIN repositories r ON r.id=p.repo_id WHERE r.project_id=? " +
    "ORDER BY p.updated_at DESC, r.name COLLATE NOCASE, p.number DESC LIMIT ? OFFSET ?"
  ).all(projectId, limit, offset) as ProjectPullRequest[];
  return { items, total };
}

export async function listBranches(
  database: GGDatabase,
  repoId: string,
  filters: AnalyticsFilters = {}
): Promise<Branch[]> {
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  return database.sqlite
    .prepare<{ repoId: string; limit: number; offset: number }, Branch>(
      `
      SELECT
        repo_id AS repoId,
        name,
        NULLIF(remote, '') AS remote,
        is_default AS isDefault,
        head_commit_hash AS headCommitHash,
        last_commit_at AS lastCommitAt,
        created_at_estimate AS createdAtEstimate,
        provider_created_at AS providerCreatedAt,
        branch_time_source AS branchTimeSource,
        updated_at AS updatedAt
      FROM branches
      WHERE repo_id = @repoId
      ORDER BY is_default DESC, last_commit_at DESC, name ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ repoId, limit, offset })
    .map((branch) => ({ ...branch, isDefault: Boolean(branch.isDefault) }));
}

export async function listPullRequests(
  database: GGDatabase,
  repoId: string,
  filters: AnalyticsFilters = {}
): Promise<PullRequest[]> {
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  return database.sqlite
    .prepare<{ repoId: string; limit: number; offset: number }, PullRequest>(
      `
      SELECT
        repo_id AS repoId,
        provider,
        provider_id AS providerId,
        number,
        title,
        state,
        author_login AS authorLogin,
        created_at AS createdAt,
        updated_at AS updatedAt,
        closed_at AS closedAt,
        merged_at AS mergedAt,
        base_branch AS baseBranch,
        head_branch AS headBranch,
        additions,
        deletions,
        changed_files AS changedFiles,
        review_decision AS reviewDecision,
        url
      FROM pull_requests
      WHERE repo_id = @repoId
      ORDER BY updated_at DESC
      LIMIT @limit OFFSET @offset
    `
    )
    .all({ repoId, limit, offset });
}

export function replacePullRequests(
  database: GGDatabase,
  repoId: string,
  items: PullRequest[]
): void {
  const transaction = database.sqlite.transaction(() => {
    database.sqlite.prepare("DELETE FROM pull_requests WHERE repo_id = ?").run(repoId);
    const insertPullRequest = database.sqlite.prepare(`
      INSERT INTO pull_requests (
        id, repo_id, provider, provider_id, number, title, state, author_login,
        created_at, updated_at, closed_at, merged_at, base_branch, head_branch,
        additions, deletions, changed_files, review_decision, url
      ) VALUES (
        @id, @repoId, @provider, @providerId, @number, @title, @state, @authorLogin,
        @createdAt, @updatedAt, @closedAt, @mergedAt, @baseBranch, @headBranch,
        @additions, @deletions, @changedFiles, @reviewDecision, @url
      )
    `);

    for (const item of items) {
      insertPullRequest.run({
        id: crypto.randomUUID(),
        repoId,
        provider: item.provider,
        providerId: item.providerId,
        number: item.number,
        title: item.title,
        state: item.state,
        authorLogin: item.authorLogin,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        closedAt: item.closedAt,
        mergedAt: item.mergedAt,
        baseBranch: item.baseBranch,
        headBranch: item.headBranch,
        additions: item.additions,
        deletions: item.deletions,
        changedFiles: item.changedFiles,
        reviewDecision: item.reviewDecision,
        url: item.url
      });
    }
  });

  transaction();
}

function buildCommitFilterSql(projectId: string, filters: AnalyticsFilters): QueryFilters {
  const conditions = ["r.project_id = @projectId"];
  const params: Record<string, string | number> = { projectId };

  if (filters.repositoryId) {
    conditions.push("r.id = @repositoryId");
    params.repositoryId = filters.repositoryId;
  }
  if (filters.contributorId) {
    conditions.push("c.contributor_id = @contributorId");
    params.contributorId = filters.contributorId;
  }
  appendBranchScopeCondition(conditions, params, filters);
  if (filters.from) {
    conditions.push("c.author_date >= @from");
    params.from = filters.from;
  }
  if (filters.to) {
    conditions.push("c.author_date <= @to");
    params.to = filters.to;
  }

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    params,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0
  };
}

function buildFileChangeFilterSql(projectId: string, filters: AnalyticsFilters): QueryFilters {
  const conditions = ["r.project_id = @projectId", "c.is_merge = 0"];
  const params: Record<string, string | number> = { projectId };

  if (filters.repositoryId) {
    conditions.push("r.id = @repositoryId");
    params.repositoryId = filters.repositoryId;
  }
  if (filters.contributorId) {
    conditions.push("c.contributor_id = @contributorId");
    params.contributorId = filters.contributorId;
  }
  appendBranchScopeCondition(conditions, params, filters);
  if (filters.from) {
    conditions.push("c.author_date >= @from");
    params.from = filters.from;
  }
  if (filters.to) {
    conditions.push("c.author_date <= @to");
    params.to = filters.to;
  }
  appendFolderFilterCondition(conditions, params, filters, {
    repoColumn: "r.id",
    pathColumn: "s.path"
  });

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    params,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0
  };
}

function appendBranchScopeCondition(
  conditions: string[],
  params: Record<string, string | number>,
  filters: AnalyticsFilters
): void {
  if (filters.branchScope === "all") {
    return;
  }

  if (filters.branchScope === "default") {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM commit_branches cb
        WHERE cb.repo_id = c.repo_id
          AND cb.commit_hash = c.hash
          AND cb.branch_name = r.default_branch
      )
    `);
    return;
  }

  if (filters.branchScope === "custom") {
    const selections = parseBranchSelections(filters.branches);
    if (selections.length === 0) {
      conditions.push("1 = 0");
      return;
    }

    const selectionSql = selections
      .map((selection, index) => {
        params[`branchRepo${index}`] = selection.repositoryId;
        params[`branchName${index}`] = selection.branchName;
        return `(cb.repo_id = @branchRepo${index} AND cb.branch_name = @branchName${index})`;
      })
      .join(" OR ");

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM commit_branches cb
        WHERE cb.repo_id = c.repo_id
          AND cb.commit_hash = c.hash
          AND (${selectionSql})
      )
    `);
    return;
  }

  if (filters.branch) {
    conditions.push(
      "EXISTS (SELECT 1 FROM commit_branches cb WHERE cb.repo_id = c.repo_id AND cb.commit_hash = c.hash AND cb.branch_name = @branch)"
    );
    params.branch = filters.branch;
  }
}

function parseBranchSelections(
  values: string[] | undefined
): Array<{ repositoryId: string; branchName: string }> {
  if (!values) {
    return [];
  }

  const selections: Array<{ repositoryId: string; branchName: string }> = [];
  const seen = new Set<string>();

  for (const value of values) {
    const separatorIndex = value.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      continue;
    }
    const repositoryId = value.slice(0, separatorIndex);
    const branchName = value.slice(separatorIndex + 1);
    const key = `${repositoryId}\0${branchName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selections.push({ repositoryId, branchName });
  }

  return selections;
}

function hasFolderFilters(filters: AnalyticsFilters): boolean {
  return parseSerializedFolderFilters(filters.folderFilters).length > 0;
}

function appendFolderFilterCondition(
  conditions: string[],
  params: Record<string, string | number>,
  filters: AnalyticsFilters,
  aliases: { repoColumn: string; pathColumn: string }
): void {
  const folderFilters = parseSerializedFolderFilters(filters.folderFilters);
  if (folderFilters.length === 0) {
    return;
  }

  for (const [filterIndex, filter] of folderFilters.entries()) {
    const pathChecks = filter.paths.map((folderPath, pathIndex) => {
      const exactParam = `folderPath${filterIndex}_${pathIndex}`;
      const nestedParam = `folderPathNested${filterIndex}_${pathIndex}`;
      params[exactParam] = folderPath;
      params[nestedParam] = `${folderPath}/%`;
      return `(${aliases.pathColumn} = @${exactParam} OR ${aliases.pathColumn} LIKE @${nestedParam})`;
    });
    if (pathChecks.length === 0) {
      continue;
    }

    const repoParam = `folderRepo${filterIndex}`;
    params[repoParam] = filter.repositoryId;
    const pathSql = pathChecks.join(" OR ");
    conditions.push(
      filter.mode === "include"
        ? `(${aliases.repoColumn} <> @${repoParam} OR (${aliases.repoColumn} = @${repoParam} AND (${pathSql})))`
        : `(${aliases.repoColumn} <> @${repoParam} OR (${aliases.repoColumn} = @${repoParam} AND NOT (${pathSql})))`
    );
  }
}

function parseSerializedFolderFilters(values: string[] | undefined): RepositoryFolderFilter[] {
  if (!values) {
    return [];
  }

  const parsed: RepositoryFolderFilter[] = [];
  for (const value of values) {
    const firstSeparator = value.indexOf(":");
    const secondSeparator =
      firstSeparator >= 0 ? value.indexOf(":", firstSeparator + 1) : -1;
    if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) {
      continue;
    }

    const repositoryId = value.slice(0, firstSeparator);
    const mode = value.slice(firstSeparator + 1, secondSeparator);
    const folderPath = value.slice(secondSeparator + 1);
    if (mode !== "include" && mode !== "exclude") {
      continue;
    }
    parsed.push({
      repositoryId,
      mode,
      paths: [folderPath]
    });
  }

  return normalizeRepositoryFolderFilters(parsed);
}

function buildRepositoryInventoryFilterSql(
  projectId: string,
  filters: AnalyticsFilters
): QueryFilters {
  const conditions = ["r.project_id = @projectId"];
  const params: Record<string, string | number> = { projectId };

  if (filters.repositoryId) {
    conditions.push("r.id = @repositoryId");
    params.repositoryId = filters.repositoryId;
  }
  appendFolderFilterCondition(conditions, params, filters, {
    repoColumn: "r.id",
    pathColumn: "f.path"
  });

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    params,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0
  };
}

function resolveFileTypeMetricOrder(metric: string | undefined): string {
  switch (metric) {
    case "files":
      return "fileCount";
    case "lines":
      return "lineCount";
    case "insertions":
      return "insertions";
    case "deletions":
      return "deletions";
    case "netLines":
      return "netLines";
    case "commits":
      return "commits";
    case "churn":
    default:
      return "churn";
  }
}

function resolveHotFileMetricOrder(metric: string | undefined): string {
  switch (metric) {
    case "lines":
      return "currentLines";
    case "files":
      return "touchedFiles";
    case "insertions":
      return "insertions";
    case "deletions":
      return "deletions";
    case "netLines":
      return "netLines";
    case "commits":
      return "commits";
    case "churn":
    default:
      return "churn";
  }
}

function resolveContributorFileTypeMetricOrder(metric: string | undefined): string {
  switch (metric) {
    case "files":
    case "lines":
      return "touchedFiles";
    case "insertions":
      return "insertions";
    case "deletions":
      return "deletions";
    case "netLines":
      return "netLines";
    case "commits":
      return "commits";
    case "churn":
    default:
      return "churn";
  }
}

interface SummaryRow {
  commits: number;
  contributors: number;
  insertions: number;
  deletions: number;
  filesChanged: number;
  lastActivity: string | null;
}

interface IdentityState {
  identityToContributor: Map<string, string>;
  emailToContributor: Map<string, string>;
  exactIdentity: Set<string>;
}

function loadIdentityState(database: GGDatabase): IdentityState {
  const rows = database.sqlite
    .prepare<
      [],
      {
        contributorId: string;
        name: string;
        email: string;
        source: string;
      }
    >("SELECT contributor_id AS contributorId, name, email, source FROM contributor_identities")
    .all();
  const identityToContributor = new Map<string, string>();
  const emailToContributor = new Map<string, string>();
  const exactIdentity = new Set<string>();

  for (const row of rows) {
    identityToContributor.set(normalizeIdentityKey(row.name, row.email), row.contributorId);
    exactIdentity.add(exactIdentityKey(row.source, row.name, row.email));
    const normalizedEmail = normalizeEmail(row.email);
    if (normalizedEmail && !emailToContributor.has(normalizedEmail)) {
      emailToContributor.set(normalizedEmail, row.contributorId);
    }
  }

  return { identityToContributor, emailToContributor, exactIdentity };
}

function findOrCreateContributor(
  database: GGDatabase,
  state: IdentityState,
  name: string,
  email: string
): string {
  const normalizedEmail = normalizeEmail(email);
  const identityKey = normalizeIdentityKey(name, email);
  const existingContributor =
    state.identityToContributor.get(identityKey) ??
    (normalizedEmail ? state.emailToContributor.get(normalizedEmail) : undefined);

  if (existingContributor) {
    insertIdentityIfMissing(database, state, existingContributor, name, email);
    return existingContributor;
  }

  const now = new Date().toISOString();
  const contributorId = crypto.randomUUID();
  database.sqlite
    .prepare(
      "INSERT INTO contributors (id, display_name, primary_email, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(contributorId, chooseDisplayName(name, email), normalizedEmail, null, now, now);
  insertIdentityIfMissing(database, state, contributorId, name, email);
  return contributorId;
}

function insertIdentityIfMissing(
  database: GGDatabase,
  state: IdentityState,
  contributorId: string,
  name: string,
  email: string
): void {
  const exactKey = exactIdentityKey("git", name, email);
  if (state.exactIdentity.has(exactKey)) {
    return;
  }

  database.sqlite
    .prepare(
      "INSERT OR IGNORE INTO contributor_identities (id, contributor_id, name, email, source) VALUES (?, ?, ?, ?, 'git')"
    )
    .run(crypto.randomUUID(), contributorId, name, email);
  state.exactIdentity.add(exactKey);
  state.identityToContributor.set(normalizeIdentityKey(name, email), contributorId);
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && !state.emailToContributor.has(normalizedEmail)) {
    state.emailToContributor.set(normalizedEmail, contributorId);
  }
}

function exactIdentityKey(source: string, name: string, email: string): string {
  return `${source}\0${name}\0${email}`;
}

function projectToRow(project: Project): typeof projects.$inferInsert {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function branchViewToRow(view: BranchView): typeof branchViews.$inferInsert {
  return {
    id: view.id,
    projectId: view.projectId,
    name: view.name,
    branchesJson: JSON.stringify(view.branches),
    folderFiltersJson: JSON.stringify(view.folderFilters),
    createdAt: view.createdAt,
    updatedAt: view.updatedAt
  };
}

function branchViewFromRow(row: BranchViewRow): BranchView {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    branches: parseBranchViewBranches(row.branchesJson),
    folderFilters: parseRepositoryFolderFilters(row.folderFiltersJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function parseBranchViewBranches(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeBranchViewBranches(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeBranchViewBranches(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function parseRepositoryFolderFilters(value: string): RepositoryFolderFilter[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeRepositoryFolderFilters(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeRepositoryFolderFilters(values: unknown[]): RepositoryFolderFilter[] {
  const byRepository = new Map<
    string,
    { repositoryId: string; mode: FolderFilterMode; paths: Set<string> }
  >();

  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const candidate = value as {
      repositoryId?: unknown;
      mode?: unknown;
      paths?: unknown;
    };
    if (
      typeof candidate.repositoryId !== "string" ||
      candidate.repositoryId.trim().length === 0 ||
      (candidate.mode !== "include" && candidate.mode !== "exclude") ||
      !Array.isArray(candidate.paths)
    ) {
      continue;
    }

    const paths = normalizeFolderPaths(candidate.paths);
    if (paths.length === 0) {
      continue;
    }

    const repositoryId = candidate.repositoryId.trim();
    const existing = byRepository.get(repositoryId);
    if (existing && existing.mode === candidate.mode) {
      for (const folderPath of paths) {
        existing.paths.add(folderPath);
      }
      continue;
    }

    byRepository.set(repositoryId, {
      repositoryId,
      mode: candidate.mode,
      paths: new Set(paths)
    });
  }

  return [...byRepository.values()]
    .map((filter) => ({
      repositoryId: filter.repositoryId,
      mode: filter.mode,
      paths: [...filter.paths].sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
}

function normalizeFolderPaths(values: unknown[]): string[] {
  const paths = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().replace(/^\/+/, "").replace(/\/+$/, ""))
    .filter((value) => value.length > 0);
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function repositoryFromRow(row: RepositoryRow): Repository {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    url: row.url,
    localPath: row.localPath,
    provider: row.provider,
    defaultBranch: row.defaultBranch,
    cachePath: row.cachePath,
    lastRefreshAt: row.lastRefreshAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function refreshRunToRow(run: RefreshRun): typeof refreshRuns.$inferInsert {
  return {
    id: run.id,
    projectId: run.projectId,
    repositoryId: run.repositoryId,
    scope: run.scope,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    errorMessage: run.errorMessage,
    gitFetchMs: run.gitFetchMs,
    analysisMs: run.analysisMs,
    providerFetchMs: run.providerFetchMs,
    progressTotal: run.progressTotal,
    progressCompleted: run.progressCompleted,
    currentStep: run.currentStep,
    currentRepositoryName: run.currentRepositoryName
  };
}

function refreshRunPatchToRow(
  input: Partial<RefreshRun>
): Partial<typeof refreshRuns.$inferInsert> {
  return {
    status: input.status,
    finishedAt: input.finishedAt,
    errorMessage: input.errorMessage,
    gitFetchMs: input.gitFetchMs,
    analysisMs: input.analysisMs,
    providerFetchMs: input.providerFetchMs,
    progressTotal: input.progressTotal,
    progressCompleted: input.progressCompleted,
    currentStep: input.currentStep,
    currentRepositoryName: input.currentRepositoryName
  };
}

function refreshRunFromRow(row: RefreshRunRow): RefreshRun {
  return {
    id: row.id,
    projectId: row.projectId,
    repositoryId: row.repositoryId,
    scope: row.scope,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorMessage: row.errorMessage,
    gitFetchMs: row.gitFetchMs,
    analysisMs: row.analysisMs,
    providerFetchMs: row.providerFetchMs,
    progressTotal: row.progressTotal,
    progressCompleted: row.progressCompleted,
    currentStep: row.currentStep,
    currentRepositoryName: row.currentRepositoryName
  };
}
