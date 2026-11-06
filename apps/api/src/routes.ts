import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  analyticsFiltersSchema,
  branchViewInputSchema,
  branchViewPatchSchema,
  projectInputSchema,
  projectPatchSchema,
  repositoryInputSchema,
  repositoryPatchSchema,
  type ProviderState
} from "@gg/core";
import {
  createBranchView,
  createProject,
  createRefreshRun,
  getAnnualReport,
  listAnnualIdentities,
  upsertAnnualIdentity,
  createRepositoryRecord,
  deleteBranchView,
  deleteProjectWithLocalData,
  ProjectDeletionConflict,
  ProjectDeletionConfirmationError,
  deleteRepository,
  getBranchView,
  getContributorFileTypes,
  getFileTypeAnalytics,
  getHotFiles,
  getContributorLeaderboard,
  getProject,
  getProjectActivity,
  getProjectSummary,
  getRefreshRun,
  getRepository,
  getRepositoryActivity,
  getRepositoryComparison,
  getRepositoryContributors,
  getRepositorySummary,
  getRepositoryWithProviderDetails,
  listBranchViews,
  listBranches,
  listProjectBranches,
  listProjectPullRequests,
  listProjects,
  listPullRequests,
  listRepositories,
  updateBranchView,
  updateProject,
  updateRepositoryRecord,
  TagTargetNotFound,
  createProjectTag,
  deleteProjectTag,
  listProjectTagTargets,
  listProjectTags,
  setProjectTagAssignment,
  updateProjectTag,
  type GGDatabase
} from "@gg/db";
import { compareLocalBranches, isGitHubMetadataAllowed, resolveRepositoryInput } from "@gg/git-engine";
import { createGitHubAdapter } from "@gg/github-adapter";

import { enqueueProjectRefresh, enqueueRepositoryRefresh } from "./refresh";
import { enqueueAnnualProjectIndex, syncAnnualGitHubCollaboration } from "./annual";
import { discoverGitHubRepositories } from "./github-discovery";

const idParamsSchema = z.object({
  projectId: z.string().min(1).optional(),
  repoId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  branchViewId: z.string().min(1).optional()
});

