"use client";

import type { AnnualReport } from "@gg/core";
import { useMemo, useState } from "react";
import {
  buildContributorRankings, rankMetric, RANKING_METRICS,
  type RankingMetricId, type RankedMetric
} from "@/lib/contributor-rankings";

type Props = {
  report: AnnualReport;
  visibleEmails: ReadonlySet<string>;
  selectedEmails: ReadonlySet<string>;
  onToggle: (email: string) => void;
};

function formatRankValue(value: RankedMetric | null, kind: "score" | "volume"): string {
  if (!value) return "N/A";
  return kind === "score" ? value.value.toFixed(1) + " / 100" :
    value.value.toLocaleString("en-US") + " commits";
}

export function ContributorRanking({
  report, visibleEmails, selectedEmails, onToggle
}: Props) {
  const [sortMetric, setSortMetric] = useState<RankingMetricId>("overall");
  const [onlySelected, setOnlySelected] = useState(false);
  const snapshot = useMemo(() => buildContributorRankings(report), [report]);
  const ranked = snapshot.rows.filter(row =>
    visibleEmails.has(row.email) && (!onlySelected || selectedEmails.has(row.email))
  ).sort((a, b) => {
    const left = rankMetric(snapshot, a.email, sortMetric)?.rank ?? Number.POSITIVE_INFINITY;
    const right = rankMetric(snapshot, b.email, sortMetric)?.rank ?? Number.POSITIVE_INFINITY;
    return left - right || a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email);
  });
  const metric = RANKING_METRICS.find(item => item.id === sortMetric)!;
  const highlights = [
    RANKING_METRICS[0]!, RANKING_METRICS[1]!, RANKING_METRICS[4]!
  ];

  return (
    <section aria-label="Executive contributor ranking" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Contribution ranking</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Positions are calculated across all {snapshot.cohortSize} contributors in this
            repository scope and year, even when your search, tags or selection narrow the table.
            Equal values share the same position.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Rank by
            <select aria-label="Ranking metric" value={sortMetric}
              onChange={event => setSortMetric(event.target.value as RankingMetricId)}
              className="h-10 min-w-48 rounded border border-border bg-background px-2 text-sm text-foreground">
              {RANKING_METRICS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 text-xs">
            <input type="checkbox" checked={onlySelected} onChange={event => setOnlySelected(event.target.checked)}
              disabled={selectedEmails.size === 0} aria-label="Show only selected contributors" />
            Selected only ({selectedEmails.size})
          </label>
        </div>
      </div>

      {!snapshot.available && <p role="status" className="rounded border border-warning/60 p-3 text-sm text-warning">
        Overall and component scores require fully indexed repositories and at least three
        contributors in the scoring cohort. Missing scores are shown as N/A, never ranked as zero.
        See Settings → Data synchronization if history is missing.
      </p>}

      <div className="grid gap-3 md:grid-cols-3">
        {highlights.map(item => {
          const leaders = snapshot.rows.filter(row => rankMetric(snapshot, row.email, item.id)?.rank === 1);
          const winner = leaders[0];
          const value = winner ? rankMetric(snapshot, winner.email, item.id) : null;
          return (
            <div key={item.id} className="rounded-lg border border-border bg-panel p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {item.id === "overall" ? "Overall leader" :
                  item.id === "throughput" ? "Technical pace leader" : "Tests & docs leader"}
              </div>
              <div className="mt-2 truncate text-lg font-semibold" title={winner?.displayName}>
                {winner?.displayName ?? "Unavailable"}
              </div>
              <div className="mt-1 text-sm tabular-nums text-accent">
                {value ? `#1 · ${formatRankValue(value, item.kind)}` : "Not ranked"}
                {leaders.length > 1 ? ` · tied with ${leaders.length - 1}` : ""}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h4 className="font-semibold">Ranking by contributor</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ranked.length} displayed · Sorted by {metric.label.toLowerCase()} ·
              Positions reference the full cohort, not just the visible rows.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Score = relative evidence index; commits = activity volume, not quality
          </span>
        </div>
        <div className="max-h-[580px] overflow-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b border-border">
                <th scope="col" className="sticky left-0 z-20 min-w-52 bg-muted px-3 py-3 font-medium">
                  Contributor
                </th>
                {RANKING_METRICS.map(item => (
                  <th scope="col" key={item.id}
                    title={item.description}
                    className={"min-w-28 px-3 py-3 text-center font-medium " +
                      (item.id === sortMetric ? "text-accent" : "")}>
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(row => (
                <tr key={row.email} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
                  <th scope="row" className="sticky left-0 z-10 bg-panel px-3 py-3 font-normal">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={selectedEmails.has(row.email)}
                        onChange={() => onToggle(row.email)} aria-label={`Compare ${row.displayName}`} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold" title={row.displayName}>
                          {row.displayName}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground" title={row.email}>
                          {row.email}
                        </span>
                      </span>
                    </label>
                  </th>
                  {RANKING_METRICS.map(item => {
                    const rank = rankMetric(snapshot, row.email, item.id);
                    return (
                      <td key={item.id}
                        title={item.description}
                        className={"px-3 py-2 text-center tabular-nums " +
                          (item.id === sortMetric ? "bg-accent/5" : "")}>
                        {rank ? (
                          <div>
                            <span className={rank.rank === 1 ? "font-bold text-accent" : "font-semibold"}>
                              #{rank.rank}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {item.kind === "score" ? rank.value.toFixed(1) + " pts" :
                                rank.value.toLocaleString("en-US")}
                            </span>
                            {item.id === sortMetric && item.kind === "score" && (
                              <div className="mx-auto mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-accent"
                                  style={{ width: `${Math.max(0, Math.min(100, rank.value))}%` }} />
                              </div>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground">N/A</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ranked.length === 0 && <p className="p-4 text-sm text-muted-foreground">
          No contributors match the current filters. Clear the tag, search or selected-only filter.
        </p>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Rankings describe relative Git evidence, not a validated employee performance or
        business-impact assessment. Commit volume, diff size and activity continuity depend on
        role, assignment, attribution, repository scope and available data. See Detailed view
        for definitions and raw evidence.
      </p>
    </section>
  );
}
