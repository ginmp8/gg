import type { AnnualContributor, AnnualReport } from "@gita/core";

/** Prevent spreadsheet formula execution when Git author strings are exported. */
export function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  let firstMeaningful = 0;
  // Excel may ignore leading ASCII whitespace/control characters in a cell.
  while (firstMeaningful < text.length && text.charCodeAt(firstMeaningful) <= 32) {
    firstMeaningful++;
  }
  const escaped = firstMeaningful < text.length &&
    "=+-@".includes(text.charAt(firstMeaningful)) ? `'${text}` : text;
  return `"${escaped.replaceAll('"', '""')}"`;
}

const FIELDS: Array<[string, keyof AnnualContributor]> = [
  ["Developer", "displayName"],
  ["Email", "primaryEmail"],
  ["GitHub login", "githubLogin"],
  ["Repositories", "repositories"],
  ["Integrated commits", "commits"],
  ["Active days", "activeDays"],
  ["Substantive commits", "substantiveCommits"],
  ["Cosmetic-only commits", "cosmeticOnlyCommits"],
  ["Substantive commit %", "substantiveRate"],
  ["Gross churn", "grossChurn"],
  ["Rename-aware churn", "renameAwareChurn"],
  ["Whitespace-adjusted churn", "adjustedChurn"],
  ["Retained churn %", "retainedChurnRate"],
  ["Reviewable code/test churn", "reviewableChurn"],
  ["Source churn", "sourceChurn"],
  ["Test churn", "testChurn"],
  ["Docs churn", "docsChurn"],
  ["Generated churn", "generatedChurn"],
  ["Files moved/renamed", "movedFiles"],
  ["Pure moves", "pureMoves"],
  ["Commits touching tests", "testTouchedCommits"],
  ["Merged PRs (optional)", "mergedPullRequests"],
  ["PRs reviewed (optional)", "reviewedPullRequests"],
  ["PRs approved (optional)", "approvedPullRequests"]
];

export function annualCsv(report: AnnualReport): string {
  const header = FIELDS.map(([label]) => csvCell(label)).join(",");
  const rows = report.contributors.map((contributor) =>
    FIELDS.map(([, key]) => csvCell(contributor[key])).join(",")
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

export function downloadLocalReport(name: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
