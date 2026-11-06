"use client";

import type { ProjectTag, TagTargetType } from "@gita/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  createTag, deleteTag, getProjectTags, getTagTargets, setTagAssignment, updateTag
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
  const [targetKey, setTargetKey] = useState("");
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
    onSuccess: tag => { setName(""); setGroup(""); setSelectedId(tag.id); refresh(); }
  });
  const edit = useMutation({
    mutationFn: (value: { id: string; name: string; group: string }) => updateTag(projectId, value.id, value),
    onSuccess: () => { setEditId(""); setName(""); setGroup(""); refresh(); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTag(projectId, id),
    onSuccess: () => { setSelectedId(""); refresh(); }
  });
  const assignment = useMutation({
    mutationFn: (value: { tagId: string; type: TagTargetType; key: string; enabled: boolean }) =>
      setTagAssignment(projectId, value.tagId, value.type, value.key, value.enabled),
    onSuccess: refresh
  });

  const items = tags.data?.items ?? [];
  const chosen = items.find(tag => tag.id === selectedId) ?? items[0] ?? null;
  const assigned = chosen ? (tags.data?.assignments ?? []).filter(a => a.tagId === chosen.id) : [];
  const candidates = targets.data?.items ?? [];
  const activeTarget = candidates.some(t => t.key === targetKey) ? targetKey : "";
  const pending = create.isPending || edit.isPending || remove.isPending || assignment.isPending;
  const error = tags.error ?? targets.error ?? create.error ?? edit.error ?? remove.error ?? assignment.error;

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
                <button type="button" onClick={() => setSelectedId(tag.id)}
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
              setTargetKey(""); setSearch("");
            }} className="h-9 rounded border border-border bg-background px-2 text-sm">
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs">Search targets
            <input value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setTargetKey(""); }}
              placeholder="Name, email or identifier" className="h-9 rounded border border-border bg-background px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs">Target
            <select value={activeTarget} onChange={event => setTargetKey(event.target.value)}
              className="h-9 w-full min-w-0 rounded border border-border bg-background px-2 text-sm">
              <option value="">Choose a target</option>
              {candidates.map(t => <option key={t.key} value={t.key}>{t.label} · {t.detail}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground">
            {candidates.length} of {targets.data?.total ?? 0} matches; refine the search if needed.
          </p>
          <button type="button" disabled={!chosen || !activeTarget || pending}
            onClick={() => {
              if (chosen && activeTarget) assignment.mutate({
                tagId: chosen.id, type: targetType, key: activeTarget, enabled: true
              });
            }} className="h-9 rounded bg-foreground px-3 text-sm text-background disabled:opacity-50">
            Assign tag
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
