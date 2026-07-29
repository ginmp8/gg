import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    localPath: text("local_path"),
    provider: text("provider", { enum: ["local", "github", "unknown"] }).notNull(),
    defaultBranch: text("default_branch"),
    cachePath: text("cache_path").notNull(),
    githubOwnerRepo: text("github_owner_repo"),
    lastRefreshAt: text("last_refresh_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    projectIdx: index("repositories_project_idx").on(table.projectId),
    providerIdx: index("repositories_provider_idx").on(table.provider)
  })
);

export const branchViews = sqliteTable(
  "branch_views",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    branchesJson: text("branches_json").notNull(),
    folderFiltersJson: text("folder_filters_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    projectIdx: index("branch_views_project_idx").on(table.projectId),
    uniqueName: uniqueIndex("branch_views_project_name_unique_idx").on(table.projectId, table.name)
  })
);

export const refreshRuns = sqliteTable(
  "refresh_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id").references(() => repositories.id, { onDelete: "set null" }),
    scope: text("scope", { enum: ["project", "repository"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    errorMessage: text("error_message"),
    gitFetchMs: integer("git_fetch_ms"),
    analysisMs: integer("analysis_ms"),
    providerFetchMs: integer("provider_fetch_ms"),
    progressTotal: integer("progress_total"),
    progressCompleted: integer("progress_completed"),
    currentStep: text("current_step"),
    currentRepositoryName: text("current_repository_name")
  },
  (table) => ({
    projectIdx: index("refresh_runs_project_idx").on(table.projectId),
    repositoryIdx: index("refresh_runs_repository_idx").on(table.repositoryId),
    statusIdx: index("refresh_runs_status_idx").on(table.status)
  })
);

export const contributors = sqliteTable(
  "contributors",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email"),
    avatarUrl: text("avatar_url"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    emailIdx: index("contributors_primary_email_idx").on(table.primaryEmail)
  })
);

export const contributorIdentities = sqliteTable(
  "contributor_identities",
  {
    id: text("id").primaryKey(),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    source: text("source", { enum: ["git", "github", "manual"] }).notNull()
  },
  (table) => ({
    contributorIdx: index("contributor_identities_contributor_idx").on(table.contributorId),
    emailIdx: index("contributor_identities_email_idx").on(table.email),
    uniqueIdentity: uniqueIndex("contributor_identities_unique_idx").on(
      table.source,
      table.name,
      table.email
    )
  })
);

export const commits = sqliteTable(
  "commits",
  {
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    shortHash: text("short_hash").notNull(),
    contributorId: text("contributor_id").references(() => contributors.id, {
      onDelete: "set null"
    }),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email").notNull(),
    authorDate: text("author_date").notNull(),
    committerName: text("committer_name").notNull(),
    committerEmail: text("committer_email").notNull(),
    committerDate: text("committer_date").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    parents: text("parents").notNull(),
    isMerge: integer("is_merge", { mode: "boolean" }).notNull(),
    insertions: integer("insertions").notNull(),
    deletions: integer("deletions").notNull(),
    filesChanged: integer("files_changed").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.hash] }),
    repoIdx: index("commits_repo_idx").on(table.repoId),
    contributorIdx: index("commits_contributor_idx").on(table.contributorId),
    authorDateIdx: index("commits_author_date_idx").on(table.authorDate)
  })
);

export const commitBranches = sqliteTable(
  "commit_branches",
  {
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    commitHash: text("commit_hash").notNull(),
    branchName: text("branch_name").notNull(),
    remote: text("remote").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.commitHash, table.branchName, table.remote] }),
    repoIdx: index("commit_branches_repo_idx").on(table.repoId),
    commitIdx: index("commit_branches_commit_idx").on(table.repoId, table.commitHash),
    branchIdx: index("commit_branches_branch_idx").on(table.repoId, table.branchName)
  })
);

export const commitFileStats = sqliteTable(
  "commit_file_stats",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    commitHash: text("commit_hash").notNull(),
    path: text("path").notNull(),
    oldPath: text("old_path"),
    status: text("status", {
      enum: ["added", "modified", "deleted", "renamed", "copied", "unknown"]
    }).notNull(),
    insertions: integer("insertions").notNull(),
    deletions: integer("deletions").notNull(),
    isBinary: integer("is_binary", { mode: "boolean" }).notNull(),
    extension: text("extension"),
    topLevelDirectory: text("top_level_directory")
  },
  (table) => ({
    repoIdx: index("commit_file_stats_repo_idx").on(table.repoId),
    commitIdx: index("commit_file_stats_commit_idx").on(table.repoId, table.commitHash),
    pathIdx: index("commit_file_stats_path_idx").on(table.path),
    directoryIdx: index("commit_file_stats_directory_idx").on(table.topLevelDirectory)
  })
);

export const repositoryFiles = sqliteTable(
  "repository_files",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    extension: text("extension"),
    topLevelDirectory: text("top_level_directory"),
    byteSize: integer("byte_size").notNull(),
    lineCount: integer("line_count"),
    isBinary: integer("is_binary", { mode: "boolean" }).notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    repoIdx: index("repository_files_repo_idx").on(table.repoId),
    pathIdx: index("repository_files_path_idx").on(table.path),
    extensionIdx: index("repository_files_extension_idx").on(table.extension),
    directoryIdx: index("repository_files_directory_idx").on(table.topLevelDirectory),
    lineCountIdx: index("repository_files_line_count_idx").on(table.lineCount)
  })
);

export const branches = sqliteTable(
  "branches",
  {
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    remote: text("remote"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull(),
    headCommitHash: text("head_commit_hash"),
    lastCommitAt: text("last_commit_at"),
    createdAtEstimate: text("created_at_estimate"),
    providerCreatedAt: text("provider_created_at"),
    branchTimeSource: text("branch_time_source", {
      enum: ["headCommit", "defaultBranchReachability", "providerMetadata"]
    }).notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repoId, table.name, table.remote] }),
    repoIdx: index("branches_repo_idx").on(table.repoId),
    lastCommitIdx: index("branches_last_commit_idx").on(table.lastCommitAt)
  })
);

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["github"] }).notNull(),
    providerId: text("provider_id").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state", { enum: ["open", "closed", "merged", "unknown"] }).notNull(),
    authorLogin: text("author_login"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    closedAt: text("closed_at"),
    mergedAt: text("merged_at"),
    baseBranch: text("base_branch").notNull(),
    headBranch: text("head_branch").notNull(),
    additions: integer("additions"),
    deletions: integer("deletions"),
    changedFiles: integer("changed_files"),
    reviewDecision: text("review_decision"),
    url: text("url").notNull()
  },
  (table) => ({
    repoIdx: index("pull_requests_repo_idx").on(table.repoId),
    createdIdx: index("pull_requests_created_idx").on(table.createdAt),
    uniqueProvider: uniqueIndex("pull_requests_provider_unique_idx").on(
      table.repoId,
      table.providerId
    )
  })
);
