import fs from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export interface GitaPaths {
  rootDir: string;
  dataDir: string;
  databasePath: string;
  reposDir: string;
  logsDir: string;
  exportsDir: string;
  tmpDir: string;
}

export interface GitaDatabase {
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database<typeof schema>;
  paths: GitaPaths;
}

export function findWorkspaceRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);

  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, "AGENTS.md")) &&
      fs.existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    current = path.dirname(current);
  }

  return path.resolve(startDir);
}

export function resolveGitaPaths(startDir = process.cwd()): GitaPaths {
  const rootDir = process.env.GITA_ROOT
    ? path.resolve(process.env.GITA_ROOT)
    : findWorkspaceRoot(startDir);
  const dataDir = process.env.GITA_DATA_DIR
    ? path.resolve(process.env.GITA_DATA_DIR)
    : path.join(rootDir, ".gita");

  return {
    rootDir,
    dataDir,
    databasePath: path.join(dataDir, "gita.sqlite"),
    reposDir: path.join(dataDir, "repos"),
    logsDir: path.join(dataDir, "logs"),
    exportsDir: path.join(dataDir, "exports"),
    tmpDir: path.join(dataDir, "tmp")
  };
}

export function openGitaDatabase(startDir = process.cwd()): GitaDatabase {
  const paths = resolveGitaPaths(startDir);
  ensureGitaDirectories(paths);

  const sqlite = new BetterSqlite3(paths.databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  migrateDatabase(sqlite);

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    paths
  };
}

export function ensureGitaDirectories(paths: GitaPaths): void {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.reposDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.mkdirSync(paths.exportsDir, { recursive: true });
  fs.mkdirSync(paths.tmpDir, { recursive: true });
}

