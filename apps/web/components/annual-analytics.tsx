"use client";

import type { AnnualContributor } from "@gg/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { AnnualMonthlyChart } from "@/components/annual-monthly-chart";
import { AnnualEvidencePanel } from "@/components/annual-evidence-panel";
import {
  getAnnualReport, indexAnnualProject
} from "@/lib/api";
import { annualCsv, downloadLocalReport } from "@/lib/annual-export";

type SortKey = "contribution" | "productivity" | "commits" | "adjustedChurn" | "substantiveCommits" | "reviewableChurn" | "testTouchedCommits";

function amount(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}
function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
function metric(label: string, value: number, subtext?: string) {
  return (
    <div key={label} className="rounded-md border border-border bg-panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{amount(value)}</div>
      {subtext ? <div className="mt-1 text-xs text-muted-foreground">{subtext}</div> : null}
    </div>
  );
}

function csvName(year: number): string {
  return `gg-annual-contribution-${year}`;
}

export function AnnualAnalytics({
  projectId, repositoryId, onRunStarted
}: {
  projectId: string;
  repositoryId: string;
  onRunStarted: (runId: string) => void;
}) {
  const [yearText, setYearText] = useState(String(new Date().getFullYear()));
  const year = Number(yearText);
  const validYear = Number.isInteger(year) && year >= 1970 && year <= 2100;
  const [sort, setSort] = useState<SortKey>("contribution");
  const [focusEmail, setFocusEmail] = useState("");

  const repoFilter = repositoryId === "all" ? undefined : repositoryId;
  const annualQuery = useQuery({
    queryKey: ["annual", projectId, year, repoFilter],
    queryFn: () => getAnnualReport(projectId, year, repoFilter),
    enabled: validYear
  });
  const indexMutation = useMutation({
    mutationFn: () => indexAnnualProject(projectId),
    onSuccess: (run) => onRunStarted(run.id)
  });
  const report = annualQuery.data;
  const scoreByEmail = useMemo(() => new Map(
    (report?.evidenceScores.contributors ?? []).map((item) => [item.email, item])
  ), [report]);
  const rows = useMemo(() => {
    const value = (item: AnnualContributor): number => {
      if (sort === "contribution") return scoreByEmail.get(item.primaryEmail)?.effectiveContributionScore ?? -1;
      if (sort === "productivity") return scoreByEmail.get(item.primaryEmail)?.productivityProxyScore ?? -1;
      return item[sort];
    };
    return [...(report?.contributors ?? [])].sort((a, b) =>
      value(b) - value(a) || a.displayName.localeCompare(b.displayName));
  }, [report, sort, scoreByEmail]);
  const focus = report?.contributors.some((item) => item.primaryEmail === focusEmail)
    ? focusEmail : null;
  const coveredRepos = report?.coverage.filter((item) => item.complete).length ?? 0;

  function exportReport(format: "csv" | "json") {
    if (!report) return;
    downloadLocalReport(
      `${csvName(report.year)}.${format}`,
      format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
      format === "csv" ? annualCsv(report) : JSON.stringify(report, null, 2)
    );
  }

  return (
    <section className="grid gap-4" aria-label="Annual engineering contribution">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Annual engineering contribution</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Full reachable history for each repository&apos;s integration branch, locally
            indexed by commit SHA. Auditable metrics and two experimental relative scores
            for contribution evidence and technical throughput, not verified human productivity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Year
            <input
              type="number" min={1970} max={2100} step={1} value={yearText}
              onChange={(event) => setYearText(event.target.value)}
              className="h-9 w-24 rounded border border-border bg-background px-2 tabular-nums"
              aria-label="Analysis year"
            />
          </label>
          <button type="button" disabled={indexMutation.isPending}
            onClick={() => indexMutation.mutate()}
            className="inline-flex h-9 items-center gap-2 rounded border border-border bg-panel px-3 text-sm hover:bg-muted disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Index local history
          </button>
          <button type="button" disabled={!report} onClick={() => exportReport("csv")}
            className="inline-flex h-9 items-center gap-2 rounded border border-border bg-panel px-3 text-sm hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
          <button type="button" disabled={!report} onClick={() => exportReport("json")}
            className="inline-flex h-9 items-center gap-2 rounded border border-border bg-panel px-3 text-sm hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> JSON
          </button>
        </div>
      </div>

      {!validYear ? <p role="alert" className="text-sm text-danger">Enter a year between 1970 and 2100.</p> : null}
      {annualQuery.isError ? <p role="alert" className="text-sm text-danger">{annualQuery.error.message}</p> : null}
      {indexMutation.isError ? <p role="alert" className="text-sm text-danger">{indexMutation.error.message}</p> : null}
      {indexMutation.isSuccess ? <p role="status" className="text-sm text-muted-foreground">
        Local indexing has started. Progress appears in the dashboard header.
      </p> : null}

      {report ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-panel px-4 py-3 text-sm">
            <span>
              <strong>{coveredRepos}/{report.coverage.length}</strong> repositories indexed
              {report.complete ? " — full indexed coverage" : " — incomplete or not indexed"}
            </span>
            <span className="text-muted-foreground">
              No 500-commit sample limit. Counts reflect each selected reference&apos;s latest local snapshot.
            </span>
          </div>
          {!report.complete && (
            <div role="status" className="rounded-md border border-warning/60 bg-warning/10 p-3 text-sm">
              Coverage is incomplete. Click <strong>Index local history</strong> to process existing
              mirrors, or refresh the project first to fetch missing repositories.
              Do not compare partial counts as full-year totals.
            </div>
          )}
          <AnnualEvidencePanel report={report.evidenceScores} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            {metric("Integrated commits", report.totals.commits)}
            {metric("Developers", report.contributors.length)}
            {metric("Substantive commits", report.totals.substantiveCommits)}
            {metric("Cosmetic-only commits", report.totals.cosmeticOnlyCommits)}
            {metric("Adjusted churn", report.totals.adjustedChurn)}
            {metric("Commits touching tests", report.totals.testTouchedCommits)}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {metric("Gross churn", report.totals.grossChurn)}
            {metric("Move-aware churn", report.totals.renameAwareChurn)}
            {metric("Reviewable code/test churn", report.totals.reviewableChurn)}
            {metric("Generated-file churn", report.totals.generatedChurn)}
          </div>

          <div className="grid gap-3 rounded-md border border-border bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Per-developer indicators</h3>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Sort by
                <select aria-label="Sort developer metrics" value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="h-9 rounded border border-border bg-background px-2 text-foreground">
                  <option value="contribution">Effective contribution score</option>
                  <option value="productivity">Productivity proxy</option>
                  <option value="commits">Integrated commits</option>
                  <option value="substantiveCommits">Substantive commits</option>
                  <option value="adjustedChurn">Adjusted churn</option>
                  <option value="reviewableChurn">Reviewable churn</option>
                  <option value="testTouchedCommits">Commits touching tests</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Scores are experimental cohort-relative signals, not proof of individual performance.
              Churn excludes whitespace and detects renames. A dash means unavailable data.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-[1430px] w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    {["Developer", "Contribution score", "Productivity proxy", "Repos", "Commits", "Active days", "Substantive", "Cosmetic-only",
                      "Substantive %", "Gross churn", "Adjusted churn", "Retained %", "Code/test churn",
                      "Tests churn", "Docs churn", "Generated churn", "Touched tests",
                      "Merged PRs", "Reviewed PRs", "Approved PRs"].map((label) =>
                      <th key={label} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">{label}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.primaryEmail} className="border-b border-border/70 hover:bg-muted/50">
                      <td className="sticky left-0 bg-panel px-2 py-2">
                        <div className="font-medium">{item.displayName}</div>
                        <div className="max-w-48 truncate text-muted-foreground" title={item.primaryEmail}>
                          {item.primaryEmail}
                        </div>
                      </td>
                      <td className="px-2 py-2 font-semibold tabular-nums">{amount(scoreByEmail.get(item.primaryEmail)?.effectiveContributionScore ?? null)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(scoreByEmail.get(item.primaryEmail)?.productivityProxyScore ?? null)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.repositories)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.commits)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.activeDays)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.substantiveCommits)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.cosmeticOnlyCommits)}</td>
                      <td className="px-2 py-2 tabular-nums">{percent(item.substantiveRate)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.grossChurn)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.adjustedChurn)}</td>
                      <td className="px-2 py-2 tabular-nums">{percent(item.retainedChurnRate)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.reviewableChurn)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.testChurn)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.docsChurn)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.generatedChurn)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.testTouchedCommits)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.mergedPullRequests)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.reviewedPullRequests)}</td>
                      <td className="px-2 py-2 tabular-nums">{amount(item.approvedPullRequests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No indexed commits for this year.</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            Monthly focus
            <select aria-label="Developer for monthly trend" value={focus ?? ""}
              onChange={(event) => setFocusEmail(event.target.value)}
              className="h-9 min-w-56 max-w-full rounded border border-border bg-background px-2">
              <option value="">All developers</option>
              {report.contributors.map((item) =>
                <option key={item.primaryEmail} value={item.primaryEmail}>{item.displayName} ({item.primaryEmail})</option>
              )}
            </select>
          </label>
          <AnnualMonthlyChart data={report.monthly} year={year} email={focus} />

          <details className="rounded-md border border-border bg-panel p-4">
            <summary className="cursor-pointer text-sm font-semibold">Repository coverage and methodology</summary>
            <div className="mt-3 grid gap-2 text-sm">
              {report.coverage.map((item) => (
                <div key={item.repoId} className="flex flex-wrap justify-between gap-2 border-b border-border py-2">
                  <span className="font-medium">{item.repositoryName}
                    <span className="ml-2 font-normal text-muted-foreground">{item.ref ?? "No indexed branch"}</span>
                  </span>
                  <span className={item.complete ? "text-success" : "text-warning"}>
                    {item.indexedCommits.toLocaleString()} / {item.eligibleCommits.toLocaleString()} reachable SHAs
                    {item.complete ? " indexed" : " incomplete"}
                  </span>
                </div>
              ))}
              <p className="text-muted-foreground">
                Commits are counted when reachable from the selected integration reference and authored in the chosen year.
                Merge commits count as commits but contribute no own churn. Pure moves and whitespace-only changes
                may have low adjusted churn, which does not prove they were unnecessary.
                Source/test/docs/generated classification is heuristic. Snapshot freshness depends on your last refresh.
              </p>
            </div>
          </details>


        </>
      ) : (
        annualQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading local annual history...</p> : null
      )}
    </section>
  );
}
