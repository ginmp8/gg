import { randomUUID } from "node:crypto";
import type { ProjectTag, TagAssignment, TagTargetPage, TagTargetType, TagsSnapshot } from "@gita/core";
import type { GitaDatabase } from "./client";

export class TagTargetNotFound extends Error {
  constructor() { super("Tag target does not exist in this project."); }
}
export function listProjectTags(db: GitaDatabase, projectId: string): TagsSnapshot {
  const items = db.sqlite.prepare(
    "SELECT id,project_id AS projectId,name,group_name AS 'group',created_at AS createdAt," +
    "updated_at AS updatedAt FROM project_tags WHERE project_id=? " +
    "ORDER BY group_name COLLATE NOCASE,name COLLATE NOCASE"
  ).all(projectId) as ProjectTag[];
  const assignments = db.sqlite.prepare(
    "SELECT a.tag_id AS tagId,a.target_type AS targetType,a.target_key AS targetKey " +
    "FROM project_tag_assignments a JOIN project_tags t ON t.id=a.tag_id WHERE t.project_id=?"
  ).all(projectId) as TagAssignment[];
  return { items, assignments };
}
export function createProjectTag(
  db: GitaDatabase, projectId: string, input: { name: string; group: string }
): ProjectTag {
  const now = new Date().toISOString();
  const tag = { id: randomUUID(), projectId, name: input.name.trim(), group: input.group.trim(),
    createdAt: now, updatedAt: now };
  db.sqlite.prepare(
    "INSERT INTO project_tags(id,project_id,name,group_name,created_at,updated_at) VALUES(?,?,?,?,?,?)"
  ).run(tag.id, tag.projectId, tag.name, tag.group, tag.createdAt, tag.updatedAt);
  return tag;
}
export function updateProjectTag(
  db: GitaDatabase, projectId: string, tagId: string, input: { name: string; group: string }
): ProjectTag | null {
  const now = new Date().toISOString();
  if (!db.sqlite.prepare(
    "UPDATE project_tags SET name=?,group_name=?,updated_at=? WHERE project_id=? AND id=?"
  ).run(input.name.trim(), input.group.trim(), now, projectId, tagId).changes) return null;
  return db.sqlite.prepare(
    "SELECT id,project_id AS projectId,name,group_name AS 'group'," +
    "created_at AS createdAt,updated_at AS updatedAt FROM project_tags WHERE id=?"
  ).get(tagId) as ProjectTag;
}
export function deleteProjectTag(db: GitaDatabase, projectId: string, tagId: string): boolean {
  return db.sqlite.prepare("DELETE FROM project_tags WHERE project_id=? AND id=?")
    .run(projectId, tagId).changes > 0;
}
function validateTarget(db: GitaDatabase, projectId: string, type: TagTargetType, key: string): boolean {
  const lookup: Record<TagTargetType, string> = {
    contributor: "SELECT 1 FROM (" +
      "SELECT lower(COALESCE(a.canonical_email,c.author_email)) AS email " +
      "FROM commits c JOIN repositories r ON r.id=c.repo_id " +
      "LEFT JOIN annual_identity_links a ON a.project_id=r.project_id " +
      "AND lower(a.email)=lower(c.author_email) WHERE r.project_id=? " +
      "UNION ALL " +
      "SELECT lower(COALESCE(a.canonical_email,m.author_email)) AS email " +
      "FROM annual_commit_metrics m JOIN repositories r ON r.id=m.repo_id " +
      "LEFT JOIN annual_identity_links a ON a.project_id=r.project_id " +
      "AND lower(a.email)=lower(m.author_email) WHERE r.project_id=?" +
      ") WHERE email=? LIMIT 1",
    repository: "SELECT 1 FROM repositories WHERE project_id=? AND id=? LIMIT 1",
    branch: "SELECT 1 FROM branches b JOIN repositories r ON r.id=b.repo_id " +
      "WHERE r.project_id=? AND b.repo_id=? AND b.name=? LIMIT 1",
    pull_request: "SELECT 1 FROM pull_requests p JOIN repositories r ON r.id=p.repo_id " +
      "WHERE r.project_id=? AND p.repo_id=? AND p.provider_id=? LIMIT 1"
  };
  if (type === "contributor") {
    return Boolean(db.sqlite.prepare(lookup[type]).get(projectId, projectId, key));
  }
  if (type === "repository") {
    return Boolean(db.sqlite.prepare(lookup[type]).get(projectId, key));
  }
  const sep = key.indexOf(":");
  if (sep < 1 || sep === key.length - 1) return false;
  return Boolean(db.sqlite.prepare(lookup[type]).get(projectId,key.slice(0,sep),key.slice(sep+1)));
}
/** Set/unset a tag with project isolation and real-target validation. */
export function setProjectTagAssignment(
  db: GitaDatabase, projectId: string, tagId: string, type: TagTargetType, key: string, enabled: boolean
): boolean {
  const targetKey = type === "contributor" ? key.trim().toLowerCase() : key.trim();
  const tag = db.sqlite.prepare("SELECT 1 FROM project_tags WHERE project_id=? AND id=?")
    .get(projectId,tagId);
  if (!tag) return false;
  if (enabled && !validateTarget(db,projectId,type,targetKey)) throw new TagTargetNotFound();
  if (enabled) {
    db.sqlite.prepare("INSERT OR IGNORE INTO project_tag_assignments(tag_id,target_type,target_key) VALUES(?,?,?)")
      .run(tagId,type,targetKey);
  } else {
    db.sqlite.prepare("DELETE FROM project_tag_assignments WHERE tag_id=? AND target_type=? AND target_key=?")
      .run(tagId,type,targetKey);
  }
  return true;
}
function targetSql(type: TagTargetType): string {
  switch (type) {
    case "contributor": return "SELECT key,MAX(label) AS label," +
      "COUNT(DISTINCT repoId) || ' repos' AS detail FROM (" +
      "SELECT lower(COALESCE(a.canonical_email,c.author_email)) AS key," +
      "MAX(c.author_name) AS label,c.repo_id AS repoId " +
      "FROM commits c JOIN repositories r ON r.id=c.repo_id " +
      "LEFT JOIN annual_identity_links a ON a.project_id=r.project_id " +
      "AND lower(a.email)=lower(c.author_email) WHERE r.project_id=? " +
      "GROUP BY c.repo_id,key " +
      "UNION ALL " +
      "SELECT lower(COALESCE(a.canonical_email,m.author_email)) AS key," +
      "MAX(m.author_name) AS label,m.repo_id AS repoId " +
      "FROM annual_commit_metrics m JOIN repositories r ON r.id=m.repo_id " +
      "LEFT JOIN annual_identity_links a ON a.project_id=r.project_id " +
      "AND lower(a.email)=lower(m.author_email) WHERE r.project_id=? " +
      "GROUP BY m.repo_id,key" +
      ") GROUP BY key";
    case "repository": return "SELECT id AS key,name AS label,provider AS detail FROM repositories WHERE project_id=?";
    case "branch": return "SELECT b.repo_id || ':' || b.name AS key," +
      "r.name || ' / ' || b.name AS label,COALESCE(b.remote,'local') AS detail " +
      "FROM branches b JOIN repositories r ON r.id=b.repo_id WHERE r.project_id=? GROUP BY b.repo_id,b.name";
    case "pull_request": return "SELECT p.repo_id || ':' || p.provider_id AS key," +
      "r.name || ' #' || p.number || ' ' || p.title AS label,p.state AS detail " +
      "FROM pull_requests p JOIN repositories r ON r.id=p.repo_id WHERE r.project_id=?";
  }
}
export function listProjectTagTargets(
  db: GitaDatabase, projectId: string, type: TagTargetType, search = "", limit = 100
): TagTargetPage {
  const needle = "%" + search.trim().toLowerCase().replace(/[\\%_]/g, c => "\\" + c) + "%";
  const sub = " FROM (" + targetSql(type) + ") AS targets WHERE " +
    "(lower(label) LIKE ? ESCAPE '\\' OR lower(key) LIKE ? ESCAPE '\\')";
  const bindings = type === "contributor" ? [projectId, projectId] : [projectId];
  const total = (db.sqlite.prepare("SELECT COUNT(*) AS count" + sub)
    .get(...bindings,needle,needle) as { count: number }).count;
  const rows = db.sqlite.prepare("SELECT key,label,detail" + sub +
    " ORDER BY label COLLATE NOCASE,key LIMIT ?"
  ).all(...bindings,needle,needle,limit) as Array<{key:string;label:string;detail:string}>;
  return { items: rows.map(row => ({ ...row, type })), total };
}
