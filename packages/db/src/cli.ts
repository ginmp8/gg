import type { AnalyticsFilters, TagTargetType } from "@gita/core";
import { analyticsFiltersSchema } from "@gita/core";

import type { GitaDatabase } from "./client";
import { getAnnualReport, listAnnualIdentities } from "./annual";
import {
  getContributorFileTypes, getContributorLeaderboard, getFileTypeAnalytics, getHotFiles,
  getProject, getProjectActivity, getProjectSummary, getRepository, getRepositoryComparison,
  listBranches, listBranchViews, listProjectBranches, listProjectPullRequests,
  listProjects, listPullRequests, listRepositories
} from "./queries";
import { listProjectTags, listProjectTagTargets } from "./tags";

const COMMANDS = [
  "catalog", "health", "projects", "project", "repositories", "summary",
  "activity", "contributors", "repository-comparison", "file-types",
  "hot-files", "contributor-file-types", "branches", "pull-requests",
  "annual", "scores", "tags", "tag-targets", "branch-views",
  "annual-identities", "table"
] as const;
type Command = typeof COMMANDS[number];
type Flag = "project" | "repo" | "year" | "limit" | "offset" | "from" | "to" |
  "contributor" | "branch" | "branch-scope" | "branches" | "folder-filter" |
  "metric" | "type" | "search" | "table";
const FLAGS: readonly Flag[] = [
  "project", "repo", "year", "limit", "offset", "from", "to", "contributor",
  "branch", "branch-scope", "branches", "folder-filter", "metric", "type", "search", "table"
];
const REPEATABLE = new Set<Flag>(["branches", "folder-filter"]);
const ANALYTICS = new Set<Flag>([
  "project", "repo", "limit", "offset", "from", "to", "contributor",
  "branch", "branch-scope", "branches", "folder-filter", "metric"
]);
export const RAW_TABLES = [
  "projects", "repositories", "refresh_runs", "branch_views",
  "contributors", "contributor_identities", "commits", "commit_branches",
  "commit_file_stats", "repository_files", "branches", "pull_requests",
  "annual_commit_metrics", "annual_file_changes", "annual_ref_commits",
  "annual_ref_state", "annual_identity_links", "annual_pull_requests",
  "annual_pr_reviews", "annual_pr_state", "project_tags",
  "project_tag_assignments"
] as const;

const DESCRIPTIONS: Record<Command, string> = {
  catalog: "Discover available CLI commands and raw SQLite datasets",
  health: "Show the local database location and read-only status",
  projects: "List local projects",
  project: "Get one project by --project",
  repositories: "List repositories belonging to a project",
  summary: "Project summary and repository-level rollup",
  activity: "Time-series commit activity",
  contributors: "Contributor leaderboard",
  "repository-comparison": "Per-repository contribution and change metrics",
  "file-types": "File inventory and file-type churn",
  "hot-files": "Most changed files and contributors",
  "contributor-file-types": "Per-contributor file-type change evidence",
  branches: "Local branches, project-wide or --repo",
  "pull-requests": "Cached GitHub PRs, project-wide or --repo",
  annual: "Full annual contribution report, monthly metrics and score evidence",
  scores: "ICE-Git/1 and Gita-Throughput/1 contributor scores",
  tags: "Free-form tag definitions and assignments",
  "tag-targets": "Search taggable local entities",
  "branch-views": "Saved branch/folder view presets",
  "annual-identities": "Manually mapped Git and GitHub identities",
  table: "Read rows from an allowlisted raw SQLite table with --table"
};

