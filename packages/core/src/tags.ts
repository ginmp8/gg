/** User-defined labels and their project-scoped assignments; no seeded tag names. */
export type TagTargetType = "contributor" | "repository" | "branch" | "pull_request";
export interface ProjectTag {
  id: string; projectId: string; name: string; group: string; createdAt: string; updatedAt: string;
}
export interface TagAssignment { tagId: string; targetType: TagTargetType; targetKey: string; }
export interface TagsSnapshot { items: ProjectTag[]; assignments: TagAssignment[]; }
export interface TagTarget { type: TagTargetType; key: string; label: string; detail: string; }
export interface TagTargetPage { items: TagTarget[]; total: number; }
export function tagsForTarget(snapshot: TagsSnapshot, type: TagTargetType, key: string): string[] {
  const targetKey = type === "contributor" ? key.trim().toLowerCase() : key;
  return snapshot.assignments.filter(a => a.targetType === type && a.targetKey === targetKey).map(a => a.tagId);
}
export function hasAllTags(
  snapshot: TagsSnapshot, type: TagTargetType, key: string, selected: readonly string[]
): boolean {
  const ids = new Set(tagsForTarget(snapshot, type, key));
  return selected.every(id => ids.has(id));
}
