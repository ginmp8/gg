/** Build ICE-Git evidence from existing SQLite diffs; never re-run Git or contact a provider. */
import type { AnnualReport, IceFileEvidence, IceSignal, IceScoreReport } from "@gg/core";
import { ICE_GIT_POLICY, scoreIceCohort } from "@gg/core";

import type { GGDatabase } from "./client";

type ReportBase = Omit<AnnualReport, "evidenceScores">;
type FileRow = {
  hash: string; email: string; path: string | null; category: string | null;
  additions: number | null; deletions: number | null; binary: number | null;
};

const CODE_FILE = /\.(?:c|cc|cpp|h|hpp|cs|css|dart|go|html|java|js|jsx|jsonc|kt|php|py|rb|rs|scala|scss|sh|sql|swift|ts|tsx|vue)$/i;

function fileWeight(category: string, path: string): number {
  if (category === "source" && CODE_FILE.test(path)) return ICE_GIT_POLICY.sourceWeight;
  if (category === "test") return ICE_GIT_POLICY.testWeight;
  if (category === "docs") return ICE_GIT_POLICY.docsWeight;
  return 0;
}

function rememberFile(target: IceFileEvidence[], evidence: IceFileEvidence): void {
  if (target.length >= ICE_GIT_POLICY.maximumEvidenceFiles) {
    const last = target[target.length - 1];
    if (last && evidence.weightedLines <= last.weightedLines) return;
    target.pop();
  }
  target.push(evidence);
  target.sort((left, right) =>
    right.weightedLines - left.weightedLines ||
    left.repoId.localeCompare(right.repoId) ||
    left.hash.localeCompare(right.hash) ||
    left.path.localeCompare(right.path)
  );
}

export function getAnnualEvidence(database: GGDatabase, report: ReportBase): IceScoreReport {
  if (!report.complete) return scoreIceCohort([], false, "incomplete_history");

  const identities = database.sqlite.prepare(
    "SELECT email,canonical_email AS canonicalEmail FROM annual_identity_links WHERE project_id = ?"
  ).all(report.projectId) as Array<{ email: string; canonicalEmail: string }>;
  const canonical = new Map(identities.map((link) => [link.email.toLowerCase(), link.canonicalEmail.toLowerCase()]));
  const months = new Map<string, number>();
  for (const row of report.monthly) months.set(row.email, (months.get(row.email) ?? 0) + 1);

  const signals = new Map<string, IceSignal>(report.contributors.map((developer) => [
    developer.primaryEmail, {
      email: developer.primaryEmail, displayName: developer.displayName,
      commits: developer.commits, materialCommits: 0, boundedDiffCredit: 0,
      supportedCommits: 0, activeMonths: months.get(developer.primaryEmail) ?? 0,
      mergedPullRequests: developer.mergedPullRequests,
      reviewedPullRequests: developer.reviewedPullRequests,
      fileEvidence: []
    }
  ]));
  const sql = database.sqlite.prepare(
    "SELECT m.hash AS hash, m.author_email AS email, f.path AS path, f.category AS category, " +
    "f.additions AS additions, f.deletions AS deletions, f.binary AS binary " +
    "FROM annual_ref_commits rc JOIN annual_commit_metrics m " +
    "ON m.repo_id=rc.repo_id AND m.hash=rc.hash " +
    "LEFT JOIN annual_file_changes f ON f.repo_id=m.repo_id AND f.hash=m.hash AND f.mode='adjusted' " +
    "WHERE rc.repo_id=? AND rc.ref=? AND m.analysis_version=1 AND substr(m.author_date,1,4)=? " +
    "ORDER BY m.hash, f.path"
  );

  for (const coverage of report.coverage) {
    if (!coverage.ref) continue;
    let currentHash: string | null = null;
    let author: IceSignal | undefined;
    let weighted = 0;
    let supported = false;
    const finish = () => {
      if (!author || weighted <= 0) return;
      author.materialCommits++;
      author.boundedDiffCredit += Math.log1p(Math.min(weighted, ICE_GIT_POLICY.maxWeightedLinesPerCommit)) /
        Math.log1p(ICE_GIT_POLICY.maxWeightedLinesPerCommit);
      if (supported) author.supportedCommits++;
    };
    for (const row of sql.iterate(coverage.repoId, coverage.ref, String(report.year)) as Iterable<FileRow>) {
      if (currentHash !== row.hash) {
        finish();
        currentHash = row.hash;
        const email = row.email.trim().toLowerCase();
        author = signals.get(canonical.get(email) ?? email);
        weighted = 0;
        supported = false;
      }
      if (!author || !row.path || row.binary || !row.category) continue;
      const weight = fileWeight(row.category, row.path);
      const adjustedLines = (row.additions ?? 0) + (row.deletions ?? 0);
      if (weight === 0 || adjustedLines <= 0) continue;
      const boundedLines = Math.min(adjustedLines, ICE_GIT_POLICY.maxLinesPerFile);
      const weightedLines = boundedLines * weight;
      weighted += weightedLines;
      if (row.category === "test" || row.category === "docs") supported = true;
      rememberFile(author.fileEvidence, {
        repoId: coverage.repoId, hash: row.hash, path: row.path,
        category: row.category as IceFileEvidence["category"],
        adjustedLines, boundedLines, weightedLines: Math.round(weightedLines * 100) / 100
      });
    }
    finish();
  }

  const collaborationComplete = report.coverage.length > 0 &&
    report.coverage.every((entry) => entry.prCoverageComplete ||
      // Local-only repositories have no GitHub metadata requirement.
      !database.sqlite.prepare("SELECT 1 FROM repositories WHERE id=? AND provider='github'")
        .get(entry.repoId));
  return scoreIceCohort([...signals.values()], collaborationComplete);
}
