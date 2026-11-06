"use client";

import type { AnnualContributor, IceContributorScore } from "@gita/core";
import { tagsForTarget } from "@gita/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getAnnualReport, getProjectTags } from "@/lib/api";

function textNumber(value: number | null | undefined, fraction = 0): string {
  if (value === null || value === undefined) return "N/A";
  return value.toLocaleString("en-US", { maximumFractionDigits: fraction });
}
function pct(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(1) + "%";
}
type ScoreRow = { person: AnnualContributor; evidence: IceContributorScore | undefined };

export function ContributorSideBySide({
  projectId, repositoryId
}: { projectId: string; repositoryId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<string[]>([]);
  const [tagId, setTagId] = useState("");
  const [search, setSearch] = useState("");
  const validYear = year >= 1970 && year <= 2100 && Number.isInteger(year);
  const annual = useQuery({
    queryKey: ["annual", projectId, year, repositoryId === "all" ? undefined : repositoryId],
    queryFn: () => getAnnualReport(projectId, year, repositoryId === "all" ? undefined : repositoryId),
    enabled: validYear
  });
  const tags = useQuery({
    queryKey: ["project-tags", projectId],
    queryFn: () => getProjectTags(projectId)
  });
  const data = annual.data;
  const scoreByEmail = useMemo(() =>
    new Map((data?.evidenceScores.contributors ?? []).map(row => [row.email, row])), [data]
  );
  const tagById = new Map((tags.data?.items ?? []).map(item => [item.id, item]));
  const people = useMemo(() => (data?.contributors ?? []).filter(person => {
    const matchesTag = !tagId || (tags.data &&
      tagsForTarget(tags.data, "contributor", person.primaryEmail).includes(tagId));
    return matchesTag && (
      person.displayName.toLowerCase().includes(search.trim().toLowerCase()) ||
      person.primaryEmail.toLowerCase().includes(search.trim().toLowerCase())
    );
  }), [data, tagId, tags.data, search]);
  const selectable = new Set((data?.contributors ?? []).filter(person =>
    !tagId || (tags.data &&
      tagsForTarget(tags.data, "contributor", person.primaryEmail).includes(tagId))
  ).map(person => person.primaryEmail));
  const chosen: ScoreRow[] = (data?.contributors ?? [])
    .filter(person => selected.includes(person.primaryEmail) && selectable.has(person.primaryEmail))
    .sort((a,b) => selected.indexOf(a.primaryEmail) - selected.indexOf(b.primaryEmail))
    .map(person => ({ person, evidence: scoreByEmail.get(person.primaryEmail) }));
  const max = 4;

  function choose(email: string) {
    setSelected(previous => previous.includes(email)
      ? previous.filter(item => item !== email)
      : previous.length < max ? [...previous, email] : previous);
  }

  const rows: Array<{ label: string; value: (item: ScoreRow) => number | null; format?: "pct" | "fixed" }> = [
    { label: "Effective contribution · ICE-Git/1", value: item => item.evidence?.effectiveContributionScore ?? null, format: "fixed" },
    { label: "Productivity proxy · Gita-Throughput/1", value: item => item.evidence?.productivityProxyScore ?? null, format: "fixed" },
    { label: "GitHub-enhanced contribution", value: item => item.evidence?.combinedContributionScore ?? null, format: "fixed" },
    { label: "Material commits", value: item => item.evidence?.materialCommits ?? null },
    { label: "Bounded technical diff units", value: item => item.evidence?.boundedDiffCredit ?? null, format: "fixed" },
    { label: "Active months", value: item => item.evidence?.activeMonths ?? null },
    { label: "Integrated commits", value: item => item.person.commits },
    { label: "Substantive commits", value: item => item.person.substantiveCommits },
    { label: "Substantive commit rate", value: item => item.person.substantiveRate, format: "pct" },
    { label: "Reviewable source/test churn", value: item => item.person.reviewableChurn },
    { label: "Test touched commits", value: item => item.person.testTouchedCommits },
    { label: "Active days", value: item => item.person.activeDays },
    { label: "Merged pull requests", value: item => item.person.mergedPullRequests },
    { label: "Reviewed pull requests", value: item => item.person.reviewedPullRequests },
    { label: "Approved pull requests", value: item => item.person.approvedPullRequests }
  ];

  return (
    <section aria-label="Side-by-side contributor comparison" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-accent" />
            <h2 className="text-xl font-semibold">Compare contributors</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Choose two to four developers, then inspect their evidence scores and underlying measures
            in parallel. Tags narrow the candidate set without changing the score calculation cohort.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">Analysis year
          <input aria-label="Comparison year" type="number" min={1970} max={2100}
            className="h-9 w-24 rounded border border-border bg-background px-2 tabular-nums"
            value={year} onChange={event => setYear(Number(event.target.value))} />
        </label>
      </div>
      {!validYear && <p role="alert" className="text-sm text-danger">Choose a valid year.</p>}
      {annual.isError && <p role="alert" className="text-sm text-danger">{annual.error.message}</p>}
      {tags.isError && <p role="alert" className="text-sm text-danger">{tags.error.message}</p>}
      {annual.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading local annual metrics…</p>}
      {data && !data.complete && <p role="status" className="rounded border border-warning/60 p-3 text-sm text-warning">
        Annual history is not fully indexed. Scores are unavailable until indexing is complete.
      </p>}
      <div className="grid gap-3 rounded-md border border-border bg-panel p-4 lg:grid-cols-[200px_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs">Filter by custom tag
          <select aria-label="Filter contributors by tag" value={tagId}
            onChange={event => setTagId(event.target.value)}
            className="h-9 rounded border border-border bg-background px-2 text-sm">
            <option value="">All tags</option>
            {(tags.data?.items ?? []).map(tag => (
              <option key={tag.id} value={tag.id}>{tag.group ? tag.group + " / " : ""}{tag.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">Find contributors
          <span className="flex h-9 items-center gap-2 rounded border border-border bg-background px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input aria-label="Search contributors" value={search} onChange={event => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Filter by name or email" />
          </span>
        </label>
        <div className="flex items-end gap-2">
          <span className="px-2 py-2 text-xs tabular-nums text-muted-foreground">
            {chosen.length}/{max} selected
          </span>
          <button type="button" onClick={() => setSelected([])}
            className="h-9 rounded border border-border px-3 text-sm hover:bg-muted">Clear</button>
        </div>
        <div className="max-h-48 overflow-y-auto rounded border border-border bg-background p-2 lg:col-span-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {people.map(person => {
              const checked = selected.includes(person.primaryEmail);
              return (
                <label key={person.primaryEmail} className="flex min-w-0 items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
                  <input type="checkbox" checked={checked} disabled={!checked && selected.length >= max}
                    onChange={() => choose(person.primaryEmail)} />
                  <span className="min-w-0 truncate" title={person.primaryEmail}>{person.displayName}</span>
                </label>
              );
            })}
          </div>
          {people.length === 0 && <p className="p-2 text-xs text-muted-foreground">
            No contributors match this tag or search. Configure tags in Settings.
          </p>}
        </div>
      </div>
      {chosen.length < 2 ? (
        <p role="status" className="rounded border border-border bg-panel p-5 text-sm text-muted-foreground">
          Select at least two developers to compare their contribution and technical throughput side by side.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {chosen.map(item => {
              const linkedTags = (tags.data?.items ?? []).filter(tag =>
                tags.data && tagsForTarget(tags.data,"contributor",item.person.primaryEmail).includes(tag.id));
              return (
                <div key={item.person.primaryEmail} className="rounded-md border border-border bg-panel p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold" title={item.person.displayName}>{item.person.displayName}</h3>
                      <p className="truncate text-xs text-muted-foreground" title={item.person.primaryEmail}>{item.person.primaryEmail}</p>
                    </div>
                    <button type="button" onClick={() => choose(item.person.primaryEmail)}
                      aria-label={"Remove " + item.person.displayName} className="rounded p-2 hover:bg-muted">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Contribution</div>
                      <div className="text-3xl font-semibold tabular-nums">{textNumber(item.evidence?.effectiveContributionScore,1)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Productivity proxy</div>
                      <div className="text-3xl font-semibold tabular-nums">{textNumber(item.evidence?.productivityProxyScore,1)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {linkedTags.map(tag => (
                      <span key={tag.id} className="rounded border border-border bg-muted px-2 py-0.5 text-[11px]">
                        {tag.group ? tag.group + " / " : ""}{tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-md border border-border bg-panel">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th scope="col" className="min-w-44 px-3 py-3 font-medium">Evidence metric</th>
                  {chosen.map(({person}) => (
                    <th scope="col" key={person.primaryEmail} className="min-w-36 px-3 py-3 text-right font-medium">
                      <span className="block truncate" title={person.displayName}>{person.displayName}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(metric => {
                  const values = chosen.map(metric.value);
                  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
                  const highest = valid.length >= 2 ? Math.max(...valid) : null;
                  return (
                    <tr key={metric.label} className="border-b border-border/70 last:border-b-0">
                      <th scope="row" className="px-3 py-3 font-medium text-muted-foreground">{metric.label}</th>
                      {values.map((value, index) => (
                        <td key={chosen[index]!.person.primaryEmail} className={"px-3 py-3 text-right tabular-nums " +
                          (highest !== null && value === highest && valid.some(other => other < highest)
                            ? "font-semibold text-accent" : "")}>
                          {metric.format === "pct" ? pct(value) : textNumber(value,metric.format === "fixed" ? 1 : 0)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Highlighting indicates the highest value of each measure, not the best employee.
            ICE-Git/1 and Gita-Throughput/1 are experimental, cohort-relative Git evidence proxies.
            Roles, workload, pairing, review context and delivery outcomes are not controlled.
            {tagId && tagById.has(tagId) ? " Tag filters affect displayed candidates, not reference quantiles." : ""}
          </p>
        </>
      )}
    </section>
  );
}