export interface CliOptions {
  command: Command;
  values: Partial<Record<Flag, string>>;
  lists: Partial<Record<Flag, string[]>>;
}
export interface CliResponse {
  schemaVersion: "1";
  source: "local-sqlite";
  readOnly: true;
  command: string;
  data: unknown;
}
function numeric(name: string, raw: string | undefined, defaultValue: number, min: number, max: number): number {
  if (raw === undefined) return defaultValue;
  if (!/^[0-9]+$/.test(raw)) throw new Error(name + " must be a decimal integer.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(name + " must be between " + min + " and " + max + ".");
  }
  return value;
}
function date(raw: string | undefined, end: boolean): string | undefined {
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + (end ? "T23:59:59.999Z" : "T00:00:00.000Z");
  return raw;
}
export function parseGitaCliArgs(argv: string[]): CliOptions {
  const [word, ...rest] = argv;
  if (!COMMANDS.some(item => item === word)) {
    throw new Error("Unknown command: " + (word ?? "(none)") + ". Use 'catalog' or '--help'.");
  }
  const values: Partial<Record<Flag, string>> = {};
  const lists: Partial<Record<Flag, string[]>> = {};
  for (let i=0; i<rest.length; i+=2) {
    const flag = rest[i];
    const value = rest[i+1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Expected --flag value pairs after the command.");
    }
    const name = flag.slice(2) as Flag;
    if (!FLAGS.includes(name)) throw new Error("Unknown option: " + flag);
    if (REPEATABLE.has(name)) (lists[name] ??= []).push(value);
    else {
      if (values[name] !== undefined) throw new Error("Option repeated: " + flag);
      values[name] = value;
    }
  }
  const selected = new Set<Flag>([...Object.keys(values), ...Object.keys(lists)] as Flag[]);
  let allowed: Set<Flag>;
  switch (word) {
    case "catalog": case "health": case "projects": allowed = new Set(); break;
    case "project": case "repositories": case "tags": case "branch-views":
    case "annual-identities": allowed = new Set(["project"]); break;
    case "tag-targets": allowed = new Set(["project","type","search"]); break;
    case "table": allowed = new Set(["table","limit","offset"]); break;
    case "annual": case "scores": allowed = new Set(["project","repo","year"]); break;
    case "branches": case "pull-requests": allowed = new Set(["project","repo","limit","offset"]); break;
    default: allowed = new Set(ANALYTICS);
  }
  for (const option of selected) if (!allowed.has(option)) {
    throw new Error("Option --" + option + " is not supported for " + word + ".");
  }
  return { command: word, values, lists };
}
export function gitaCliHelp(): string {
  return [
    "Gita local read-only data CLI (0.2.0)",
    "Usage: npm run cli -- <command> [--option value]",
    "Commands: " + COMMANDS.join(", "),
    "Examples:",
    "  npm run cli -- projects",
    "  npm run cli -- scores --project PROJECT_ID --year 2026",
    "  npm run cli -- contributors --project PROJECT_ID --limit 100",
    "  npm run cli -- table --table annual_file_changes --limit 100",
    "  npm run cli -- catalog",
    "All successful queries print JSON to stdout. Errors print JSON to stderr.",
    "Data source: existing GITA_DATA_DIR/gita.sqlite or .gita/gita.sqlite. No HTTP/auth/network."
  ].join("\n");
}
export function gitaCliCatalog(): unknown {
  return {
    commands: COMMANDS.map(name => ({ name, description: DESCRIPTIONS[name] })),
    rawTables: RAW_TABLES,
    options: FLAGS.map(name => "--" + name),
    examples: [
      "npm run cli -- projects",
      "npm run cli -- annual --project PROJECT_ID --year 2026",
      "npm run cli -- scores --project PROJECT_ID --year 2026",
      "npm run cli -- table --table annual_file_changes --limit 100 --offset 0"
    ],
    authentication: "none",
    network: "disabled",
    data: "Existing local SQLite database only; no migrations or writes"
  };
}
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error("Missing required --" + name + ".");
  return value;
}
function filtersFrom(opts: CliOptions): AnalyticsFilters {
  const v = opts.values;
  const filters = {
    repositoryId: v.repo,
    contributorId: v.contributor,
    from: date(v.from,false),
    to: date(v.to,true),
    branch: v.branch,
    branchScope: v["branch-scope"],
    branches: opts.lists.branches,
    folderFilters: opts.lists["folder-filter"],
    metric: v.metric,
    limit: numeric("--limit",v.limit,100,1,500),
    offset: numeric("--offset",v.offset,0,0,1_000_000_000)
  };
  return analyticsFiltersSchema.parse(filters);
}
function withEnvelope(command: string, data: unknown): CliResponse {
  return { schemaVersion: "1", source: "local-sqlite", readOnly: true, command, data };
}
export async function executeGitaCli(db: GitaDatabase, argv: string[]): Promise<CliResponse> {
  const opts = parseGitaCliArgs(argv);
  const v = opts.values;
  const { command } = opts;
  if (command === "catalog") return withEnvelope(command,gitaCliCatalog());
  if (command === "health") return withEnvelope(command,{
    available: true, databasePath: db.paths.databasePath, readOnly: true
  });
  if (command === "projects") return withEnvelope(command,{items: await listProjects(db)});
  if (command === "table") {
    const table = required(v.table,"table");
    if (!(RAW_TABLES as readonly string[]).includes(table)) {
      throw new Error("Unknown raw table. Use 'catalog' for supported datasets.");
    }
    const limit = numeric("--limit",v.limit,100,1,500);
    const offset = numeric("--offset",v.offset,0,0,1_000_000_000);
    // Identifier is exclusively selected from the compile-time allowlist; no user SQL is executed.
    const total = (db.sqlite.prepare('SELECT COUNT(*) AS count FROM "'+table+'"')
      .get() as {count:number}).count;
    const items = db.sqlite.prepare('SELECT * FROM "'+table+'" ORDER BY rowid LIMIT ? OFFSET ?')
      .all(limit,offset);
    return withEnvelope(command,{table,total,limit,offset,items});
  }
  const projectId = required(v.project,"project");
  const project = await getProject(db,projectId);
  if (!project) throw new Error("Project not found: "+projectId);
  let repoId: string | undefined = v.repo;
  if (repoId) {
    const repo = await getRepository(db,repoId);
    if (!repo || repo.projectId !== projectId) throw new Error("Repository does not belong to selected project.");
  }
  if (command === "project") return withEnvelope(command,project);
  if (command === "repositories") return withEnvelope(command,{items:await listRepositories(db,projectId)});
  if (command === "branch-views") return withEnvelope(command,{items:await listBranchViews(db,projectId)});
  if (command === "annual-identities") return withEnvelope(command,{items:listAnnualIdentities(db,projectId)});
  if (command === "tags") return withEnvelope(command,listProjectTags(db,projectId));
  if (command === "tag-targets") {
    const type = required(v.type,"type") as TagTargetType;
    if (!["contributor","repository","branch","pull_request"].includes(type)) {
      throw new Error("Invalid --type. Use contributor, repository, branch, or pull_request.");
    }
    return withEnvelope(command,listProjectTagTargets(db,projectId,type,v.search ?? ""));
  }
  if (command === "annual" || command === "scores") {
    const year = numeric("--year",required(v.year,"year"),0,1970,2100);
    const annual = getAnnualReport(db,projectId,year,repoId);
    return withEnvelope(command,command === "annual" ? annual :
      {year,projectId,repositoryId:repoId ?? null,complete:annual.complete,
        coverage:annual.coverage, ...annual.evidenceScores});
  }
  const limit = numeric("--limit",v.limit,100,1,500);
  const offset = numeric("--offset",v.offset,0,0,1_000_000_000);
  if (command === "branches") {
    return withEnvelope(command,repoId ? {
      items:await listBranches(db,repoId,{limit,offset}),limit,offset
    }: {...listProjectBranches(db,projectId,limit,offset),limit,offset});
  }
  if (command === "pull-requests") {
    return withEnvelope(command,repoId ? {
      items:await listPullRequests(db,repoId,{limit,offset}),limit,offset
    }: {...listProjectPullRequests(db,projectId,limit,offset),limit,offset});
  }
  const filters = filtersFrom(opts);
  switch (command) {
    case "summary":
      return withEnvelope(command,{
        ...await getProjectSummary(db,projectId,filters),
        repositoryComparison: await getRepositoryComparison(db,projectId,filters)
      });
    case "activity": return withEnvelope(command,{items:await getProjectActivity(db,projectId,filters)});
    case "contributors": return withEnvelope(command,{items:await getContributorLeaderboard(db,projectId,filters)});
    case "repository-comparison":
      return withEnvelope(command,{items:await getRepositoryComparison(db,projectId,filters)});
    case "file-types": return withEnvelope(command,{items:await getFileTypeAnalytics(db,projectId,filters)});
    case "hot-files": return withEnvelope(command,{items:await getHotFiles(db,projectId,filters)});
    case "contributor-file-types":
      return withEnvelope(command,{items:await getContributorFileTypes(db,projectId,filters)});
  }
  // Exhaustive in TypeScript, but fail closed if a command is ever added without its handler.
  throw new Error("Unsupported command: "+command);
}
