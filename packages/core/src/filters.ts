import { z } from "zod";

const branchListSchema = z.preprocess(
  (value) => {
    if (value === undefined) {
      return undefined;
    }
    return Array.isArray(value) ? value : [value];
  },
  z.array(z.string().min(1)).optional()
);

const folderFilterListSchema = z.preprocess(
  (value) => {
    if (value === undefined) {
      return undefined;
    }
    return Array.isArray(value) ? value : [value];
  },
  z.array(z.string().min(1)).optional()
);

export const analyticsFiltersSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  repositoryId: z.string().min(1).optional(),
  contributorId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  branchScope: z.enum(["default", "all", "custom"]).optional(),
  branches: branchListSchema,
  folderFilters: folderFilterListSchema,
  metric: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional()
});

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional()
});

export const repositoryInputSchema = z.object({
  input: z.string().trim().min(1).max(1000),
  name: z.string().trim().min(1).max(120).optional()
});

export const projectPatchSchema = projectInputSchema.partial();

export const repositoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultBranch: z.string().trim().min(1).max(120).nullable().optional()
});

const branchViewBranchesSchema = z.array(z.string().trim().min(1).max(300));
const repositoryFolderFilterSchema = z.object({
  repositoryId: z.string().trim().min(1).max(200),
  mode: z.enum(["include", "exclude"]),
  paths: z.array(z.string().trim().min(1).max(1000)).default([])
});

export const branchViewInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  branches: branchViewBranchesSchema.default([]),
  folderFilters: z.array(repositoryFolderFilterSchema).default([])
});

export const branchViewPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  branches: branchViewBranchesSchema.optional(),
  folderFilters: z.array(repositoryFolderFilterSchema).optional()
});
