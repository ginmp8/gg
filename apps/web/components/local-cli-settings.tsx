"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Clipboard, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { getLocalDataHealth } from "@/lib/api";

const examples = [
  { id: "catalog", label: "Available commands", build: () => "npm --silent run cli -- catalog" },
  { id: "projects", label: "List projects", build: () => "npm --silent run cli -- projects" },
  { id: "summary", label: "Project overview", build: (project: string) => "npm --silent run cli -- summary --project " + project },
  { id: "scores", label: "All contributor scores", build: (project: string) =>
    "npm --silent run cli -- scores --project " + project + " --year " + new Date().getFullYear() },
  { id: "annual", label: "All annual metrics", build: (project: string) =>
    "npm --silent run cli -- annual --project " + project + " --year " + new Date().getFullYear() },
  { id: "contributors", label: "Contributors", build: (project: string) =>
    "npm --silent run cli -- contributors --project " + project + " --limit 100" },
  { id: "commits", label: "Raw commit records", build: () =>
    "npm --silent run cli -- table --table commits --limit 100" },
  { id: "filechanges", label: "Annual file-diff evidence", build: () =>
    "npm --silent run cli -- table --table annual_file_changes --limit 100" }
];

export function LocalCliSettings({ projectId }: { projectId: string }) {
  const [example, setExample] = useState("scores");
  const [copied, setCopied] = useState(false);
  const health = useQuery({ queryKey: ["local-data-health"], queryFn: getLocalDataHealth });
  const selected = examples.find(item => item.id === example) ?? examples[3]!;
  const command = selected.build(projectId);
  const [copyError, setCopyError] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access unavailable.");
      await navigator.clipboard.writeText(command);
      setCopyError(""); setCopied(true);
    } catch {
      setCopyError("Clipboard unavailable. Select and copy the command manually.");
    }
  }

  return (
    <section aria-label="Local agent CLI settings" className="grid gap-4 rounded-md border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <TerminalSquare className="h-5 w-5 text-accent" aria-hidden />
        <div>
          <h3 className="text-base font-semibold">Local CLI for coding agents</h3>
          <p className="text-xs text-muted-foreground">
            JSON-only data access for any harness that can execute a local command.
            No HTTP service, authentication, cloud connection or write permissions.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(180px,0.35fr)_minmax(0,0.65fr)]">
        <label className="grid gap-1 text-xs">Data query
          <select value={example} onChange={event => { setExample(event.target.value); setCopied(false); }}
            className="h-10 rounded border border-border bg-background px-2 text-sm">
            {examples.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="grid min-w-0 gap-1 text-xs">
          <span>Command (run from your GG source checkout)</span>
          <div className="flex min-w-0 items-stretch overflow-hidden rounded border border-border bg-background">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap p-3 text-[11px]" title={command}>{command}</code>
            <button type="button" aria-label="Copy CLI command" onClick={() => void copy()}
              className="shrink-0 border-l border-border px-3 hover:bg-muted">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Clipboard className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      {copyError && <p role="status" className="text-xs text-warning">{copyError}</p>}
      <div className="grid gap-2 text-xs text-muted-foreground">
        <p><strong className="text-foreground">Prerequisites:</strong> Node.js 24 and npm ci
          in the GG source directory. Harnesses should run the command as a subprocess and parse stdout JSON.
          No dashboard session token is required.</p>
        <p><strong className="text-foreground">Local database:</strong>{" "}
          {health.isLoading ? "Checking local API…" : health.isError
            ? "Unavailable. Ensure the GG API is running." : (
              <code className="break-all select-all text-foreground">{health.data?.databasePath}</code>
            )}</p>
        <p><strong className="text-foreground">Configuration:</strong> Set{" "}
          <code className="text-foreground">GG_DATA_DIR</code> in the harness process environment
          when the CLI must read another GG data directory, such as the desktop application's AppData.
          The CLI opens existing SQLite data strictly read-only; it never triggers remote Git refresh,
          indexing, migrations or background tasks.</p>
        <p>Use <code className="text-foreground">npm --silent run cli -- catalog</code> to discover
          all analytics commands and raw, paginated datasets. The CLI is currently shipped with the
          source checkout, not as an installed system-wide binary or native MCP server.</p>
      </div>
    </section>
  );
}
