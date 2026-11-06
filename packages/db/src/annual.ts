import type {
  AnnualCommitMetrics, AnnualCoverage, AnnualContributor, AnnualIdentityLink,
  AnnualMonthly, AnnualReport, AnnualTotals
} from "@gg/core";

import type { GGDatabase } from "./client";
import { getAnnualEvidence } from "./ice";

const VERSION = 1;

const METRICS = [
  ["grossChurn", "gross_churn"],
  ["renameAwareChurn", "rename_aware_churn"],
  ["adjustedChurn", "adjusted_churn"],
  ["estimatedMoveChurn", "estimated_move_churn"],
  ["estimatedWhitespaceChurn", "estimated_whitespace_churn"],
  ["sourceChurn", "source_churn"],
  ["testChurn", "test_churn"],
  ["docsChurn", "docs_churn"],
  ["generatedChurn", "generated_churn"],
  ["reviewableChurn", "reviewable_churn"],
  ["movedFiles", "moved_files"],
  ["pureMoves", "pure_moves"],
  ["binaryFiles", "binary_files"],
  ["substantiveCommits", "substantive_commits"],
  ["cosmeticOnlyCommits", "cosmetic_only_commits"],
  ["testTouchedCommits", "test_touched_commits"]
] as const;

type MetricsDbRow = { hash: string; author_email: string; author_name: string; author_date: string } &
  Record<(typeof METRICS)[number][1], number>;

function emptyTotals(): AnnualTotals {
  return {
    commits: 0, activeDays: 0,
    grossChurn: 0, renameAwareChurn: 0, adjustedChurn: 0,
    estimatedMoveChurn: 0, estimatedWhitespaceChurn: 0,
    sourceChurn: 0, testChurn: 0, docsChurn: 0, generatedChurn: 0,
    reviewableChurn: 0, movedFiles: 0, pureMoves: 0, binaryFiles: 0,
    substantiveCommits: 0, cosmeticOnlyCommits: 0, testTouchedCommits: 0
  };
}

function addMetrics(target: AnnualTotals, row: MetricsDbRow): void {
  target.commits++;
  for (const [key, column] of METRICS) target[key] += row[column];
}

export function annualCachedHashes(database: GGDatabase, repoId: string): Set<string> {
  const rows = database.sqlite.prepare(
    "SELECT hash FROM annual_commit_metrics WHERE repo_id = ? AND analysis_version = ?"
  ).all(repoId, VERSION) as Array<{ hash: string }>;
  return new Set(rows.map((row) => row.hash));
}

export function saveAnnualBatch(database: GGDatabase, repoId: string, items: AnnualCommitMetrics[]): void {
  if (!items.length) return;
  const columns = [
    "repo_id", "hash", "analysis_version", "author_email", "author_name", "author_date",
    ...METRICS.map(([, column]) => column)
  ];
  const insert = database.sqlite.prepare(
    `INSERT INTO annual_commit_metrics (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(",")}) ` +
    `ON CONFLICT(repo_id, hash) DO UPDATE SET ${columns.slice(2).map((column) => `${column}=excluded.${column}`).join(",")}`
  );
  const clearFiles = database.sqlite.prepare(
    "DELETE FROM annual_file_changes WHERE repo_id = ? AND hash = ?"
  );
  const insertFile = database.sqlite.prepare(
    "INSERT INTO annual_file_changes " +
    "(repo_id,hash,mode,path,old_path,additions,deletions,binary,category) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  const originalAuthor = database.sqlite.prepare(
    "SELECT author_email AS email, author_name AS name, author_date AS date " +
    "FROM commits WHERE repo_id = ? AND hash = ?"
  );
  database.sqlite.transaction(() => {
    for (const item of items) {
      // Merge commits are intentionally excluded from diff measurements,
      // but still retain their author and date for commit-count evidence.
      const stored = !item.authorDate
        ? originalAuthor.get(repoId, item.hash) as { email: string; name: string; date: string } | undefined
        : undefined;
      insert.run(
        repoId, item.hash, VERSION,
        item.authorEmail || stored?.email || "",
        item.authorName || stored?.name || "Unknown",
        item.authorDate || stored?.date || "",
        ...METRICS.map(([key]) => item[key])
      );
      clearFiles.run(repoId, item.hash);
      for (const file of item.changes) {
        insertFile.run(
          repoId, item.hash, file.mode, file.path, file.oldPath,
          file.additions, file.deletions, file.binary ? 1 : 0, file.category
        );
      }
    }
  })();
}

