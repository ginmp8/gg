"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { CloudDownload, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { Repository } from "@gg/core";
import {
  bulkImportGitHubRepositories, discoverGitHubRepositories,
  type GitHubDiscoveredRepository
} from "@/lib/api";

const MAX_BATCH = 25;
const MAX_VISIBLE = 150;

export function GitHubRepositoryPicker({
  projectId, repositories, onImported
}: {
  projectId: string | null;
  repositories: Repository[];
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [items, setItems] = useState<GitHubDiscoveredRepository[] | null>(null);
  const [result, setResult] = useState("");

  const discovery = useMutation({
    mutationFn: discoverGitHubRepositories,
    onSuccess: (data) => { setItems(data.items); setSelected(new Set()); setResult(""); }
  });
  const importer = useMutation({
    mutationFn: () => bulkImportGitHubRepositories(projectId!, [...selected]),
    onSuccess: ({ items: imported, skipped }) => {
      setResult(`${imported.length} repository records added; ${skipped.length} already registered. Click Refresh project to clone or update their mirrors.`);
      setSelected(new Set());
      onImported();
    }
  });

  const owned = useMemo(() => new Set(repositories.map((repo) =>
    repo.url.replace(/\.git$/i, "").toLowerCase()
  )), [repositories]);
  const owners = useMemo(() => [
    ...new Set((items ?? []).map((item) => item.fullName.split("/")[0] ?? ""))
  ].sort((a, b) => a.localeCompare(b)), [items]);

  const visible = useMemo(() => (items ?? []).filter((item) => {
    if (owned.has(item.cloneUrl.replace(/\.git$/i, "").toLowerCase())) return false;
    if (owner !== "all" && !item.fullName.toLowerCase().startsWith(`${owner.toLowerCase()}/`)) return false;
    if (visibility === "private" && !item.isPrivate) return false;
    if (visibility === "public" && item.isPrivate) return false;
    if (!includeArchived && item.archived) return false;
    return item.fullName.toLowerCase().includes(search.toLowerCase().trim());
  }), [items, owned, owner, visibility, includeArchived, search]);

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else if (next.size < MAX_BATCH) next.add(name);
      return next;
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" disabled={!projectId} title="Discover accessible GitHub repositories"
          className="inline-flex h-9 items-center gap-2 rounded border border-border bg-panel px-3 text-sm hover:bg-muted disabled:opacity-50">
          <CloudDownload className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">GitHub import</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(840px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-panel p-5 text-foreground shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Import GitHub repositories</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                List accessible GitHub repositories via your authenticated GitHub CLI.
                Listing uses the network only when requested; registration does not clone.
                Select at most 25 repositories and click Refresh project to fetch their mirrors.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => discovery.mutate()}
              disabled={discovery.isPending}
              className="h-9 rounded bg-foreground px-4 text-sm text-background disabled:opacity-50">
              {discovery.isPending ? "Querying GitHub..." : "Discover accessible repositories (network)"}
            </button>
            <p className="text-xs text-muted-foreground">
              Requires gh auth login and GG_ALLOW_GITHUB_METADATA=1.
              Private clone credentials may require gh auth setup-git.
            </p>
          </div>
          {discovery.isError && <p role="alert" className="text-sm text-danger">{discovery.error.message}</p>}
          {result && <p role="status" className="text-sm text-success">{result}</p>}
          {items && (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_140px_auto]">
                <label className="relative flex items-center gap-2 rounded border border-border bg-background px-2">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input aria-label="Search GitHub repositories" value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-9 w-full min-w-0 bg-transparent text-sm outline-none"
                    placeholder="Search repositories" />
                </label>
                <select aria-label="Repository owner" value={owner} onChange={(event) => setOwner(event.target.value)}
                  className="h-9 rounded border border-border bg-background px-2 text-sm">
                  <option value="all">All owners</option>
                  {owners.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <select aria-label="Repository visibility" value={visibility}
                  onChange={(event) => setVisibility(event.target.value)}
                  className="h-9 rounded border border-border bg-background px-2 text-sm">
                  <option value="all">All visibility</option>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
                <label className="flex items-center gap-2 whitespace-nowrap text-xs">
                  <input type="checkbox" checked={includeArchived}
                    onChange={(event) => setIncludeArchived(event.target.checked)} />
                  Archived
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                {visible.length} available after filters; already registered repositories hidden.
                Showing first {Math.min(visible.length, MAX_VISIBLE)}. {selected.size}/{MAX_BATCH} selected.
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded border border-border bg-background">
                {visible.slice(0, MAX_VISIBLE).map((item) => (
                  <label key={item.fullName}
                    className="flex cursor-pointer items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm hover:bg-muted">
                    <span className="flex min-w-0 items-center gap-3">
                      <input type="checkbox" checked={selected.has(item.fullName)}
                        disabled={!selected.has(item.fullName) && selected.size >= MAX_BATCH}
                        onChange={() => toggle(item.fullName)} />
                      <span className="truncate">{item.fullName}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.isPrivate ? "Private" : "Public"}{item.archived ? " · archived" : ""}
                    </span>
                  </label>
                ))}
                {!visible.length && <p className="p-4 text-sm text-muted-foreground">No matching repositories.</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-lg text-xs text-muted-foreground">
                  Registration stores repository URLs and names locally. It does not publish or
                  modify GitHub data. Use Refresh project explicitly to download history.
                </p>
                <button type="button" disabled={selected.size === 0 || importer.isPending || !projectId}
                  onClick={() => importer.mutate()}
                  className="h-9 rounded bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50">
                  {importer.isPending ? "Registering..." : `Register ${selected.size} selected`}
                </button>
              </div>
              {importer.isError && <p role="alert" className="text-sm text-danger">{importer.error.message}</p>}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
