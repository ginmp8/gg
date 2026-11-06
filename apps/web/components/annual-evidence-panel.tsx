"use client";

import type { IceContributorScore, IceScoreReport } from "@gita/core";
import { useState } from "react";

function show(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(1);
}
function Bar({ label, value, help }: { label: string; value: number | null; help: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{show(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent"
          style={{ width: String(Math.max(0, Math.min(100, value ?? 0))) + "%" }} />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{help}</p>
    </div>
  );
}

export function AnnualEvidencePanel({ report }: { report: IceScoreReport }) {
  const [email, setEmail] = useState("");
  if (report.status !== "ok") return (
    <section aria-label="Developer evidence scores" className="rounded-md border border-border bg-panel p-4">
      <h3 className="text-base font-semibold">Contribution and productivity evidence</h3>
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {report.status === "incomplete_history"
          ? "Scores are unavailable until the integration history is fully indexed."
          : "At least three comparable contributors are needed for relative scores."}
      </p>
    </section>
  );
  const people = [...report.contributors].sort((a, b) =>
    (b.effectiveContributionScore ?? -1) - (a.effectiveContributionScore ?? -1) ||
    a.email.localeCompare(b.email));
  const selected = people.find((person) => person.email === email) ?? people[0];
  if (!selected) return null;
  const core = [
    ["Integrated delivery", selected.components.integratedDelivery, "Material commits in the integration branch."],
    ["Technical diff", selected.components.technicalDiff, "Capped, weighted per-file Git change evidence."],
    ["Tests and docs", selected.components.testDocs, "Material commits also editing tests or documentation."],
    ["GitHub collaboration", selected.components.githubCollaboration, "Merged and reviewed PRs; N/A without mapped complete data."]
  ] as const;
  return (
    <section aria-label="Developer evidence scores" className="grid gap-4 rounded-md border border-border bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">Engineering evidence · ICE-Git/1</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">Effective contribution and technical throughput</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Two experimental relative 0–100 indices. Effective contribution rewards integrated material
            changes and test/docs signals. The productivity proxy compares technical output per active month.
            Neither measures quality, business impact or individual human productivity.
          </p>
        </div>
        <div className="rounded-md bg-muted px-3 py-2 text-right">
          <div className="text-[11px] text-muted-foreground">Comparable cohort</div>
          <div className="text-xl font-semibold tabular-nums">{report.references.cohortSize}</div>
          <div className="text-[11px] text-muted-foreground">P75 reference</div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-md border border-border">
          <p className="border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Select a developer to inspect evidence and score components.
          </p>
          <div className="max-h-[490px] overflow-auto">
            <table className="w-full min-w-[440px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-panel text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-medium">Developer</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Contribution</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Productivity proxy</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person: IceContributorScore) => (
                  <tr key={person.email}
                    className={"border-t border-border/60 " + (person.email === selected.email ? "bg-muted" : "hover:bg-muted/50")}>
                    <td className="max-w-40 px-3 py-2">
                      <button type="button" aria-pressed={person.email === selected.email}
                        aria-label={"Inspect evidence for " + person.displayName}
                        onClick={() => setEmail(person.email)}
                        className="block w-full rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                        <span className="block truncate font-semibold" title={person.displayName}>{person.displayName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground" title={person.email}>{person.email}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {show(person.effectiveContributionScore)}
                      <div className="ml-auto mt-1 h-1 w-16 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{
                          width: String(person.effectiveContributionScore ?? 0) + "%"
                        }} />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{show(person.productivityProxyScore)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{person.evidenceCoveragePercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside aria-live="polite" className="grid min-w-0 content-start gap-4 rounded-md border border-border p-4">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold" title={selected.displayName}>{selected.displayName}</h4>
            <p className="truncate text-xs text-muted-foreground" title={selected.email}>{selected.email}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Contribution</div>
              <div className="text-3xl font-semibold tabular-nums">{show(selected.effectiveContributionScore)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Productivity proxy</div>
              <div className="text-3xl font-semibold tabular-nums">{show(selected.productivityProxyScore)}</div>
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              {selected.materialCommits} material commits · {selected.activeMonths} active months ·
              {" "}{selected.boundedDiffCredit.toFixed(2)} diff units.
              {" "}GitHub-enhanced: {show(selected.combinedContributionScore)}.
            </p>
          </div>
          {core.map(([label, value, help]) => <Bar key={label} label={label} value={value} help={help} />)}
          <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-semibold">Productivity proxy components</summary>
            <div className="mt-3 grid gap-3">
              <Bar label="Material commits / active month" value={selected.components.deliveryPerActiveMonth}
                help="Cohort-normalized material commit rate." />
              <Bar label="Diff credit / active month" value={selected.components.diffPerActiveMonth}
                help="Cohort-normalized technical diff rate." />
              <Bar label="Active-month continuity" value={selected.components.activityContinuity}
                help="Relative months with eligible commits; not hours worked." />
            </div>
          </details>
          <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-semibold">File and commit evidence ({selected.fileEvidence.length})</summary>
            <p className="mt-2 text-xs text-muted-foreground">Top-weighted sample. Complete evidence stays in local SQLite.</p>
            <ul className="mt-2 grid max-h-52 gap-2 overflow-auto text-xs">
              {selected.fileEvidence.map((file) => (
                <li key={file.repoId + file.hash + file.path} className="min-w-0 border-b border-border/50 pb-2">
                  <div className="truncate font-mono" title={file.path}>{file.path}</div>
                  <div className="truncate text-muted-foreground" title={file.hash}>
                    {file.hash.slice(0, 10)} · {file.category} · {file.adjustedLines} adjusted lines
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Relative to the selected cohort, year and repositories. Squash merges, pair work,
        architectural decisions and off-platform work are not reliably captured.
        Do not use these scores alone for formal individual evaluations.
      </p>
    </section>
  );
}
