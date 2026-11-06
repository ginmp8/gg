"use client";

import type { Branch, BranchComparison } from "@gita/core";
import { useEffect, useMemo, useState } from "react";

import { getBranchComparison } from "@/lib/api";

export function BranchComparisonPanel({
  repositoryId, branches
}: { repositoryId: string | null; branches: Branch[] }) {
  const branchNames = useMemo(
    () => [...new Set(branches.filter((branch) => branch.remote === null).map((branch) => branch.name))].sort(),
    [branches]
  );
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [result, setResult] = useState<BranchComparison | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setResult(null);
    setError("");
    setBase(branchNames.includes("main") ? "main" : (branchNames[0] ?? ""));
    setHead(branchNames.find((branch) => branch !== "main") ?? branchNames[1] ?? "");
  }, [branchNames, repositoryId]);

  async function compare() {
    if (!repositoryId || !base || !head || base === head) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const comparison = await getBranchComparison(repositoryId, base, head);
      setResult(comparison);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Branch comparison failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-md border border-border bg-panel p-4" aria-label="Compare Git branches">
      <div>
        <h3 className="font-semibold">Compare branches</h3>
        <p className="text-xs text-muted-foreground">
          Local, read-only comparison. Ahead/behind use unique commits;
          file changes use the three-dot merge-base diff, not accumulated churn.
        </p>
      </div>
      {!repositoryId ? (
        <p className="text-sm text-muted-foreground">Select a repository to compare two branches.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">Base
              <select value={base} onChange={(event) => setBase(event.target.value)}
                className="h-9 min-w-40 rounded border border-border bg-background px-2">
                <option value="">Select base</option>
                {branchNames.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Head
              <select value={head} onChange={(event) => setHead(event.target.value)}
                className="h-9 min-w-40 rounded border border-border bg-background px-2">
                <option value="">Select head</option>
                {branchNames.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void compare()}
              disabled={pending || !base || !head || base === head}
              className="h-9 rounded bg-foreground px-4 text-sm text-background disabled:opacity-50">
              {pending ? "Comparing..." : "Compare branches (local)"}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {result && (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-4 rounded border border-border bg-background px-3 py-2 text-sm">
                <span>Head ahead: <strong>{result.ahead.toLocaleString()}</strong> commits</span>
                <span>Head behind: <strong>{result.behind.toLocaleString()}</strong> commits</span>
                <span>Changed files: <strong>{result.totalChangedFiles.toLocaleString()}</strong></span>
                {result.truncated && <span className="text-warning">Only the first 500 files shown</span>}
              </div>
              <div className="max-h-72 overflow-auto rounded border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-panel text-muted-foreground"><tr>
                    <th scope="col" className="w-24 p-2">Status</th>
                    <th scope="col" className="p-2">File</th>
                  </tr></thead>
                  <tbody>
                    {result.files.map((file) => (
                      <tr key={file.path} className="border-t border-border">
                        <td className="p-2">{file.status}</td>
                        <td className="break-all p-2 font-mono">{file.path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.files.length === 0 &&
                  <p className="p-3 text-sm text-muted-foreground">No file changes in the merge-base diff.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