export function publishAnnualReference(
  database: GGDatabase, repoId: string, ref: string, head: string, hashes: string[]
): void {
  const count = database.sqlite.prepare(
    "SELECT COUNT(*) AS count FROM annual_commit_metrics WHERE repo_id = ? " +
    "AND analysis_version = ? AND hash IN (SELECT hash FROM annual_ref_commits WHERE repo_id = ? AND ref = ?)"
  );
  const drop = database.sqlite.prepare(
    "DELETE FROM annual_ref_commits WHERE repo_id = ? AND ref = ?"
  );
  const put = database.sqlite.prepare(
    "INSERT INTO annual_ref_commits (repo_id,ref,hash) VALUES (?,?,?)"
  );
  const state = database.sqlite.prepare(
    "INSERT INTO annual_ref_state (repo_id,ref,head_sha,indexed_at,eligible_commits,analysis_version) " +
    "VALUES (?,?,?,?,?,?) ON CONFLICT(repo_id,ref) DO UPDATE SET " +
    "head_sha=excluded.head_sha,indexed_at=excluded.indexed_at," +
    "eligible_commits=excluded.eligible_commits,analysis_version=excluded.analysis_version"
  );
  database.sqlite.transaction(() => {
    drop.run(repoId, ref);
    for (const sha of hashes) put.run(repoId, ref, sha);
    const available = count.get(repoId, VERSION, repoId, ref) as { count: number };
    if (available.count !== hashes.length) {
      throw new Error("Annual index is incomplete: reference membership was not published.");
    }
    state.run(repoId, ref, head, new Date().toISOString(), hashes.length, VERSION);
  })();
}

export function listAnnualIdentities(database: GGDatabase, projectId: string): AnnualIdentityLink[] {
  const rows = database.sqlite.prepare(
    "SELECT email,canonical_email AS canonicalEmail,github_login AS githubLogin " +
    "FROM annual_identity_links WHERE project_id = ? ORDER BY email"
  ).all(projectId) as AnnualIdentityLink[];
  return rows;
}

export function upsertAnnualIdentity(
  database: GGDatabase, projectId: string, link: AnnualIdentityLink
): void {
  database.sqlite.prepare(
    "INSERT INTO annual_identity_links (project_id,email,canonical_email,github_login) VALUES (?,?,?,?) " +
    "ON CONFLICT(project_id,email) DO UPDATE SET " +
    "canonical_email=excluded.canonical_email,github_login=excluded.github_login"
  ).run(projectId, link.email.trim().toLowerCase(), link.canonicalEmail.trim().toLowerCase(),
    link.githubLogin?.trim().toLowerCase() || null);
}

export interface CollaborationSnapshot {
  complete: boolean;
  pullRequests: Array<{
    number: number;
    authorLogin: string;
    mergedAt: string | null;
    url: string;
    reviews: Array<{ reviewerLogin: string; submittedAt: string; state: string }>;
  }>;
}

export function saveAnnualCollaboration(
  database: GGDatabase, repoId: string, snapshot: CollaborationSnapshot
): void {
  const clearPRs = database.sqlite.prepare("DELETE FROM annual_pull_requests WHERE repo_id = ?");
  const clearReviews = database.sqlite.prepare("DELETE FROM annual_pr_reviews WHERE repo_id = ?");
  const insertPR = database.sqlite.prepare(
    "INSERT INTO annual_pull_requests (repo_id,number,author_login,merged_at,url) VALUES (?,?,?,?,?)"
  );
  const insertReview = database.sqlite.prepare(
    "INSERT OR IGNORE INTO annual_pr_reviews " +
    "(repo_id,number,reviewer_login,submitted_at,state) VALUES (?,?,?,?,?)"
  );
  const state = database.sqlite.prepare(
    "INSERT INTO annual_pr_state(repo_id,fetched_at,complete) VALUES (?,?,?) " +
    "ON CONFLICT(repo_id) DO UPDATE SET fetched_at=excluded.fetched_at,complete=excluded.complete"
  );
  database.sqlite.transaction(() => {
    clearReviews.run(repoId);
    clearPRs.run(repoId);
    for (const item of snapshot.pullRequests) {
      insertPR.run(repoId, item.number, item.authorLogin.toLowerCase(), item.mergedAt, item.url);
      for (const review of item.reviews) {
        insertReview.run(repoId, item.number, review.reviewerLogin.toLowerCase(),
          review.submittedAt, review.state.toUpperCase());
      }
    }
    state.run(repoId, new Date().toISOString(), snapshot.complete ? 1 : 0);
  })();
}