export function migrateDatabase(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      local_path TEXT,
      provider TEXT NOT NULL,
      default_branch TEXT,
      cache_path TEXT NOT NULL,
      github_owner_repo TEXT,
      last_refresh_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_message TEXT,
      git_fetch_ms INTEGER,
      analysis_ms INTEGER,
      provider_fetch_ms INTEGER,
      progress_total INTEGER,
      progress_completed INTEGER,
      current_step TEXT,
      current_repository_name TEXT
    );

    CREATE TABLE IF NOT EXISTS branch_views (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      branches_json TEXT NOT NULL,
      folder_filters_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contributors (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      primary_email TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contributor_identities (
      id TEXT PRIMARY KEY,
      contributor_id TEXT NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commits (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      short_hash TEXT NOT NULL,
      contributor_id TEXT REFERENCES contributors(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      author_date TEXT NOT NULL,
      committer_name TEXT NOT NULL,
      committer_email TEXT NOT NULL,
      committer_date TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      parents TEXT NOT NULL,
      is_merge INTEGER NOT NULL,
      insertions INTEGER NOT NULL,
      deletions INTEGER NOT NULL,
      files_changed INTEGER NOT NULL,
      PRIMARY KEY (repo_id, hash)
    );

    CREATE TABLE IF NOT EXISTS commit_branches (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      commit_hash TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      remote TEXT NOT NULL,
      PRIMARY KEY (repo_id, commit_hash, branch_name, remote)
    );

    CREATE TABLE IF NOT EXISTS commit_file_stats (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      commit_hash TEXT NOT NULL,
      path TEXT NOT NULL,
      old_path TEXT,
      status TEXT NOT NULL,
      insertions INTEGER NOT NULL,
      deletions INTEGER NOT NULL,
      is_binary INTEGER NOT NULL,
      extension TEXT,
      top_level_directory TEXT
    );

    CREATE TABLE IF NOT EXISTS repository_files (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      extension TEXT,
      top_level_directory TEXT,
      byte_size INTEGER NOT NULL,
      line_count INTEGER,
      is_binary INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      remote TEXT,
      is_default INTEGER NOT NULL,
      head_commit_hash TEXT,
      last_commit_at TEXT,
      created_at_estimate TEXT,
      provider_created_at TEXT,
      branch_time_source TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, name, remote)
    );

    CREATE TABLE IF NOT EXISTS pull_requests (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      author_login TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      merged_at TEXT,
      base_branch TEXT NOT NULL,
      head_branch TEXT NOT NULL,
      additions INTEGER,
      deletions INTEGER,
      changed_files INTEGER,
      review_decision TEXT,
      url TEXT NOT NULL
    );

    -- Non-destructive incremental annual analytics. Immutable per-SHA measurements
    -- survive branch movement; only the selected reference's membership changes.
    CREATE TABLE IF NOT EXISTS annual_commit_metrics (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      analysis_version INTEGER NOT NULL,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_date TEXT NOT NULL,
      gross_churn INTEGER NOT NULL,
      rename_aware_churn INTEGER NOT NULL,
      adjusted_churn INTEGER NOT NULL,
      estimated_move_churn INTEGER NOT NULL,
      estimated_whitespace_churn INTEGER NOT NULL,
      source_churn INTEGER NOT NULL,
      test_churn INTEGER NOT NULL,
      docs_churn INTEGER NOT NULL,
      generated_churn INTEGER NOT NULL,
      reviewable_churn INTEGER NOT NULL,
      moved_files INTEGER NOT NULL,
      pure_moves INTEGER NOT NULL,
      binary_files INTEGER NOT NULL,
      substantive_commits INTEGER NOT NULL,
      cosmetic_only_commits INTEGER NOT NULL,
      test_touched_commits INTEGER NOT NULL,
      PRIMARY KEY (repo_id, hash)
    );
    CREATE INDEX IF NOT EXISTS annual_metric_date_idx
      ON annual_commit_metrics(repo_id, author_date);
    CREATE TABLE IF NOT EXISTS annual_file_changes (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      mode TEXT NOT NULL,
      path TEXT NOT NULL,
      old_path TEXT,
      additions INTEGER NOT NULL,
      deletions INTEGER NOT NULL,
      binary INTEGER NOT NULL,
      category TEXT NOT NULL,
      PRIMARY KEY (repo_id, hash, mode, path)
    );
    CREATE INDEX IF NOT EXISTS annual_files_commit_idx
      ON annual_file_changes(repo_id, hash);
    CREATE TABLE IF NOT EXISTS annual_ref_commits (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      ref TEXT NOT NULL,
      hash TEXT NOT NULL,
      PRIMARY KEY (repo_id, ref, hash)
    );
    CREATE INDEX IF NOT EXISTS annual_ref_commit_idx
      ON annual_ref_commits(repo_id, hash);
    CREATE TABLE IF NOT EXISTS annual_ref_state (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      ref TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      eligible_commits INTEGER NOT NULL,
      analysis_version INTEGER NOT NULL,
      PRIMARY KEY (repo_id, ref)
    );
    CREATE TABLE IF NOT EXISTS annual_identity_links (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      canonical_email TEXT NOT NULL,
      github_login TEXT,
      PRIMARY KEY (project_id, email)
    );
    CREATE TABLE IF NOT EXISTS annual_pull_requests (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      author_login TEXT NOT NULL,
      merged_at TEXT,
      url TEXT NOT NULL,
      PRIMARY KEY (repo_id, number)
    );
    CREATE TABLE IF NOT EXISTS annual_pr_reviews (
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      reviewer_login TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      PRIMARY KEY (repo_id, number, reviewer_login, submitted_at, state)
    );
    CREATE TABLE IF NOT EXISTS annual_pr_state (
      repo_id TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
      fetched_at TEXT NOT NULL,
      complete INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS annual_pr_author_idx
      ON annual_pull_requests(repo_id, author_login, merged_at);
    CREATE INDEX IF NOT EXISTS annual_pr_reviewer_idx
      ON annual_pr_reviews(repo_id, reviewer_login, submitted_at);

    CREATE INDEX IF NOT EXISTS repositories_project_idx ON repositories(project_id);
    CREATE INDEX IF NOT EXISTS repositories_provider_idx ON repositories(provider);
    CREATE INDEX IF NOT EXISTS branch_views_project_idx ON branch_views(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS branch_views_project_name_unique_idx
      ON branch_views(project_id, name);
    CREATE INDEX IF NOT EXISTS refresh_runs_project_idx ON refresh_runs(project_id);
    CREATE INDEX IF NOT EXISTS refresh_runs_repository_idx ON refresh_runs(repository_id);
    CREATE INDEX IF NOT EXISTS refresh_runs_status_idx ON refresh_runs(status);
    CREATE INDEX IF NOT EXISTS contributors_primary_email_idx ON contributors(primary_email);
    CREATE INDEX IF NOT EXISTS contributor_identities_contributor_idx ON contributor_identities(contributor_id);
    CREATE INDEX IF NOT EXISTS contributor_identities_email_idx ON contributor_identities(email);
    CREATE UNIQUE INDEX IF NOT EXISTS contributor_identities_unique_idx
      ON contributor_identities(source, name, email);
    CREATE INDEX IF NOT EXISTS commits_repo_idx ON commits(repo_id);
    CREATE INDEX IF NOT EXISTS commits_contributor_idx ON commits(contributor_id);
    CREATE INDEX IF NOT EXISTS commits_author_date_idx ON commits(author_date);
    CREATE INDEX IF NOT EXISTS commit_branches_repo_idx ON commit_branches(repo_id);
    CREATE INDEX IF NOT EXISTS commit_branches_commit_idx ON commit_branches(repo_id, commit_hash);
    CREATE INDEX IF NOT EXISTS commit_branches_branch_idx ON commit_branches(repo_id, branch_name);
    CREATE INDEX IF NOT EXISTS commit_file_stats_repo_idx ON commit_file_stats(repo_id);
    CREATE INDEX IF NOT EXISTS commit_file_stats_commit_idx ON commit_file_stats(repo_id, commit_hash);
    CREATE INDEX IF NOT EXISTS commit_file_stats_path_idx ON commit_file_stats(path);
    CREATE INDEX IF NOT EXISTS commit_file_stats_directory_idx ON commit_file_stats(top_level_directory);
    CREATE INDEX IF NOT EXISTS repository_files_repo_idx ON repository_files(repo_id);
    CREATE INDEX IF NOT EXISTS repository_files_path_idx ON repository_files(path);
    CREATE INDEX IF NOT EXISTS repository_files_extension_idx ON repository_files(extension);
    CREATE INDEX IF NOT EXISTS repository_files_directory_idx ON repository_files(top_level_directory);
    CREATE INDEX IF NOT EXISTS repository_files_line_count_idx ON repository_files(line_count);
    CREATE INDEX IF NOT EXISTS branches_repo_idx ON branches(repo_id);
    CREATE INDEX IF NOT EXISTS branches_last_commit_idx ON branches(last_commit_at);
    CREATE INDEX IF NOT EXISTS pull_requests_repo_idx ON pull_requests(repo_id);
    CREATE INDEX IF NOT EXISTS pull_requests_created_idx ON pull_requests(created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS pull_requests_provider_unique_idx
      ON pull_requests(repo_id, provider_id);
  `);

  ensureColumn(sqlite, "refresh_runs", "progress_total", "INTEGER");
  ensureColumn(sqlite, "refresh_runs", "progress_completed", "INTEGER");
  ensureColumn(sqlite, "refresh_runs", "current_step", "TEXT");
  ensureColumn(sqlite, "refresh_runs", "current_repository_name", "TEXT");
  ensureColumn(sqlite, "branch_views", "folder_filters_json", "TEXT NOT NULL DEFAULT '[]'");
}

function ensureColumn(
  sqlite: BetterSqlite3.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === columnName)) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