export function registerRoutes(server: FastifyInstance, database: GGDatabase): void {
  server.get("/api/health", async () => ({
    ok: true,
    databasePath: database.paths.databasePath,
    reposDir: database.paths.reposDir
  }));

  server.get("/api/projects", async () => ({
    items: await listProjects(database)
  }));

  server.post("/api/projects", async (request, reply) => {
    const input = projectInputSchema.parse(request.body);
    const project = await createProject(database, input);
    return reply.status(201).send(project);
  });

  server.get("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return project;
  });

  server.patch("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const input = projectPatchSchema.parse(request.body);
    const project = await updateProject(database, requireId(projectId), input);
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return project;
  });

  server.delete("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const body = z.object({
      confirmName: z.string().min(1),
      deleteLocalData: z.literal(true)
    }).parse(request.body);
    try {
      const result = deleteProjectWithLocalData(database, requireId(projectId), body.confirmName);
      return result ? reply.status(200).send(result) : reply.status(404).send({ error: "not_found" });
    } catch (error) {
      if (error instanceof ProjectDeletionConfirmationError) {
        return reply.status(400).send({ error: "confirmation_required", message: error.message });
      }
      if (error instanceof ProjectDeletionConflict) {
        return reply.status(409).send({ error: "cleanup_conflict", message: error.message });
      }
      throw error;
    }
  });


  // The annual report is a local SQLite read. It never refreshes Git or
  // contacts GitHub as a side effect of opening the dashboard.
  // Discovery is a user-initiated POST, not a background dashboard read.
  server.post("/api/github/discover", async (request, reply) => {
    const body = z.object({ limit: z.number().int().min(1).max(5000).default(5000) }).parse(request.body ?? {});
    if (!isGitHubMetadataAllowed()) {
      return reply.status(403).send({
        error: "network_disabled",
        message: "GitHub metadata is disabled by GG_OFFLINE=1 or GG_ALLOW_GITHUB_METADATA=0."
      });
    }
    try {
      return { items: await discoverGitHubRepositories(body.limit) };
    } catch {
      return reply.status(502).send({
        error: "discovery_failed",
        message: "GitHub CLI repository discovery failed. Check gh auth status and connectivity."
      });
    }
  });

  // Import only repository records; clones require a separate explicit Refresh.
  // No user-provided path or arbitrary remote URL is accepted by this batch API.
  server.post("/api/projects/:projectId/repositories/bulk", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    const input = z.object({
      repositories: z.array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/))
        .min(1).max(25)
    }).parse(request.body);
    const names = [...new Set(input.repositories.map((name) => name.toLowerCase()))];
    const already = new Set((await listRepositories(database, project.id)).map((repo) =>
      repo.url.replace(/\.git$/i, "").toLowerCase()
    ));
    const imported = [];
    const skipped: string[] = [];
    for (const name of names) {
      const resolved = resolveRepositoryInput(name);
      const key = resolved.fetchUrl.replace(/\.git$/i, "").toLowerCase();
      if (already.has(key)) {
        skipped.push(name);
        continue;
      }
      const created = await createRepositoryRecord(database, project.id, resolved);
      imported.push(created);
      already.add(key);
    }
    return reply.status(201).send({ items: imported, skipped });
  });

  server.get("/api/projects/:projectId/annual", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const query = z.object({
      year: z.coerce.number().int().min(1970).max(2100),
      repositoryId: z.string().uuid().optional()
    }).parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    if (query.repositoryId && (await getRepository(database, query.repositoryId))?.projectId !== project.id) {
      return reply.status(400).send({ error: "repository_not_in_project" });
    }
    return getAnnualReport(database, project.id, query.year, query.repositoryId);
  });

  server.get("/api/projects/:projectId/annual/identities", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    return { items: listAnnualIdentities(database, project.id) };
  });

  server.post("/api/projects/:projectId/annual/identities", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const link = z.object({
      email: z.email().max(254),
      canonicalEmail: z.email().max(254),
      githubLogin: z.string().regex(/^[a-zA-Z0-9-]{1,39}$/).nullable()
    }).parse(request.body);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    upsertAnnualIdentity(database, project.id, link);
    return { items: listAnnualIdentities(database, project.id) };
  });

  server.post("/api/projects/:projectId/annual/reindex", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    const run = await createRefreshRun(database, {
      projectId: project.id, repositoryId: null, scope: "project", status: "queued"
    });
    enqueueAnnualProjectIndex(database, run.id, project.id);
    return reply.status(202).send(run);
  });

  server.post("/api/projects/:projectId/annual/github-sync", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    if (!isGitHubMetadataAllowed()) {
      return reply.status(403).send({
        error: "network_disabled",
        message: "GitHub metadata is disabled by GG_OFFLINE=1 or GG_ALLOW_GITHUB_METADATA=0."
      });
    }
    const body = z.object({ repositoryId: z.string().uuid().optional() }).parse(request.body ?? {});
    const repos = await listRepositories(database, project.id);
    const chosen = repos.filter((repo) =>
      repo.provider === "github" && (body.repositoryId === undefined || repo.id === body.repositoryId)
    );
    if (!chosen.length) {
      return reply.status(400).send({ error: "no_github_repository" });
    }
    const results = [];
    for (const repo of chosen) {
      const source = await getRepositoryWithProviderDetails(database, repo.id);
      if (!source) continue;
      results.push(await syncAnnualGitHubCollaboration(database, source));
    }
    return { items: results };
  });


  // Project-scoped, fully user-defined tags with explicit entity assignment.
  const tagInput = z.object({
    name: z.string().trim().min(1).max(80).refine(s => Array.from(s).every(ch => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)),
    group: z.string().trim().max(48).refine(s => Array.from(s).every(ch => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)).default("")
  });
  const tagParams = z.object({ projectId: z.string().min(1), tagId: z.string().uuid() });
  const assignmentInput = z.object({
    targetType: z.enum(["contributor","repository","branch","pull_request"]),
    targetKey: z.string().trim().min(1).max(500)
  });
  server.get("/api/projects/:projectId/tags", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    if (!await getProject(database, requireId(projectId))) return reply.status(404).send({error:"not_found"});
    return listProjectTags(database,requireId(projectId));
  });
  server.post("/api/projects/:projectId/tags", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    if (!await getProject(database, requireId(projectId))) return reply.status(404).send({error:"not_found"});
    const input = tagInput.parse(request.body);
    try { return reply.status(201).send(createProjectTag(database, requireId(projectId), input)); }
    catch (error) {
      if (isUniqueConstraintError(error)) return reply.status(409).send({error:"duplicate_tag"});
      throw error;
    }
  });
  server.patch("/api/projects/:projectId/tags/:tagId", async (request, reply) => {
    const {projectId,tagId} = tagParams.parse(request.params);
    if (!await getProject(database,projectId)) return reply.status(404).send({error:"not_found"});
    try {
      return updateProjectTag(database,projectId,tagId,tagInput.parse(request.body)) ??
        reply.status(404).send({error:"not_found"});
    } catch (error) {
      if (isUniqueConstraintError(error)) return reply.status(409).send({error:"duplicate_tag"});
      throw error;
    }
  });
  server.delete("/api/projects/:projectId/tags/:tagId", async (request, reply) => {
    const {projectId,tagId} = tagParams.parse(request.params);
    if (!await getProject(database,projectId)) return reply.status(404).send({error:"not_found"});
    return deleteProjectTag(database,projectId,tagId)
      ? reply.status(204).send() : reply.status(404).send({error:"not_found"});
  });
  server.get("/api/projects/:projectId/tag-targets", async (request, reply) => {
    const {projectId} = idParamsSchema.parse(request.params);
    if (!await getProject(database,requireId(projectId))) return reply.status(404).send({error:"not_found"});
    const query = z.object({
      type:z.enum(["contributor","repository","branch","pull_request"]),
      search:z.string().trim().max(100).default("")
    }).parse(request.query);
    return listProjectTagTargets(database,requireId(projectId),query.type,query.search);
  });
  server.post("/api/projects/:projectId/tags/:tagId/assignments", async (request,reply) => {
    const {projectId,tagId}=tagParams.parse(request.params);
    if (!await getProject(database,projectId)) return reply.status(404).send({error:"not_found"});
    const {targetType,targetKey}=assignmentInput.parse(request.body);
    try {
      return setProjectTagAssignment(database,projectId,tagId,targetType,targetKey,true)
        ? reply.status(204).send() : reply.status(404).send({error:"not_found"});
    } catch (error) {
      if (error instanceof TagTargetNotFound) return reply.status(422).send({error:"invalid_tag_target"});
      throw error;
    }
  });

  // Atomic batch assignment: if any target is stale/foreign, none of the selected targets is written.
  server.post("/api/projects/:projectId/tags/:tagId/assignments/bulk", async (request, reply) => {
    const { projectId, tagId } = tagParams.parse(request.params);
    if (!await getProject(database, projectId)) return reply.status(404).send({ error: "not_found" });
    const body = z.object({
      targetType: z.enum(["contributor", "repository", "branch", "pull_request"]),
      targetKeys: z.array(z.string().trim().min(1).max(500)).min(1).max(100)
    }).parse(request.body);
    const keys = [...new Set(body.targetKeys)];
    try {
      const done = database.sqlite.transaction(() => {
        for (const key of keys) {
          if (!setProjectTagAssignment(database, projectId, tagId, body.targetType, key, true)) return false;
        }
        return true;
      })();
      return done ? { assigned: keys.length } : reply.status(404).send({ error: "not_found" });
    } catch (error) {
      if (error instanceof TagTargetNotFound) {
        return reply.status(422).send({ error: "invalid_tag_target", message: error.message });
      }
      throw error;
    }
  });

  server.delete("/api/projects/:projectId/tags/:tagId/assignments", async (request,reply) => {
    const {projectId,tagId}=tagParams.parse(request.params);
    if (!await getProject(database,projectId)) return reply.status(404).send({error:"not_found"});
    const {targetType,targetKey}=assignmentInput.parse(request.body);
    return setProjectTagAssignment(database,projectId,tagId,targetType,targetKey,false)
      ? reply.status(204).send() : reply.status(404).send({error:"not_found"});
  });

  server.get("/api/projects/:projectId/branch-views", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await listBranchViews(database, project.id) };
  });

  server.post("/api/projects/:projectId/branch-views", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    const input = branchViewInputSchema.parse(request.body);
    try {
      const view = await createBranchView(database, project.id, input);
      return reply.status(201).send(view);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return reply.status(409).send({
          error: "conflict",
          message: "A branch view with this name already exists."
        });
      }
      throw error;
    }
  });

  server.patch("/api/branch-views/:branchViewId", async (request, reply) => {
    const { branchViewId } = idParamsSchema.parse(request.params);
    const existing = await getBranchView(database, requireId(branchViewId));
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const input = branchViewPatchSchema.parse(request.body);
    try {
      const view = await updateBranchView(database, existing.id, input);
      return view ?? reply.status(404).send({ error: "not_found" });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return reply.status(409).send({
          error: "conflict",
          message: "A branch view with this name already exists."
        });
      }
      throw error;
    }
  });

  server.delete("/api/branch-views/:branchViewId", async (request, reply) => {
    const { branchViewId } = idParamsSchema.parse(request.params);
    const deleted = await deleteBranchView(database, requireId(branchViewId));
    return deleted ? reply.status(204).send() : reply.status(404).send({ error: "not_found" });
  });

  server.get("/api/projects/:projectId/repositories", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await listRepositories(database, project.id) };
  });

  server.post("/api/projects/:projectId/repositories", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    const input = repositoryInputSchema.parse(request.body);
    const resolved = resolveRepositoryInput(input.input, input.name);
    const repository = await createRepositoryRecord(database, project.id, resolved);
    return reply.status(201).send(repository);
  });

  server.get("/api/repositories/:repoId", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const repository = await getRepository(database, requireId(repoId));
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }
    return repository;
  });

  server.patch("/api/repositories/:repoId", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const input = repositoryPatchSchema.parse(request.body);
    const repository = await updateRepositoryRecord(database, requireId(repoId), input);
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }
    return repository;
  });

  server.delete("/api/repositories/:repoId", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const deleted = await deleteRepository(database, requireId(repoId));
    return deleted ? reply.status(204).send() : reply.status(404).send({ error: "not_found" });
  });

  server.post("/api/projects/:projectId/refresh", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }

    const run = await createRefreshRun(database, {
      projectId: project.id,
      repositoryId: null,
      scope: "project",
      status: "queued"
    });
    enqueueProjectRefresh(database, run.id, project.id);
    return reply.status(202).send(run);
  });

  server.post("/api/repositories/:repoId/refresh", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const repository = await getRepository(database, requireId(repoId));
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }

    const run = await createRefreshRun(database, {
      projectId: repository.projectId,
      repositoryId: repository.id,
      scope: "repository",
      status: "queued"
    });
    enqueueRepositoryRefresh(database, run.id, repository.id);
    return reply.status(202).send(run);
  });

  server.get("/api/refresh-runs/:runId", async (request, reply) => {
    const { runId } = idParamsSchema.parse(request.params);
    const run = await getRefreshRun(database, requireId(runId));
    if (!run) {
      return reply.status(404).send({ error: "not_found" });
    }
    return run;
  });

  server.get("/api/projects/:projectId/summary", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    const summary = await getProjectSummary(database, project.id, filters);
    const repositories = await getRepositoryComparison(database, project.id, filters);
    return { ...summary, repositoryComparison: repositories };
  });

  server.get("/api/projects/:projectId/activity", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getProjectActivity(database, project.id, filters) };
  });

  server.get("/api/projects/:projectId/leaderboard", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getContributorLeaderboard(database, project.id, filters) };
  });

  server.get("/api/projects/:projectId/file-types", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getFileTypeAnalytics(database, project.id, filters) };
  });

  server.get("/api/projects/:projectId/hot-files", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getHotFiles(database, project.id, filters) };
  });

  server.get("/api/projects/:projectId/contributor-file-types", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const project = await getProject(database, requireId(projectId));
    if (!project) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getContributorFileTypes(database, project.id, filters) };
  });

  server.get("/api/repositories/:repoId/compare", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const query = z.object({
      base: z.string().min(1).max(200),
      head: z.string().min(1).max(200),
      limit: z.coerce.number().int().min(1).max(500).default(500)
    }).parse(request.query);
    const repository = await getRepository(database, requireId(repoId));
    if (!repository) return reply.status(404).send({ error: "not_found" });
    try {
      return await compareLocalBranches(repository.cachePath, query.base, query.head, query.limit);
    } catch {
      return reply.status(422).send({
        error: "comparison_unavailable",
        message: "Both branches must exist in the local Git mirror. Refresh the repository first."
      });
    }
  });

  server.get("/api/repositories/:repoId/summary", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const summary = await getRepositorySummary(database, requireId(repoId), filters);
    if (!summary) {
      return reply.status(404).send({ error: "not_found" });
    }
    return summary;
  });

  server.get("/api/repositories/:repoId/activity", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const repository = await getRepository(database, requireId(repoId));
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getRepositoryActivity(database, repository.id, filters) };
  });

  server.get("/api/repositories/:repoId/contributors", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const repository = await getRepository(database, requireId(repoId));
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { items: await getRepositoryContributors(database, repository.id, filters) };
  });

  server.get("/api/repositories/:repoId/branches", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const repository = await getRepository(database, requireId(repoId));
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }
    return {
      branchTimeSource: "headCommit",
      items: await listBranches(database, repository.id, filters)
    };
  });


  // Aggregated, paginated local inventories; the repository name disambiguates identical branch/PR numbers.
  server.get("/api/projects/:projectId/branches", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    const { limit, offset } = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(200),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(request.query);
    return listProjectBranches(database, project.id, limit, offset);
  });

  server.get("/api/projects/:projectId/pull-requests", async (request, reply) => {
    const { projectId } = idParamsSchema.parse(request.params);
    const project = await getProject(database, requireId(projectId));
    if (!project) return reply.status(404).send({ error: "not_found" });
    const { limit, offset } = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(200),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(request.query);
    const repositories = await listRepositories(database, project.id);
    const github = repositories.find(repo => repo.provider === "github");
    const details = github ? await getRepositoryWithProviderDetails(database, github.id) : null;
    const providerState = await resolveProviderState(details?.provider ?? "local", details?.githubOwnerRepo ?? null);
    return { ...listProjectPullRequests(database, project.id, limit, offset), providerState };
  });

  server.get("/api/repositories/:repoId/pull-requests", async (request, reply) => {
    const { repoId } = idParamsSchema.parse(request.params);
    const filters = analyticsFiltersSchema.parse(request.query);
    const repository = await getRepositoryWithProviderDetails(database, requireId(repoId));
    if (!repository) {
      return reply.status(404).send({ error: "not_found" });
    }

    const providerState = await resolveProviderState(
      repository.provider,
      repository.githubOwnerRepo
    );
    return {
      providerState,
      items: await listPullRequests(database, repository.id, filters)
    };
  });
}

async function resolveProviderState(
  provider: string,
  githubOwnerRepo: string | null
): Promise<ProviderState> {
  if (provider !== "github" || !githubOwnerRepo) {
    return {
      available: false,
      reason: "unsupported_provider",
      message: "Pull request metadata requires a GitHub repository."
    };
  }

  return createGitHubAdapter().getStatus();
}

function requireId(value: string | undefined): string {
  if (!value) {
    throw new Error("Expected route id.");
  }

  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