interface RepositoryRow {
  id: string;
  name: string;
  default_branch: string | null;
  provider: string;
  last_refresh_at: string | null;
}
interface StateRow {
  ref: string;
  head_sha: string;
  indexed_at: string;
  eligible_commits: number;
  analysis_version: number;
}

function safePercent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(1000 * numerator / denominator) / 10 : null;
}

/**
 * Annual data is queried only from SQLite; displaying it never reaches a Git
 * remote or an API. Missing snapshots are null, never misleading zeroes.
 */
export function getAnnualReport(
  database: GGDatabase, projectId: string, year: number, selectedRepoId?: string
): AnnualReport {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error("Invalid analytics year.");
  }
  const repositoryRows = database.sqlite.prepare(
    "SELECT id,name,default_branch,provider,last_refresh_at FROM repositories WHERE project_id = ? ORDER BY name"
  ).all(projectId) as RepositoryRow[];
  const repos = selectedRepoId
    ? repositoryRows.filter((repo) => repo.id === selectedRepoId)
    : repositoryRows;

  const stateQuery = database.sqlite.prepare(
    "SELECT ref,head_sha,indexed_at,eligible_commits,analysis_version " +
    "FROM annual_ref_state WHERE repo_id = ? ORDER BY indexed_at DESC"
  );
  const countQuery = database.sqlite.prepare(
    "SELECT COUNT(*) AS count FROM annual_ref_commits rc JOIN annual_commit_metrics m " +
    "ON m.repo_id = rc.repo_id AND m.hash = rc.hash AND m.analysis_version = ? " +
    "WHERE rc.repo_id = ? AND rc.ref = ?"
  );
  const dataQuery = database.sqlite.prepare(
    "SELECT m.* FROM annual_ref_commits rc JOIN annual_commit_metrics m " +
    "ON m.repo_id = rc.repo_id AND m.hash = rc.hash AND m.analysis_version = ? " +
    "WHERE rc.repo_id = ? AND rc.ref = ? AND substr(m.author_date,1,4) = ?"
  );
  const prQuery = database.sqlite.prepare(
    "SELECT fetched_at AS fetchedAt,complete FROM annual_pr_state WHERE repo_id = ?"
  );
  const totals = emptyTotals();
  const allDates = new Set<string>();
  const coverage: AnnualCoverage[] = [];
  const identities = listAnnualIdentities(database, projectId);
  const links = new Map(identities.map((link) => [link.email, link]));
  const developers = new Map<string, AnnualContributor>();
  const developerDates = new Map<string, Set<string>>();
  const developerRepos = new Map<string, Set<string>>();
  const months = new Map<string, AnnualMonthly>();
  // A local repository without collaboration data cannot block a complete
  // GitHub snapshot. Conversely, an explicitly incomplete snapshot anywhere
  // in the selection must never be reported as complete.
  let allPrComplete = true;

  for (const repo of repos) {
    const states = stateQuery.all(repo.id) as StateRow[];
    const selectedRef = repo.default_branch
      ? `refs/heads/${repo.default_branch.replace(/^refs\/heads\//, "")}`
      : states[0]?.ref ?? null;
    const state = states.find((row) => row.ref === selectedRef);
    const indexedCount = state
      ? (countQuery.get(VERSION, repo.id, state.ref) as { count: number }).count
      : 0;
    // A Git-only refresh may advance the repository without reindexing annual
    // metrics. Never present an older snapshot as fully current.
    const complete = Boolean(state &&
      state.analysis_version === VERSION && indexedCount === state.eligible_commits &&
      (!repo.last_refresh_at || state.indexed_at >= repo.last_refresh_at));
    const prState = prQuery.get(repo.id) as { fetchedAt: string; complete: number } | undefined;
    if ((repo.provider === "github" && !prState) || (prState && prState.complete !== 1)) {
      allPrComplete = false;
    }
    coverage.push({
      repoId: repo.id, repositoryName: repo.name,
      ref: selectedRef, head: state?.head_sha ?? null,
      indexedAt: state?.indexed_at ?? null,
      eligibleCommits: state?.eligible_commits ?? 0,
      indexedCommits: indexedCount,
      complete,
      prCoverageComplete: prState?.complete === 1,
      prSnapshotAt: prState?.fetchedAt ?? null
    });
    if (!state) continue;
    const rows = dataQuery.all(VERSION, repo.id, state.ref, String(year)) as MetricsDbRow[];
    for (const row of rows) {
      const sourceEmail = row.author_email.trim().toLowerCase();
      const mapping = links.get(sourceEmail);
      const email = mapping?.canonicalEmail || sourceEmail;
      let contributor = developers.get(email);
      if (!contributor) {
        contributor = {
          ...emptyTotals(), primaryEmail: email,
          displayName: row.author_name || email || "Unknown",
          githubLogin: mapping?.githubLogin || links.get(email)?.githubLogin || null,
          repositories: 0, firstActivity: null, lastActivity: null,
          substantiveRate: null, retainedChurnRate: null, testTouchedRate: null,
          mergedPullRequests: null, reviewedPullRequests: null, approvedPullRequests: null
        };
        developers.set(email, contributor);
      }
      if (!contributor.githubLogin && mapping?.githubLogin) contributor.githubLogin = mapping.githubLogin;
      addMetrics(contributor, row);
      addMetrics(totals, row);
      const day = row.author_date.slice(0, 10);
      if (day) {
        allDates.add(day);
        const dates = developerDates.get(email) ?? new Set<string>();
        dates.add(day);
        developerDates.set(email, dates);
      }
      const repoIds = developerRepos.get(email) ?? new Set<string>();
      repoIds.add(repo.id);
      developerRepos.set(email, repoIds);
      if (!contributor.firstActivity || row.author_date < contributor.firstActivity)
        contributor.firstActivity = row.author_date;
      if (!contributor.lastActivity || row.author_date > contributor.lastActivity)
        contributor.lastActivity = row.author_date;
      const month = row.author_date.slice(0, 7);
      const key = `${email}\0${month}`;
      const monthly = months.get(key) ?? {
        email, month, commits: 0, adjustedChurn: 0, reviewableChurn: 0, testTouchedCommits: 0
      };
      monthly.commits++;
      monthly.adjustedChurn += row.adjusted_churn;
      monthly.reviewableChurn += row.reviewable_churn;
      monthly.testTouchedCommits += row.test_touched_commits;
      months.set(key, monthly);
    }
  }
  totals.activeDays = allDates.size;
  for (const [email, developer] of developers) {
    developer.activeDays = developerDates.get(email)?.size ?? 0;
    developer.repositories = developerRepos.get(email)?.size ?? 0;
    developer.substantiveRate = safePercent(developer.substantiveCommits, developer.commits);
    developer.retainedChurnRate = safePercent(developer.adjustedChurn, developer.grossChurn);
    developer.testTouchedRate = safePercent(developer.testTouchedCommits, developer.commits);

    const matching = coverage.filter((item) => item.prCoverageComplete).map((item) => item.repoId);
    if (developer.githubLogin && allPrComplete && matching.length > 0) {
      let merged = 0, reviewed = 0, approved = 0;
      const login = developer.githubLogin.toLowerCase();
      for (const repoId of matching) {
        const prRow = database.sqlite.prepare(
          "SELECT COUNT(*) AS count FROM annual_pull_requests WHERE repo_id = ? " +
          "AND author_login = ? AND substr(merged_at,1,4) = ?"
        ).get(repoId, login, String(year)) as { count: number };
        const reviewsRow = database.sqlite.prepare(
          "SELECT COUNT(DISTINCT CAST(number AS TEXT)) AS reviewed, " +
          "COUNT(DISTINCT CASE WHEN state = 'APPROVED' THEN CAST(number AS TEXT) END) AS approved " +
          "FROM annual_pr_reviews WHERE repo_id = ? AND reviewer_login = ? " +
          "AND substr(submitted_at,1,4) = ?"
        ).get(repoId, login, String(year)) as { reviewed: number; approved: number };
        merged += prRow.count;
        reviewed += reviewsRow.reviewed;
        approved += reviewsRow.approved;
      }
      developer.mergedPullRequests = merged;
      developer.reviewedPullRequests = reviewed;
      developer.approvedPullRequests = approved;
    }
  }

  const report: Omit<AnnualReport, "evidenceScores"> = {
    projectId, year,
    complete: coverage.length > 0 && coverage.every((entry) => entry.complete),
    coverage, totals,
    contributors: [...developers.values()].sort((left, right) =>
      right.commits - left.commits || left.primaryEmail.localeCompare(right.primaryEmail)),
    monthly: [...months.values()].sort((left, right) =>
      left.month.localeCompare(right.month) || left.email.localeCompare(right.email))
  };
  return { ...report, evidenceScores: getAnnualEvidence(database, report) };
}
