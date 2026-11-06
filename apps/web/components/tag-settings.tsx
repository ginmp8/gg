"use client";

import type { ProjectTag, TagTarget, TagTargetType } from "@gg/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  createTag, deleteTag, getProjectTags, getTagTargets, setTagAssignment, setTagAssignmentsBulk, updateTag
} from "@/lib/api";

const types: Array<{ value: TagTargetType; label: string }> = [
  { value: "contributor", label: "Contributor" },
  { value: "repository", label: "Repository" },
  { value: "branch", label: "Branch" },
  { value: "pull_request", label: "Pull request" }
];

function tagLabel(tag: ProjectTag) {
  return tag.group ? tag.group + " / " + tag.name : tag.name;
}

export function TagSettings({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [editId, setEditId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [targetType, setTargetType] = useState<TagTargetType>("contributor");
  const [search, setSearch] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<TagTarget[]>([]);
  const deferredSearch = useDeferredValue(search);
  const tags = useQuery({
    queryKey: ["project-tags", projectId], queryFn: () => getProjectTags(projectId)
  });
  const targets = useQuery({
    queryKey: ["tag-targets", projectId, targetType, deferredSearch],
    queryFn: () => getTagTargets(projectId, targetType, deferredSearch)
  });
  const refresh = () => { void client.invalidateQueries({ queryKey: ["project-tags", projectId] }); };
  const create = useMutation({
    mutationFn: (value: { name: string; group: string }) => createTag(projectId, value),
    onSuccess: tag => { setName(""); setGroup(""); setSelectedId(tag.id); setSelectedTargets([]); refresh(); }
  });
  const edit = useMutation({
    mutationFn: (value: { id: string; name: string; group: string }) => updateTag(projectId, value.id, value),
    onSuccess: () => { setEditId(""); setName(""); setGroup(""); refresh(); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTag(projectId, id),
    onSuccess: () => { setSelectedId(""); setSelectedTargets([]); refresh(); }
  });
  const assignment = useMutation({
    mutationFn: (value: { tagId: string; type: TagTargetType; key: string; enabled: boolean }) =>
      setTagAssignment(projectId, value.tagId, value.type, value.key, value.enabled),
    onSuccess: refresh
  });
  const bulkAssignment = useMutation({
    mutationFn: (value: { tagId: string; type: TagTargetType; keys: string[] }) =>
      setTagAssignmentsBulk(projectId, value.tagId, value.type, value.keys),
    onSuccess: () => { setSelectedTargets([]); refresh(); }
  });

  const items = tags.data?.items ?? [];
  const chosen = items.find(tag => tag.id === selectedId) ?? items[0] ?? null;
  const assigned = chosen ? (tags.data?.assignments ?? []).filter(a => a.tagId === chosen.id) : [];
  const candidates = targets.data?.items ?? [];

  const pending = create.isPending || edit.isPending || remove.isPending || assignment.isPending || bulkAssignment.isPending;
  const error = tags.error ?? targets.error ?? create.error ?? edit.error ?? remove.error ?? assignment.error ?? bulkAssignment.error;

  return (
    <section aria-label="Custom tag settings" className="grid gap-4 rounded-md border border-border bg-panel p-4">
      <div className="flex items-start gap-2">
        <Tag className="mt-1 h-4 w-4 shrink-0 text-accent" />
        <div>
          <h3 className="text-base font-semibold">Custom tags</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your own tags and optional groups, then assign them to people, repositories, branches
            or pull requests. No tags or categories are predefined.
          </p>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        const values = { name: name.trim(), group: group.trim() };
        if (editId) edit.mutate({ id: editId, ...values }); else create.mutate(values);
      }}>
        <label className="grid min-w-40 flex-1 gap-1 text-xs">Group (optional)
          <input value={group} maxLength={48} onChange={event => setGroup(event.target.value)}
            placeholder="Your own group" className="h-9 rounded border border-border bg-background px-2 text-sm" />
        </label>
        <label className="grid min-w-48 flex-[2] gap-1 text-xs">Tag label
          <input required maxLength={80} value={name} onChange={event => setName(event.target.value)}
            placeholder="Your own label" className="h-9 rounded border border-border bg-background px-2 text-sm" />
        </label>
        <button disabled={pending || !name.trim()} className="inline-flex h-9 items-center gap-1 rounded bg-foreground px-3 text-sm text-background disabled:opacity-50">
          <Plus className="h-4 w-4" /> {editId ? "Save tag" : "Create tag"}
        </button>
        {editId && <button type="button" onClick={() => { setEditId(""); setName(""); setGroup(""); }}
          className="h-9 rounded border border-border px-3 text-sm">Cancel</button>}
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-md border border-border">
          <h4 className="border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            Tags ({items.length})
          </h4>
          <div className="max-h-80 overflow-y-auto">
            {items.map(tag => (
              <div key={tag.id} className={"flex items-center gap-2 border-b border-border/60 px-3 py-2 " +
                (chosen?.id === tag.id ? "bg-muted/80" : "")}>
                <button type="button" onClick={() => { setSelectedId(tag.id); setSelectedTargets([]); setSearch(""); }}
                  aria-pressed={chosen?.id === tag.id} title={tagLabel(tag)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent">
                  {tagLabel(tag)}
                </button>
                <button type="button" aria-label={"Edit " + tagLabel(tag)}
                  onClick={() => { setEditId(tag.id); setName(tag.name); setGroup(tag.group); }}
                  className="rounded p-2 hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                <button type="button" disabled={pending} aria-label={"Delete " + tagLabel(tag)}
                  onClick={() => {
                    if (window.confirm("Delete this tag and all its assignments?")) remove.mutate(tag.id);
                  }} className="rounded p-2 text-danger hover:bg-muted">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="p-3 text-sm text-muted-foreground">No tags created.</p>}
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-3 rounded-md border border-border p-3">
          <div>
            <h4 className="text-sm font-semibold">Assignments · {chosen ? tagLabel(chosen) : "select a tag"}</h4>
            <p className="text-xs text-muted-foreground">Assignments are local to this project.</p>
          </div>
          <label className="grid gap-1 text-xs">Entity type
            <select value={targetType} onChange={event => {
              setTargetType(event.target.value as TagTargetType);
              setSelectedTargets([]); setSearch("");
            }} className="h-9 rounded border border-border bg-background px-2 text-sm">
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <TargetMultiSelect
            selected={selectedTargets}
            onChange={setSelectedTargets}
            options={candidates}
            search={search}
            onSearch={setSearch}
            loading={targets.isFetching}
            total={targets.data?.total ?? 0}
            disabled={!chosen || pending}
          />
          <button type="button" disabled={!chosen || selectedTargets.length === 0 || pending}
            onClick={() => {
              if (chosen && selectedTargets.length) bulkAssignment.mutate({
                tagId: chosen.id, type: targetType,
                keys: selectedTargets.map(target => target.key)
              });
            }} className="h-9 rounded bg-foreground px-3 text-sm text-background disabled:opacity-50">
            {bulkAssignment.isPending ? "Assigning…" : "Assign " +
              selectedTargets.length + " selected target" + (selectedTargets.length === 1 ? "" : "s")}
          </button>
          <h5 className="border-t border-border pt-3 text-xs font-semibold">Assigned entities ({assigned.length})</h5>
          <div className="max-h-52 overflow-y-auto">
            {assigned.map(a => (
              <div key={a.targetType + a.targetKey} className="flex items-center justify-between gap-2 border-b border-border/50 py-2 text-xs">
                <span className="min-w-0 break-all">{a.targetType}: {a.targetKey}</span>
                <button type="button" disabled={pending} className="shrink-0 rounded border border-border px-2 py-1 hover:bg-muted"
                  onClick={() => assignment.mutate({
                    tagId: a.tagId, type: a.targetType, key: a.targetKey, enabled: false
                  })}>Remove</button>
              </div>
            ))}
            {assigned.length === 0 && <p className="text-xs text-muted-foreground">No assignments.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Search and multi-select in the same control; selections persist across searches. */
function TargetMultiSelect({
  selected, onChange, options, search, onSearch, loading, total, disabled
}: {
  selected: TagTarget[];
  onChange: (next: TagTarget[]) => void;
  options: TagTarget[];
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  total: number;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    input.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);
  const keys = new Set(selected.map(item => item.key));
  function toggle(item: TagTarget) {
    onChange(keys.has(item.key)
      ? selected.filter(target => target.key !== item.key)
      : selected.length < 100 ? [...selected, item] : selected);
  }
  return (
    <div ref={root} className="relative grid min-w-0 gap-1 text-xs">
      <span>Choose targets</span>
      <button type="button" disabled={disabled} aria-expanded={open}
        aria-controls="gg-target-options" aria-haspopup="true"
        onClick={() => setOpen(previous => !previous)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded border border-border bg-background px-3 text-left text-sm hover:bg-muted disabled:opacity-60">
        <span className={selected.length ? "font-medium" : "text-muted-foreground"}>
          {selected.length ? selected.length + " targets selected" : "Search and select multiple targets"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      {open && !disabled && (
        <div id="gg-target-options" className="absolute left-0 right-0 top-14 z-30 overflow-hidden rounded-md border border-border bg-panel shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input ref={input} value={search} maxLength={100}
              aria-label="Search targets inside multi-select"
              onChange={event => onSearch(event.target.value)}
              placeholder="Search by name, email or identifier…"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div role="group" aria-label="Available tag targets" className="max-h-56 overflow-y-auto p-1">
            {options.map(item => (
              <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 hover:bg-muted">
                <input type="checkbox" checked={keys.has(item.key)}
                  disabled={selected.length >= 100 && !keys.has(item.key)}
                  onChange={() => toggle(item)} aria-label={"Select " + item.label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={item.label}>{item.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={item.detail}>{item.detail}</span>
                </span>
                {keys.has(item.key) && <Check className="h-4 w-4 text-accent" aria-hidden />}
              </label>
            ))}
            {loading && <p role="status" className="p-3 text-xs text-muted-foreground">Searching targets…</p>}
            {!loading && options.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No matches. Try another name or email.</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-2 text-xs text-muted-foreground">
            <span>{options.length} of {total} matches · {selected.length}/100 selected</span>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded border border-border px-3 py-1 text-foreground hover:bg-muted">Done</button>
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div aria-label="Selected targets" className="mt-1 flex flex-wrap gap-1.5">
          {selected.map(item => (
            <span key={item.key} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs">
              <span className="max-w-56 truncate" title={item.label}>{item.label}</span>
              <button type="button" onClick={() => toggle(item)} disabled={disabled}
                aria-label={"Remove " + item.label}
                className="rounded p-0.5 hover:bg-panel"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
