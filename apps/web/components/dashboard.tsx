"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileCode2,
  Folder,
  GitBranch,
  GitPullRequest,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ActivityBucket,
  Branch,
  BranchView,
  ContributorFileTypeRow,
  ContributorLeaderboardRow,
  FileTypeAnalyticsRow,
  HotFileAnalyticsRow,
  PullRequest,
  ProjectBranch,
  ProjectPullRequest,
  Project,
  RefreshRun,
  RepositoryFolderFilter,
  Repository,
  RepositoryComparisonRow
} from "@gita/core";

import { ActivityChart } from "@/components/activity-chart";
import { AnnualAnalytics } from "@/components/annual-analytics";
import { BranchComparisonPanel } from "@/components/branch-comparison";
import { GitHubRepositoryPicker } from "@/components/github-repository-picker";
import {
  ContributorComparisonChart,
  ContributorFileTypeShareChart
} from "@/components/contributor-comparison-charts";
import { DataTable } from "@/components/data-table";
import { ProjectDeleteDialog } from "@/components/project-delete-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { FileFocusChart, fileTypeLabel } from "@/components/file-focus-chart";
import {
  createBranchView,
  createProject,
  createRepository,
  deleteBranchView,
  deleteProjectAndLocalData,
  getBranches,
  getProjectBranches,
  getProjectPullRequests,
  getBranchViews,
  getContributorFileTypes,
  getFileTypes,
  getHotFiles,
  getLeaderboard,
  getProjectActivity,
  getProjectSummary,
  getProjects,
  getPullRequests,
  getRefreshRun,
  getRepositories,
  refreshProject,
  refreshRepository,
  updateBranchView,
  type DashboardFilters
} from "@/lib/api";

type BranchSelectionState = Record<string, string[]>;
type FolderFilterState = Record<
  string,
  {
    mode: "all" | RepositoryFolderFilter["mode"];
    paths: string[];
  }
>;
type BranchViewNameDialogState = {
  mode: "save" | "rename" | "duplicate";
  initialName: string;
  viewId?: string;
};

const CUSTOM_BRANCH_VIEW_ID = "custom";
const ACTIVE_BRANCH_VIEW_STORAGE_KEY = "gita.activeBranchViewByProject";
const DATE_RANGE_STORAGE_KEY = "gita.dashboardDateRange";

function getStoredActiveBranchViewId(projectId: string): string | null {
  return readActiveBranchViewStorage()[projectId] ?? null;
}

function storeActiveBranchViewId(projectId: string, viewId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ACTIVE_BRANCH_VIEW_STORAGE_KEY,
      JSON.stringify({
        ...readActiveBranchViewStorage(),
        [projectId]: viewId
      })
    );
  } catch {
    // A blocked localStorage should not break dashboard filtering.
  }
}

function readActiveBranchViewStorage(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(ACTIVE_BRANCH_VIEW_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => {
        const [key, value] = entry;
        return key.length > 0 && typeof value === "string" && value.length > 0;
      })
    );
  } catch {
    return {};
  }
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState("all");
  const [branchPage, setBranchPage] = useState(0);
  const [prPage, setPrPage] = useState(0);
  const [selectedContributorId, setSelectedContributorId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateRangeRestored, setDateRangeRestored] = useState(false);
  const [metric, setMetric] = useState("commits");
  const [branchSelection, setBranchSelection] = useState<BranchSelectionState>({});
  const [folderFilters, setFolderFilters] = useState<FolderFilterState>({});
  const [activeBranchViewId, setActiveBranchViewId] = useState(CUSTOM_BRANCH_VIEW_ID);
  const activeBranchViewIdRef = useRef(CUSTOM_BRANCH_VIEW_ID);
  const [initializedBranchSelectionProjectId, setInitializedBranchSelectionProjectId] = useState<
    string | null
  >(null);
  const [restoredBranchViewProjectId, setRestoredBranchViewProjectId] = useState<string | null>(
    null
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDeleteOpen, setProjectDeleteOpen] = useState(false);
  const [projectDeleteWarning, setProjectDeleteWarning] = useState<string | null>(null);
  const [repositoryDialogOpen, setRepositoryDialogOpen] = useState(false);
  const [branchEditorOpen, setBranchEditorOpen] = useState(false);
  const [branchViewNameDialog, setBranchViewNameDialog] =
    useState<BranchViewNameDialogState | null>(null);
  const [branchViewDeleteDialog, setBranchViewDeleteDialog] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects
  });
  const projects = projectsQuery.data?.items ?? [];

  useEffect(() => {
    if (!selectedProjectId && projects[0]) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    const storedDateRange = readStoredDateRange();
    if (storedDateRange) {
      setDatePreset(storedDateRange.preset);
      setFrom(storedDateRange.from);
      setTo(storedDateRange.to);
      setMonthCursor(parseDateInput(storedDateRange.monthCursor) ?? startOfMonth(new Date()));
    }
    setDateRangeRestored(true);
  }, []);

  useEffect(() => {
    if (!dateRangeRestored) {
      return;
    }
    storeDateRange({
      preset: datePreset,
      from,
      to,
      monthCursor: formatDateInput(startOfMonth(monthCursor))
    });
  }, [datePreset, dateRangeRestored, from, monthCursor, to]);

  const repositoriesQuery = useQuery({
    queryKey: ["repositories", selectedProjectId],
    queryFn: () => getRepositories(requireSelected(selectedProjectId)),
    enabled: Boolean(selectedProjectId)
  });
  const repositories = repositoriesQuery.data?.items ?? [];

  const branchViewsQuery = useQuery({
    queryKey: ["branch-views", selectedProjectId],
    queryFn: () => getBranchViews(requireSelected(selectedProjectId)),
    enabled: Boolean(selectedProjectId)
  });
  const branchViews = branchViewsQuery.data?.items ?? [];

  useEffect(() => {
    setActiveBranchView(CUSTOM_BRANCH_VIEW_ID, { persist: false });
    setBranchSelection({});
    setFolderFilters({});
    setInitializedBranchSelectionProjectId(null);
    setRestoredBranchViewProjectId(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedRepoId !== "all" && !repositories.some((repo) => repo.id === selectedRepoId)) {
      setSelectedRepoId("all");
    }
  }, [repositories, selectedRepoId]);

  const filters = useMemo<DashboardFilters>(
    () => ({
      repositoryId: selectedRepoId === "all" ? undefined : selectedRepoId,
      from: from || undefined,
      to: to || undefined,
      branchScope: "custom",
      branches: serializeBranchSelection(branchSelection),
      folderFilters: serializeFolderFiltersForQuery(folderFilters),
      metric,
      limit: 50
    }),
    [branchSelection, folderFilters, from, metric, selectedRepoId, to]
  );
  const contributorFilters = useMemo<DashboardFilters | null>(
    () =>
      selectedContributorId
        ? {
            ...filters,
            contributorId: selectedContributorId,
            limit: 400
          }
        : null,
    [filters, selectedContributorId]
  );

  const summaryQuery = useQuery({
    queryKey: ["summary", selectedProjectId, filters],
    queryFn: () => getProjectSummary(requireSelected(selectedProjectId), filters),
    enabled: Boolean(selectedProjectId)
  });
  const activityQuery = useQuery({
    queryKey: ["activity", selectedProjectId, filters],
    queryFn: () => getProjectActivity(requireSelected(selectedProjectId), filters),
    enabled: Boolean(selectedProjectId)
  });
  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", selectedProjectId, filters],
    queryFn: () => getLeaderboard(requireSelected(selectedProjectId), filters),
    enabled: Boolean(selectedProjectId)
  });
  const contributorActivityQuery = useQuery({
    queryKey: ["contributor-activity", selectedProjectId, contributorFilters],
    queryFn: () => getProjectActivity(requireSelected(selectedProjectId), contributorFilters ?? {}),
    enabled: Boolean(selectedProjectId && contributorFilters)
  });
  const contributorLeaderboardQuery = useQuery({
    queryKey: ["contributor-leaderboard", selectedProjectId, contributorFilters],
    queryFn: () => getLeaderboard(requireSelected(selectedProjectId), contributorFilters ?? {}),
    enabled: Boolean(selectedProjectId && contributorFilters)
  });
  const fileTypesQuery = useQuery({
    queryKey: ["file-types", selectedProjectId, filters],
    queryFn: () => getFileTypes(requireSelected(selectedProjectId), filters),
    enabled: Boolean(selectedProjectId)
  });
  const hotFilesQuery = useQuery({
    queryKey: ["hot-files", selectedProjectId, filters],
    queryFn: () => getHotFiles(requireSelected(selectedProjectId), { ...filters, limit: 80 }),
    enabled: Boolean(selectedProjectId)
  });
  const contributorFileTypesQuery = useQuery({
    queryKey: ["contributor-file-types", selectedProjectId, filters],
    queryFn: () =>
      getContributorFileTypes(requireSelected(selectedProjectId), { ...filters, limit: 120 }),
    enabled: Boolean(selectedProjectId)
  });
  const selectedContributorFileTypesQuery = useQuery({
    queryKey: ["selected-contributor-file-types", selectedProjectId, contributorFilters],
    queryFn: () =>
      getContributorFileTypes(requireSelected(selectedProjectId), contributorFilters ?? {}),
    enabled: Boolean(selectedProjectId && contributorFilters)
  });
  useEffect(() => {
    setBranchPage(0);
    setPrPage(0);
  }, [selectedProjectId, selectedRepoId]);
  const projectBranchesQuery = useQuery({
    queryKey: ["project-branches", selectedProjectId, branchPage],
    queryFn: () => getProjectBranches(requireSelected(selectedProjectId), branchPage),
    enabled: Boolean(selectedProjectId && selectedRepoId === "all")
  });
  const projectPullRequestsQuery = useQuery({
    queryKey: ["project-pull-requests", selectedProjectId, prPage],
    queryFn: () => getProjectPullRequests(requireSelected(selectedProjectId), prPage),
    enabled: Boolean(selectedProjectId && selectedRepoId === "all")
  });
  const branchesQuery = useQuery({
    queryKey: ["branches", selectedRepoId],
    queryFn: () => getBranches(selectedRepoId),
    enabled: selectedRepoId !== "all"
  });
  const repositoryBranchesQueries = useQueries({
    queries: repositories.map((repo) => ({
      queryKey: ["branches", repo.id],
      queryFn: () => getBranches(repo.id),
      enabled: repositories.length > 0
    }))
  });
  const pullRequestsQuery = useQuery({
    queryKey: ["pull-requests", selectedRepoId],
    queryFn: () => getPullRequests(selectedRepoId),
    enabled: selectedRepoId !== "all"
  });
  const refreshRunQuery = useQuery({
    queryKey: ["refresh-run", activeRunId],
    queryFn: () => getRefreshRun(requireSelected(activeRunId)),
    enabled: Boolean(activeRunId),
    refetchInterval: 1000
  });

  useEffect(() => {
    const run = refreshRunQuery.data;
    if (!run || (run.status !== "succeeded" && run.status !== "failed")) {
      return;
    }

    void queryClient.invalidateQueries();
  }, [queryClient, refreshRunQuery.data]);

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess(project) {
      setProjectDialogOpen(false);
      setSelectedProjectId(project.id);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: ({ id, confirmation }: { id: string; confirmation: string }) =>
      deleteProjectAndLocalData(id, confirmation),
    onSuccess(result, { id }) {
      queryClient.setQueryData<{ items: Project[] }>(["projects"], (data) =>
        data ? { items: data.items.filter((project) => project.id !== id) } : data
      );
      setProjectDeleteOpen(false);
      setProjectDeleteWarning(result.cleanupWarning);
      setSelectedProjectId((previous) =>
        previous === id ? (projects.find((project) => project.id !== id)?.id ?? null) : previous
      );
      setSelectedRepoId("all");
      setSelectedContributorId(null);
      setActiveRunId(null);
      try {
        const stored = readActiveBranchViewStorage();
        delete stored[id];
        window.localStorage.setItem(ACTIVE_BRANCH_VIEW_STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // A disabled browser preference store must not block project deletion.
      }
      void queryClient.invalidateQueries();
    }
  });

  const createRepositoryMutation = useMutation({
    mutationFn: (input: { input: string; name?: string }) =>
      createRepository(requireSelected(selectedProjectId), input),
    onSuccess() {
      setRepositoryDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["repositories", selectedProjectId] });
      void queryClient.invalidateQueries({ queryKey: ["summary", selectedProjectId] });
    }
  });

  const refreshProjectMutation = useMutation({
    mutationFn: () => refreshProject(requireSelected(selectedProjectId)),
    onSuccess(run) {
      setActiveRunId(run.id);
    }
  });

  const refreshRepositoryMutation = useMutation({
    mutationFn: () => refreshRepository(selectedRepoId),
    onSuccess(run) {
      setActiveRunId(run.id);
    }
  });

  const createBranchViewMutation = useMutation({
    mutationFn: (input: {
      name: string;
      branches: string[];
      folderFilters: RepositoryFolderFilter[];
    }) =>
      createBranchView(requireSelected(selectedProjectId), input),
    onSuccess(view) {
      queryClient.setQueryData<{ items: BranchView[] }>(["branch-views", view.projectId], (data) =>
        upsertBranchViewResponse(data, view)
      );
      setBranchViewNameDialog(null);
      setActiveBranchView(view.id, { projectId: view.projectId });
      setBranchSelection(deserializeBranchSelection(view.branches));
      setFolderFilters(deserializeFolderFilters(view.folderFilters));
      void queryClient.invalidateQueries({ queryKey: ["branch-views", selectedProjectId] });
    }
  });

  const updateBranchViewMutation = useMutation({
    mutationFn: (input: {
      viewId: string;
      name?: string;
      branches?: string[];
      folderFilters?: RepositoryFolderFilter[];
    }) =>
      updateBranchView(input.viewId, {
        name: input.name,
        branches: input.branches,
        folderFilters: input.folderFilters
      }),
    onSuccess(view) {
      queryClient.setQueryData<{ items: BranchView[] }>(["branch-views", view.projectId], (data) =>
        upsertBranchViewResponse(data, view)
      );
      setBranchViewNameDialog(null);
      setActiveBranchView(view.id, { projectId: view.projectId });
      setBranchSelection(deserializeBranchSelection(view.branches));
      setFolderFilters(deserializeFolderFilters(view.folderFilters));
      void queryClient.invalidateQueries({ queryKey: ["branch-views", selectedProjectId] });
    }
  });

  const deleteBranchViewMutation = useMutation({
    mutationFn: (viewId: string) => deleteBranchView(viewId),
    onSuccess(_, viewId) {
      queryClient.setQueryData<{ items: BranchView[] }>(
        ["branch-views", selectedProjectId],
        (data) => removeBranchViewResponse(data, viewId)
      );
      setBranchViewDeleteDialog(null);
      setActiveBranchView(CUSTOM_BRANCH_VIEW_ID);
      setInitializedBranchSelectionProjectId(null);
      void queryClient.invalidateQueries({ queryKey: ["branch-views", selectedProjectId] });
    }
  });

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedRepository = repositories.find((repo) => repo.id === selectedRepoId) ?? null;
  const summary = summaryQuery.data;
  const totalNetLines = summary?.netLines ?? 0;
  const activity = activityQuery.data?.items ?? [];
  const leaderboard = leaderboardQuery.data?.items ?? [];
  const selectedContributor =
    contributorLeaderboardQuery.data?.items[0] ??
    leaderboard.find((contributor) => contributor.contributorId === selectedContributorId) ??
    null;
  const selectedContributorActivity = contributorActivityQuery.data?.items ?? [];
  const fileTypes = fileTypesQuery.data?.items ?? [];
  const hotFiles = hotFilesQuery.data?.items ?? [];
  const contributorFileTypes = contributorFileTypesQuery.data?.items ?? [];
  const selectedContributorFileTypes = selectedContributorFileTypesQuery.data?.items ?? [];
  const branches: ProjectBranch[] = selectedRepoId === "all"
    ? projectBranchesQuery.data?.items ?? []
    : (branchesQuery.data?.items ?? []).map(row => ({
        ...row, repositoryName: selectedRepository?.name ?? ""
      }));
  const pullRequests: ProjectPullRequest[] = selectedRepoId === "all"
    ? projectPullRequestsQuery.data?.items ?? []
    : (pullRequestsQuery.data?.items ?? []).map(row => ({
        ...row, repositoryName: selectedRepository?.name ?? ""
      }));
  const providerState = selectedRepoId === "all"
    ? projectPullRequestsQuery.data?.providerState ?? null
    : pullRequestsQuery.data?.providerState ?? null;
  const currentRun = refreshRunQuery.data ?? null;
  const repositoryBranchSettings = repositories.map((repo, index) =>
    toRepositoryBranchSetting(repo, repositoryBranchesQueries[index]?.data?.items ?? [])
  );
  const repositoryBranchSettingsKey = repositoryBranchSettings
    .map(
      ({ repository, branchItems }) =>
        `${repository.id}:${repository.defaultBranch ?? ""}:${branchItems
          .map((branch) => branch.value)
          .join(",")}`
    )
    .join("|");
  const visibleBranchSettings = getVisibleBranchSettings(repositoryBranchSettings, selectedRepoId);
  const fileTypeTotals = summarizeFileTypes(fileTypes);
  const contributorTotals = summarizeContributors(leaderboard);
  const branchViewError =
    branchViewsQuery.error ??
    createBranchViewMutation.error ??
    updateBranchViewMutation.error ??
    deleteBranchViewMutation.error;

  function setActiveBranchView(
    viewId: string,
    options: { projectId?: string | null; persist?: boolean } = {}
  ): void {
    activeBranchViewIdRef.current = viewId;
    setActiveBranchViewId(viewId);
    const projectId = options.projectId === undefined ? selectedProjectId : options.projectId;
    if (options.persist !== false && projectId) {
      storeActiveBranchViewId(projectId, viewId);
    }
  }

  useEffect(() => {
    if (!selectedProjectId || initializedBranchSelectionProjectId === selectedProjectId) {
      return;
    }
    if (repositoryBranchSettings.length === 0) {
      return;
    }
    setBranchSelection(buildConfiguredBranchSelection(repositoryBranchSettings, "all"));
    setInitializedBranchSelectionProjectId(selectedProjectId);
  }, [
    initializedBranchSelectionProjectId,
    repositoryBranchSettings,
    repositoryBranchSettingsKey,
    selectedProjectId
  ]);

  useEffect(() => {
    if (
      !selectedProjectId ||
      restoredBranchViewProjectId === selectedProjectId ||
      !branchViewsQuery.isSuccess
    ) {
      return;
    }

    const storedViewId = getStoredActiveBranchViewId(selectedProjectId);
    if (!storedViewId || storedViewId === CUSTOM_BRANCH_VIEW_ID) {
      setActiveBranchView(CUSTOM_BRANCH_VIEW_ID, { persist: false });
      setRestoredBranchViewProjectId(selectedProjectId);
      return;
    }

    const storedView = branchViews.find((view) => view.id === storedViewId);
    if (!storedView) {
      setActiveBranchView(CUSTOM_BRANCH_VIEW_ID, { projectId: selectedProjectId });
      setRestoredBranchViewProjectId(selectedProjectId);
      return;
    }

    setActiveBranchView(storedView.id, { persist: false });
    setBranchSelection(deserializeBranchSelection(storedView.branches));
    setFolderFilters(deserializeFolderFilters(storedView.folderFilters));
    setInitializedBranchSelectionProjectId(selectedProjectId);
    setRestoredBranchViewProjectId(selectedProjectId);
  }, [branchViews, branchViewsQuery.isSuccess, restoredBranchViewProjectId, selectedProjectId]);

  useEffect(() => {
    if (
      activeBranchViewId === CUSTOM_BRANCH_VIEW_ID ||
      !selectedProjectId ||
      restoredBranchViewProjectId !== selectedProjectId ||
      !branchViewsQuery.isSuccess
    ) {
      return;
    }
    const view = branchViews.find((item) => item.id === activeBranchViewId);
    if (!view) {
      setActiveBranchView(CUSTOM_BRANCH_VIEW_ID, { projectId: selectedProjectId });
      setInitializedBranchSelectionProjectId(null);
    }
  }, [
    activeBranchViewId,
    branchViews,
    branchViewsQuery.isSuccess,
    restoredBranchViewProjectId,
    selectedProjectId
  ]);

  function handleToggleCustomBranch(repoId: string, branchName: string): void {
    setBranchSelection((current) => toggleBranchSelection(current, repoId, branchName));
  }

  function handleFolderModeChange(repoId: string, mode: FolderFilterState[string]["mode"]): void {
    setFolderFilters((current) => updateFolderFilterMode(current, repoId, mode));
  }

  function handleFolderPathsChange(repoId: string, value: string): void {
    setFolderFilters((current) => updateFolderFilterPaths(current, repoId, value));
  }

  function handleBranchViewChange(nextViewId: string): void {
    setActiveBranchView(nextViewId);
    if (nextViewId === CUSTOM_BRANCH_VIEW_ID) {
      return;
    }
    const view = branchViews.find((item) => item.id === nextViewId);
    if (view) {
      setBranchSelection(deserializeBranchSelection(view.branches));
      setFolderFilters(deserializeFolderFilters(view.folderFilters));
    }
  }

  function handleSaveActiveBranchView(): void {
    const viewId = activeBranchViewIdRef.current;
    if (viewId === CUSTOM_BRANCH_VIEW_ID) {
      return;
    }
    updateBranchViewMutation.mutate({
      viewId,
      branches: serializeBranchSelection(branchSelection),
      folderFilters: serializeFolderFiltersForStorage(folderFilters)
    });
  }

  function handleBranchViewNameSubmit(name: string): void {
    if (!branchViewNameDialog) {
      return;
    }
    const branches = serializeBranchSelection(branchSelection);
    const serializedFolderFilters = serializeFolderFiltersForStorage(folderFilters);
    const viewId = branchViewNameDialog.viewId ?? activeBranchViewIdRef.current;
    if (branchViewNameDialog.mode === "rename" && viewId !== CUSTOM_BRANCH_VIEW_ID) {
      updateBranchViewMutation.mutate({ viewId, name });
      return;
    }
    createBranchViewMutation.mutate({ name, branches, folderFilters: serializedFolderFilters });
  }

  function handleDeleteActiveBranchView(): void {
    const viewId = activeBranchViewIdRef.current;
    if (viewId === CUSTOM_BRANCH_VIEW_ID) {
      return;
    }
    const view = branchViews.find((item) => item.id === viewId);
    setBranchViewDeleteDialog({
      id: viewId,
      name: view?.name ?? "selected view"
    });
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">Gita</h1>
                <p className="truncate text-sm text-muted-foreground">
                  {selectedProject?.name ?? "Local git analytics"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentRun ? <RefreshStatus run={currentRun} /> : null}
              <ThemeToggle />
              <GitHubRepositoryPicker
                projectId={selectedProjectId}
                repositories={repositories}
                onImported={() => {
                  void queryClient.invalidateQueries({ queryKey: ["repositories", selectedProjectId] });
                  void queryClient.invalidateQueries({ queryKey: ["summary", selectedProjectId] });
                }}
              />
              <ProjectDialog
                open={projectDialogOpen}
                onOpenChange={setProjectDialogOpen}
                pending={createProjectMutation.isPending}
                error={createProjectMutation.error}
                onSubmit={(input) => createProjectMutation.mutate(input)}
              />
              <RepositoryDialog
                open={repositoryDialogOpen}
                onOpenChange={setRepositoryDialogOpen}
                disabled={!selectedProjectId}
                pending={createRepositoryMutation.isPending}
                error={createRepositoryMutation.error}
                onSubmit={(input) => createRepositoryMutation.mutate(input)}
              />
              <IconButton
                label="Delete project and local data"
                onClick={() => setProjectDeleteOpen(true)}
                disabled={!selectedProjectId || deleteProjectMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-danger" />
              </IconButton>
              <IconButton
                label="Refresh project"
                onClick={() => refreshProjectMutation.mutate()}
                disabled={!selectedProjectId || refreshProjectMutation.isPending}
              >
                <RefreshCw className={iconClass(refreshProjectMutation.isPending)} />
              </IconButton>
              <IconButton
                label="Refresh repository"
                onClick={() => refreshRepositoryMutation.mutate()}
                disabled={selectedRepoId === "all" || refreshRepositoryMutation.isPending}
              >
                <GitBranch className={iconClass(refreshRepositoryMutation.isPending)} />
              </IconButton>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(520px,2fr)_160px]">
            <SelectBox
              value={selectedProjectId ?? ""}
              placeholder="Project"
              disabled={projects.length === 0}
              onValueChange={setSelectedProjectId}
              items={projects.map((project) => ({ value: project.id, label: project.name }))}
            />
            <SelectBox
              value={selectedRepoId}
              placeholder="Repository"
              disabled={!selectedProjectId}
              onValueChange={setSelectedRepoId}
              items={[
                { value: "all", label: "All repositories" },
                ...repositories.map((repo) => ({ value: repo.id, label: repo.name }))
              ]}
            />
            <DateRangeControls
              preset={datePreset}
              monthCursor={monthCursor}
              from={from}
              to={to}
              onPresetChange={(preset) => {
                const nextRange = resolveDatePreset(preset, new Date());
                setDatePreset(preset);
                setMonthCursor(nextRange.monthCursor);
                setFrom(nextRange.from);
                setTo(nextRange.to);
              }}
              onMonthShift={(offset) => {
                const shiftedMonth = addMonths(monthCursor, offset);
                const nextRange = monthRange(shiftedMonth);
                setDatePreset("month");
                setMonthCursor(startOfMonth(shiftedMonth));
                setFrom(nextRange.from);
                setTo(nextRange.to);
              }}
              onFromChange={(value) => {
                setDatePreset("custom");
                setFrom(value);
              }}
              onToChange={(value) => {
                setDatePreset("custom");
                setTo(value);
              }}
            />
            <SelectBox
              value={metric}
              placeholder="Metric"
              onValueChange={setMetric}
              items={[
                { value: "commits", label: "Commits" },
                { value: "churn", label: "Churn" },
                { value: "insertions", label: "Insertions" },
                { value: "deletions", label: "Deletions" },
                { value: "netLines", label: "Net lines" },
                { value: "files", label: "Files" },
                { value: "lines", label: "Lines" }
              ]}
            />
          </div>

          <BranchViewControls
            activeViewId={activeBranchViewId}
            views={branchViews}
            branchSettings={visibleBranchSettings}
            selection={branchSelection}
            folderFilters={folderFilters}
            pending={
              branchViewsQuery.isLoading ||
              createBranchViewMutation.isPending ||
              updateBranchViewMutation.isPending ||
              deleteBranchViewMutation.isPending
            }
            error={branchViewError}
            onViewChange={handleBranchViewChange}
            onOpenEditor={() => setBranchEditorOpen(true)}
            onSave={() => setBranchViewNameDialog({ mode: "save", initialName: "" })}
            onUpdate={handleSaveActiveBranchView}
            onDuplicate={() => {
              const viewId = activeBranchViewIdRef.current;
              const view = branchViews.find((item) => item.id === viewId);
              setBranchViewNameDialog({
                mode: "duplicate",
                initialName: `${view?.name ?? "Custom"} copy`
              });
            }}
            onRename={() => {
              const viewId = activeBranchViewIdRef.current;
              if (viewId !== "custom") {
                const view = branchViews.find((item) => item.id === viewId);
                setBranchViewNameDialog({
                  mode: "rename",
                  initialName: view?.name ?? "",
                  viewId
                });
              }
            }}
            onDelete={handleDeleteActiveBranchView}
          />
          <BranchSelectionDialog
            open={branchEditorOpen}
            onOpenChange={setBranchEditorOpen}
            branchSettings={visibleBranchSettings}
            selection={branchSelection}
            folderFilters={folderFilters}
            onToggleBranch={handleToggleCustomBranch}
            onFolderModeChange={handleFolderModeChange}
            onFolderPathsChange={handleFolderPathsChange}
            onUseConfigured={() =>
              setBranchSelection((current) =>
                selectConfiguredVisibleBranches(current, repositoryBranchSettings, selectedRepoId)
              )
            }
            onUseVisibleAll={() =>
              setBranchSelection((current) =>
                selectAllVisibleBranches(current, repositoryBranchSettings, selectedRepoId)
              )
            }
            onClearVisible={() =>
              setBranchSelection((current) =>
                clearVisibleBranches(current, repositoryBranchSettings, selectedRepoId)
              )
            }
          />
          <BranchViewNameDialog
            state={branchViewNameDialog}
            pending={createBranchViewMutation.isPending || updateBranchViewMutation.isPending}
            error={createBranchViewMutation.error ?? updateBranchViewMutation.error}
            onOpenChange={(open) => {
              if (!open) {
                setBranchViewNameDialog(null);
              }
            }}
            onSubmit={handleBranchViewNameSubmit}
          />
          <BranchViewDeleteDialog
            candidate={branchViewDeleteDialog}
            pending={deleteBranchViewMutation.isPending}
            error={deleteBranchViewMutation.error}
            onOpenChange={(open) => {
              if (!open) {
                setBranchViewDeleteDialog(null);
              }
            }}
            onConfirm={(viewId) => deleteBranchViewMutation.mutate(viewId)}
          />
          <ProjectDeleteDialog
            project={selectedProject}
            open={projectDeleteOpen}
            onOpenChange={setProjectDeleteOpen}
            pending={deleteProjectMutation.isPending}
            error={deleteProjectMutation.error}
            onConfirm={(id, confirmation) => deleteProjectMutation.mutate({ id, confirmation })}
          />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 lg:px-6">
        {projectsQuery.isError ? <ErrorBanner error={projectsQuery.error} /> : null}
        {projectDeleteWarning ? (
          <p role="alert" className="rounded-md border border-warning p-3 text-sm text-warning">
            {projectDeleteWarning}
          </p>
        ) : null}

        {projects.length === 0 && !projectsQuery.isLoading ? (
          <EmptyProjectState onCreate={() => setProjectDialogOpen(true)} />
        ) : (
          <Tabs.Root defaultValue="annual" className="grid gap-4">
            <Tabs.List className="flex overflow-x-auto rounded-md border border-border bg-panel p-1 text-sm shadow-panel">
              <TabTrigger
                value="annual"
                icon={<BarChart3 className="h-4 w-4" />}
                label="Annual contribution"
              />
              <TabTrigger
                value="overview"
                icon={<Database className="h-4 w-4" />}
                label="Overview"
              />
              <TabTrigger
                value="contributors"
                icon={<Users className="h-4 w-4" />}
                label="Contributors"
              />
              <TabTrigger
                value="files"
                icon={<FileCode2 className="h-4 w-4" />}
                label="Files & focus"
              />
              <TabTrigger
                value="branches"
                icon={<GitBranch className="h-4 w-4" />}
                label="Branches"
              />
              <TabTrigger
                value="pull-requests"
                icon={<GitPullRequest className="h-4 w-4" />}
                label="Pull requests"
              />
            </Tabs.List>

            <Tabs.Content
              value="annual"
              className="grid gap-4 data-[state=inactive]:hidden"
            >
              {selectedProjectId ? (
                <AnnualAnalytics
                  projectId={selectedProjectId}
                  repositoryId={selectedRepoId}
                  onRunStarted={setActiveRunId}
                />
              ) : null}
            </Tabs.Content>
            <Tabs.Content
              value="overview"
              className="grid gap-4 data-[state=inactive]:hidden"
            >
              {summaryQuery.isError ? <ErrorBanner error={summaryQuery.error} /> : null}
              <KpiStrip
                loading={summaryQuery.isLoading}
                items={[
                  { label: "Repositories", value: summary?.repositories ?? 0 },
                  { label: "Commits", value: summary?.commits ?? 0 },
                  { label: "Contributors", value: summary?.contributors ?? 0 },
                  { label: "Net lines", value: summary?.netLines ?? 0 },
                  {
                    label: "Net %",
                    value: formatPercent(
                      calculateNetPercent(summary?.insertions ?? 0, summary?.deletions ?? 0)
                    )
                  },
                  { label: "Branches", value: summary?.branches ?? 0 }
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]">
                <section className="rounded-md border border-border bg-panel p-4 shadow-panel">
                  <SectionTitle
                    title="Activity"
                    subtitle={
                      summary?.lastActivity
                        ? `Last activity ${formatDate(summary.lastActivity)}`
                        : ""
                    }
                  />
                  {activityQuery.isLoading ? (
                    <LoadingBlock />
                  ) : activity.length > 0 ? (
                    <ActivityChart data={activity} />
                  ) : (
                    <EmptyBlock label="No commit activity in this scope." />
                  )}
                </section>
                <section className="grid content-start gap-3">
                  <SectionTitle
                    title="Contributor leaderboard"
                    subtitle="Merge line totals excluded"
                  />
                  <DataTable
                    columns={buildLeaderboardColumns(totalNetLines)}
                    data={leaderboard}
                    emptyLabel="No contributors in this scope."
                    onRowClick={(row) => setSelectedContributorId(row.contributorId)}
                    rowClassName={(row) =>
                      row.contributorId === selectedContributorId ? "bg-muted/80" : ""
                    }
                  />
                  {selectedContributor ? (
                    <ContributorDetail
                      contributor={selectedContributor}
                      activity={selectedContributorActivity}
                      fileTypes={selectedContributorFileTypes}
                      totalNetLines={totalNetLines}
                      loading={
                        contributorActivityQuery.isLoading ||
                        contributorLeaderboardQuery.isLoading ||
                        selectedContributorFileTypesQuery.isLoading
                      }
                      onClose={() => setSelectedContributorId(null)}
                    />
                  ) : null}
                </section>
              </div>

              <section className="grid gap-3">
                <SectionTitle title="Repository comparison" subtitle="Project-level rollup" />
                <DataTable
                  columns={buildRepositoryColumns(totalNetLines)}
                  data={summary?.repositoryComparison ?? []}
                  emptyLabel="No repositories with analyzed commits."
                />
              </section>
            </Tabs.Content>

            <Tabs.Content
              value="contributors"
              className="grid gap-4 data-[state=inactive]:hidden"
            >
              {leaderboardQuery.isError ? <ErrorBanner error={leaderboardQuery.error} /> : null}
              {contributorFileTypesQuery.isError ? (
                <ErrorBanner error={contributorFileTypesQuery.error} />
              ) : null}

              <KpiStrip
                loading={leaderboardQuery.isLoading}
                items={[
                  { label: "Contributors", value: summary?.contributors ?? 0 },
                  { label: "Commits", value: contributorTotals.commits },
                  { label: "Churn", value: contributorTotals.churn },
                  { label: "Net lines", value: contributorTotals.netLines },
                  { label: "Top workload", value: contributorTotals.topWorkload },
                  { label: "Top NET", value: contributorTotals.topNet }
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
                <section className="rounded-md border border-border bg-panel p-4 shadow-panel">
                  <SectionTitle
                    title="Contributor activity"
                    subtitle="Sorted by selected metric"
                  />
                  {leaderboardQuery.isLoading ? (
                    <LoadingBlock />
                  ) : leaderboard.length > 0 ? (
                    <ContributorComparisonChart data={leaderboard} metric={metric} />
                  ) : (
                    <EmptyBlock label="No contributor data in this scope." />
                  )}
                </section>
                <section className="rounded-md border border-border bg-panel p-4 shadow-panel">
                  <SectionTitle
                    title="File type share"
                    subtitle="Contributor split per file type"
                  />
                  {contributorFileTypesQuery.isLoading ? (
                    <LoadingBlock />
                  ) : contributorFileTypes.length > 0 ? (
                    <ContributorFileTypeShareChart data={contributorFileTypes} metric={metric} />
                  ) : (
                    <EmptyBlock label="No contributor file-type split in this scope." />
                  )}
                </section>
              </div>

              <section className="grid gap-3">
                <SectionTitle title="Contributor comparison" subtitle="Click headers to sort" />
                <DataTable
                  columns={buildLeaderboardColumns(totalNetLines)}
                  data={leaderboard}
                  emptyLabel="No contributors in this scope."
                  onRowClick={(row) => setSelectedContributorId(row.contributorId)}
                  rowClassName={(row) =>
                    row.contributorId === selectedContributorId ? "bg-muted/80" : ""
                  }
                />
              </section>

              <section className="grid gap-3">
                <SectionTitle
                  title="Contributor by file type"
                  subtitle="Work profile across file types"
                />
                <DataTable
                  columns={contributorFileTypeColumns}
                  data={contributorFileTypes}
                  emptyLabel="No contributor file-type focus data."
                  onRowClick={(row) => setSelectedContributorId(row.contributorId)}
                  rowClassName={(row) =>
                    row.contributorId === selectedContributorId ? "bg-muted/80" : ""
                  }
                />
              </section>

              {selectedContributor ? (
                <ContributorDetail
                  contributor={selectedContributor}
                  activity={selectedContributorActivity}
                  fileTypes={selectedContributorFileTypes}
                  totalNetLines={totalNetLines}
                  loading={
                    contributorActivityQuery.isLoading ||
                    contributorLeaderboardQuery.isLoading ||
                    selectedContributorFileTypesQuery.isLoading
                  }
                  onClose={() => setSelectedContributorId(null)}
                />
              ) : null}
            </Tabs.Content>

            <Tabs.Content
              value="files"
              className="grid gap-4 data-[state=inactive]:hidden"
            >
              {fileTypesQuery.isError ? <ErrorBanner error={fileTypesQuery.error} /> : null}
              {hotFilesQuery.isError ? <ErrorBanner error={hotFilesQuery.error} /> : null}
              {contributorFileTypesQuery.isError ? (
                <ErrorBanner error={contributorFileTypesQuery.error} />
              ) : null}

              <KpiStrip
                loading={fileTypesQuery.isLoading}
                items={[
                  { label: "Files", value: fileTypeTotals.files },
                  { label: "Known lines", value: fileTypeTotals.lines },
                  { label: "File types", value: fileTypeTotals.types },
                  { label: "Touched files", value: fileTypeTotals.touchedFiles },
                  { label: "Churn", value: fileTypeTotals.churn },
                  { label: "Binary/unknown", value: fileTypeTotals.binaryFiles }
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
                <section className="rounded-md border border-border bg-panel p-4 shadow-panel">
                  <SectionTitle
                    title="File types"
                    subtitle="Current snapshot + selected range changes"
                  />
                  {fileTypesQuery.isLoading ? (
                    <LoadingBlock />
                  ) : fileTypes.length > 0 ? (
                    <FileFocusChart data={fileTypes} metric={metric} />
                  ) : (
                    <EmptyBlock label="Refresh repositories to build file type inventory." />
                  )}
                </section>
                <section className="grid content-start gap-3">
                  <SectionTitle title="File type breakdown" subtitle="Sorted by selected metric" />
                  <DataTable
                    columns={fileTypeColumns}
                    data={fileTypes}
                    emptyLabel="No file type data in this scope."
                  />
                </section>
              </div>

              <section className="grid gap-3">
                <SectionTitle title="Hot files" subtitle="Files with the highest selected metric" />
                <DataTable
                  columns={hotFileColumns}
                  data={hotFiles}
                  emptyLabel="No file-level changes in this scope."
                />
              </section>

              <section className="grid gap-3">
                <SectionTitle
                  title="Contributor focus"
                  subtitle="Who changes which file types most"
                />
                <DataTable
                  columns={contributorFileTypeColumns}
                  data={contributorFileTypes}
                  emptyLabel="No contributor file-type focus data."
                  onRowClick={(row) => setSelectedContributorId(row.contributorId)}
                  rowClassName={(row) =>
                    row.contributorId === selectedContributorId ? "bg-muted/80" : ""
                  }
                />
              </section>
              {selectedContributor ? (
                <ContributorDetail
                  contributor={selectedContributor}
                  activity={selectedContributorActivity}
                  fileTypes={selectedContributorFileTypes}
                  totalNetLines={totalNetLines}
                  loading={
                    contributorActivityQuery.isLoading ||
                    contributorLeaderboardQuery.isLoading ||
                    selectedContributorFileTypesQuery.isLoading
                  }
                  onClose={() => setSelectedContributorId(null)}
                />
              ) : null}
            </Tabs.Content>

            <Tabs.Content
              value="branches"
              className="grid gap-3 data-[state=inactive]:hidden"
            >
              <SectionTitle
                title="Branches"
                subtitle={
                  selectedRepository
                    ? `${selectedRepository.name} · time source ${branchesQuery.data?.branchTimeSource ?? "headCommit"}`
                    : `${repositories.length} repositories · all branches`
                }
              />
              {projectBranchesQuery.isError && selectedRepoId === "all" ? <ErrorBanner error={projectBranchesQuery.error} /> : null}
              {branchesQuery.isError && selectedRepoId !== "all" ? <ErrorBanner error={branchesQuery.error} /> : null}
              {selectedRepoId === "all" && projectBranchesQuery.isLoading ? <LoadingBlock /> : null}
              <DataTable
                columns={branchColumns}
                data={branches}
                emptyLabel="No branch data available."
              />
              {selectedRepoId === "all" && <ProjectPager page={branchPage} total={projectBranchesQuery.data?.total ?? 0} pageSize={200} onPage={setBranchPage} />}
              <BranchComparisonPanel
                repositoryId={selectedRepoId === "all" ? null : selectedRepoId}
                branches={branches}
              />
            </Tabs.Content>

            <Tabs.Content
              value="pull-requests"
              className="grid gap-3 data-[state=inactive]:hidden"
            >
              <SectionTitle
                title="Pull requests"
                subtitle={selectedRepository ? selectedRepository.name : `${repositories.length} repositories · all pull requests`}
              />
              {projectPullRequestsQuery.isError && selectedRepoId === "all" ? <ErrorBanner error={projectPullRequestsQuery.error} /> : null}
              {pullRequestsQuery.isError && selectedRepoId !== "all" ? <ErrorBanner error={pullRequestsQuery.error} /> : null}
              {selectedRepoId === "all" && projectPullRequestsQuery.isLoading ? <LoadingBlock /> : null}
              {providerState && !providerState.available && providerState.reason !== "unsupported_provider" ? (
                <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-panel p-4 text-sm shadow-panel">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>
                    <div className="font-medium">GitHub metadata degraded</div>
                    <div className="text-muted-foreground">{providerState.message}</div>
                  </div>
                </div>
              ) : null}
              <DataTable
                columns={pullRequestColumns}
                data={pullRequests}
                emptyLabel="No pull request metadata available."
              />
              {selectedRepoId === "all" && <ProjectPager page={prPage} total={projectPullRequestsQuery.data?.total ?? 0} pageSize={200} onPage={setPrPage} />}
            </Tabs.Content>
          </Tabs.Root>
        )}
      </div>
    </main>
  );
}

function buildLeaderboardColumns(
  totalNetLines: number
): Array<ColumnDef<ContributorLeaderboardRow>> {
  return [
    { accessorKey: "displayName", header: "Contributor" },
    {
      accessorKey: "commits",
      header: "Commits",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      accessorKey: "insertions",
      header: "Ins",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      accessorKey: "deletions",
      header: "Del",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      accessorKey: "netLines",
      header: "Net",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      id: "netPercent",
      accessorFn: (row) => calculateNetPercent(row.insertions, row.deletions),
      header: "Net %",
      cell: ({ getValue }) => formatPercent(getValue<number>())
    },
    {
      id: "netShare",
      accessorFn: (row) => calculateShareOfNet(row.netLines, totalNetLines),
      header: "Share of NET",
      cell: ({ getValue }) => formatPercent(getValue<number>())
    },
    {
      accessorKey: "lastActivity",
      header: "Last",
      cell: ({ getValue }) => formatDate(getValue<string | null>())
    }
  ];
}

function buildRepositoryColumns(totalNetLines: number): Array<ColumnDef<RepositoryComparisonRow>> {
  return [
    { accessorKey: "repositoryName", header: "Repository" },
    {
      accessorKey: "commits",
      header: "Commits",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      accessorKey: "contributors",
      header: "Contributors",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      accessorKey: "insertions",
      header: "Ins",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      accessorKey: "deletions",
      header: "Del",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      id: "netLines",
      accessorFn: (row) => row.insertions - row.deletions,
      header: "Net",
      cell: ({ getValue }) => formatNumber(getValue<number>())
    },
    {
      id: "netPercent",
      accessorFn: (row) => calculateNetPercent(row.insertions, row.deletions),
      header: "Net %",
      cell: ({ getValue }) => formatPercent(getValue<number>())
    },
    {
      id: "netShare",
      accessorFn: (row) => calculateShareOfNet(row.insertions - row.deletions, totalNetLines),
      header: "Share of NET",
      cell: ({ getValue }) => formatPercent(getValue<number>())
    },
    {
      accessorKey: "lastActivity",
      header: "Last",
      cell: ({ getValue }) => formatDate(getValue<string | null>())
    }
  ];
}

const fileTypeColumns: Array<ColumnDef<FileTypeAnalyticsRow>> = [
  {
    accessorKey: "extension",
    header: "Type",
    cell: ({ getValue }) => fileTypeLabel(getValue<string | null>())
  },
  {
    accessorKey: "fileCount",
    header: "Files",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "lineCount",
    header: "Lines",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "touchedFiles",
    header: "Touched",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "insertions",
    header: "Ins",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "deletions",
    header: "Del",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "netLines",
    header: "Net",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "churn",
    header: "Churn",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "contributors",
    header: "People",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  }
];

const hotFileColumns: Array<ColumnDef<HotFileAnalyticsRow>> = [
  {
    accessorKey: "path",
    header: "File",
    cell: ({ row }) => `${row.original.repositoryName}/${row.original.path}`
  },
  {
    accessorKey: "extension",
    header: "Type",
    cell: ({ getValue }) => fileTypeLabel(getValue<string | null>())
  },
  {
    accessorKey: "currentLines",
    header: "Lines",
    cell: ({ getValue }) => formatNullableNumber(getValue<number | null>())
  },
  {
    accessorKey: "insertions",
    header: "Ins",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "deletions",
    header: "Del",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "netLines",
    header: "Net",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "churn",
    header: "Churn",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "contributors",
    header: "People",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "lastActivity",
    header: "Last",
    cell: ({ getValue }) => formatDate(getValue<string | null>())
  }
];

const contributorFileTypeColumns: Array<ColumnDef<ContributorFileTypeRow>> = [
  { accessorKey: "displayName", header: "Contributor" },
  {
    accessorKey: "extension",
    header: "Type",
    cell: ({ getValue }) => fileTypeLabel(getValue<string | null>())
  },
  {
    accessorKey: "commits",
    header: "Commits",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "touchedFiles",
    header: "Files",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "insertions",
    header: "Ins",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "deletions",
    header: "Del",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "netLines",
    header: "Net",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "churn",
    header: "Churn",
    cell: ({ getValue }) => formatNumber(getValue<number>())
  },
  {
    accessorKey: "shareOfContributorChurn",
    header: "Focus",
    cell: ({ getValue }) => formatPercent(getValue<number>())
  }
];

const branchColumns: Array<ColumnDef<ProjectBranch>> = [
  { accessorKey: "repositoryName", header: "Repository" },
  { accessorKey: "name", header: "Branch" },
  {
    accessorKey: "remote",
    header: "Remote",
    cell: ({ getValue }) => getValue<string | null>() ?? "local"
  },
  {
    accessorKey: "isDefault",
    header: "Default",
    cell: ({ getValue }) => (getValue<boolean>() ? "Yes" : "")
  },
  {
    accessorKey: "lastCommitAt",
    header: "Last commit",
    cell: ({ getValue }) => formatDate(getValue<string | null>())
  },
  { accessorKey: "branchTimeSource", header: "Time source" }
];

const pullRequestColumns: Array<ColumnDef<ProjectPullRequest>> = [
  { accessorKey: "repositoryName", header: "Repository" },
  { accessorKey: "number", header: "#", cell: ({ getValue }) => `#${getValue<number>()}` },
  { accessorKey: "title", header: "Title" },
  { accessorKey: "state", header: "State" },
  {
    accessorKey: "authorLogin",
    header: "Author",
    cell: ({ getValue }) => getValue<string | null>() ?? ""
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ getValue }) => formatDate(getValue<string>())
  },
  {
    accessorKey: "mergedAt",
    header: "Merged",
    cell: ({ getValue }) => formatDate(getValue<string | null>())
  }
];

function ProjectPager({ page, total, pageSize, onPage }: {
  page: number; total: number; pageSize: number; onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Project results pages" className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">{total.toLocaleString()} entries · page {page + 1} / {pages}</span>
      <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}
        className="h-9 rounded border border-border bg-panel px-3 disabled:opacity-40">Previous</button>
      <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}
        className="h-9 rounded border border-border bg-panel px-3 disabled:opacity-40">Next</button>
    </nav>
  );
}

function ContributorDetail({
  contributor,
  activity,
  fileTypes,
  totalNetLines,
  loading,
  onClose
}: {
  contributor: ContributorLeaderboardRow;
  activity: ActivityBucket[];
  fileTypes: ContributorFileTypeRow[];
  totalNetLines: number;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-panel p-4 shadow-panel">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold uppercase tracking-normal">
            {contributor.displayName}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {contributor.primaryEmail ?? "No primary email"}
          </p>
        </div>
        <IconButton label="Close contributor detail" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Commits" value={formatNumber(contributor.commits)} />
        <MetricTile
          label="Net %"
          value={formatPercent(calculateNetPercent(contributor.insertions, contributor.deletions))}
        />
        <MetricTile
          label="Share of total NET"
          value={formatPercent(calculateShareOfNet(contributor.netLines, totalNetLines))}
        />
        <MetricTile label="Insertions" value={formatNumber(contributor.insertions)} />
        <MetricTile label="Deletions" value={formatNumber(contributor.deletions)} />
        <MetricTile label="Net lines" value={formatNumber(contributor.netLines)} />
        <MetricTile label="Files changed" value={formatNumber(contributor.filesChanged)} />
        <MetricTile label="First activity" value={formatDate(contributor.firstActivity)} />
        <MetricTile label="Last activity" value={formatDate(contributor.lastActivity)} />
      </div>
      <div className="mt-4">
        <SectionTitle
          title="Contributor NET over time"
          subtitle={`${activity.length} active days`}
        />
        {loading ? (
          <LoadingBlock />
        ) : activity.length > 0 ? (
          <ActivityChart data={activity} />
        ) : (
          <EmptyBlock label="No contributor activity in this scope." />
        )}
      </div>
      <div className="mt-4">
        <SectionTitle title="File type focus" subtitle="Selected scope" />
        {loading ? (
          <LoadingBlock />
        ) : fileTypes.length > 0 ? (
          <ContributorFocusList items={fileTypes.slice(0, 8)} />
        ) : (
          <EmptyBlock label="No file type focus in this scope." />
        )}
      </div>
    </div>
  );
}

function ContributorFocusList({ items }: { items: ContributorFileTypeRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border text-sm">
      {items.map((item) => (
        <div
          key={`${item.contributorId}-${item.extension ?? "none"}`}
          className="grid grid-cols-[minmax(80px,0.8fr)_repeat(4,minmax(58px,1fr))] gap-2 border-t border-border px-3 py-2 first:border-t-0"
        >
          <span className="truncate font-medium">{fileTypeLabel(item.extension)}</span>
          <span className="truncate text-muted-foreground">
            Ins {formatNumber(item.insertions)}
          </span>
          <span className="truncate text-muted-foreground">Del {formatNumber(item.deletions)}</span>
          <span className="truncate text-muted-foreground">Net {formatNumber(item.netLines)}</span>
          <span className="truncate text-muted-foreground">
            {formatPercent(item.shareOfContributorChurn)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="truncate text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

interface RepositoryBranchSetting {
  repository: Repository;
  branchItems: Array<{ value: string; label: string }>;
}

function toRepositoryBranchSetting(
  repository: Repository,
  branches: Branch[]
): RepositoryBranchSetting {
  const names = new Set(branches.map((branch) => branch.name).filter(Boolean));
  if (repository.defaultBranch) {
    names.add(repository.defaultBranch);
  }

  return {
    repository,
    branchItems: [...names]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({
        value: name,
        label: name
      }))
  };
}

function BranchViewControls({
  activeViewId,
  views,
  branchSettings,
  selection,
  folderFilters,
  pending,
  error,
  onViewChange,
  onOpenEditor,
  onSave,
  onUpdate,
  onDuplicate,
  onRename,
  onDelete
}: {
  activeViewId: string;
  views: BranchView[];
  branchSettings: RepositoryBranchSetting[];
  selection: BranchSelectionState;
  folderFilters: FolderFilterState;
  pending: boolean;
  error: Error | null;
  onViewChange: (viewId: string) => void;
  onOpenEditor: () => void;
  onSave: () => void;
  onUpdate: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const isCustom = activeViewId === "custom";
  const selectedCount = countSelectedBranches(selection);
  const folderFilterCount = countFolderFilters(folderFilters);
  return (
    <div className="grid gap-2 rounded-md border border-border bg-background p-2 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
      <SelectBox
        value={activeViewId}
        placeholder="Branch view"
        onValueChange={onViewChange}
        items={[
          { value: "custom", label: "Custom" },
          ...views.map((view) => ({ value: view.id, label: view.name }))
        ]}
      />
      <button
        type="button"
        className="flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-panel px-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        disabled={branchSettings.length === 0}
        onClick={onOpenEditor}
      >
        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
        <BranchSelectionSummary
          branchSettings={branchSettings}
          selection={selection}
          folderFilters={folderFilters}
        />
      </button>
      <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
        {isCustom ? (
          <TooltipIconButton
            label="Save view"
            variant="primary"
            disabled={pending || selectedCount === 0}
            onClick={onSave}
          >
            <Save className="h-4 w-4" />
          </TooltipIconButton>
        ) : (
          <>
            <TooltipIconButton
              label="Update view"
              variant="primary"
              disabled={pending || selectedCount === 0}
              onClick={onUpdate}
            >
              <Save className="h-4 w-4" />
            </TooltipIconButton>
            <TooltipIconButton
              label="Duplicate"
              disabled={pending || selectedCount === 0}
              onClick={onDuplicate}
            >
              <Copy className="h-4 w-4" />
            </TooltipIconButton>
            <TooltipIconButton label="Rename" disabled={pending} onClick={onRename}>
              <Pencil className="h-4 w-4" />
            </TooltipIconButton>
            <TooltipIconButton
              label="Delete"
              variant="danger"
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </TooltipIconButton>
          </>
        )}
        <span className="truncate text-xs text-muted-foreground">
          {formatNumber(selectedCount)} branches / {formatNumber(folderFilterCount)} folders
        </span>
      </div>
      {error ? (
        <div className="xl:col-span-3">
          <InlineError error={error} />
        </div>
      ) : null}
    </div>
  );
}

function BranchSelectionSummary({
  branchSettings,
  selection,
  folderFilters
}: {
  branchSettings: RepositoryBranchSetting[];
  selection: BranchSelectionState;
  folderFilters: FolderFilterState;
}) {
  const rows = branchSettings
    .map(({ repository }) => ({
      repository,
      branches: selection[repository.id] ?? [],
      folderFilter: folderFilters[repository.id]
    }))
    .filter(
      (row) =>
        row.branches.length > 0 ||
        (row.folderFilter &&
          row.folderFilter.mode !== "all" &&
          row.folderFilter.paths.length > 0)
    );

  if (rows.length === 0) {
    return <span className="min-w-0 truncate text-muted-foreground">No view filters selected</span>;
  }

  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {rows.map(({ repository, branches, folderFilter }) => (
        <span
          key={repository.id}
          className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 text-xs"
        >
          <span className="truncate font-medium">{repository.name}</span>
          <span className="text-muted-foreground">:</span>
          <span className="truncate text-muted-foreground">
            {branches.length > 0 ? branches.join(", ") : "no branches"}
            {folderFilter && folderFilter.mode !== "all" && folderFilter.paths.length > 0
              ? ` / ${folderFilter.mode} ${folderFilter.paths.join(", ")}`
              : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

function BranchSelectionDialog({
  open,
  onOpenChange,
  branchSettings,
  selection,
  folderFilters,
  onToggleBranch,
  onFolderModeChange,
  onFolderPathsChange,
  onUseConfigured,
  onUseVisibleAll,
  onClearVisible
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchSettings: RepositoryBranchSetting[];
  selection: BranchSelectionState;
  folderFilters: FolderFilterState;
  onToggleBranch: (repoId: string, branchName: string) => void;
  onFolderModeChange: (repoId: string, mode: FolderFilterState[string]["mode"]) => void;
  onFolderPathsChange: (repoId: string, value: string) => void;
  onUseConfigured: () => void;
  onUseVisibleAll: () => void;
  onClearVisible: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 rounded-md border border-border bg-panel p-5 shadow-xl">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Dialog.Title className="truncate text-base font-semibold">
              View filters
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onUseConfigured}
              className="h-8 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
            >
              Configured
            </button>
            <button
              type="button"
              onClick={onUseVisibleAll}
              className="h-8 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
            >
              All visible
            </button>
            <button
              type="button"
              onClick={onClearVisible}
              className="h-8 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
            >
              Clear
            </button>
            <span className="truncate text-xs text-muted-foreground">
              {formatNumber(countSelectedBranches(selection))} branches /{" "}
              {formatNumber(countFolderFilters(folderFilters))} folder filters
            </span>
          </div>
          <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {branchSettings.length > 0 ? (
              branchSettings.map(({ repository, branchItems }) => (
                <div
                  key={repository.id}
                  className="grid min-w-0 content-start gap-2 rounded-md border border-border p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{repository.name}</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Branches
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {branchItems.length > 0 ? (
                      branchItems.map((branch) => {
                        const checked = selection[repository.id]?.includes(branch.value) ?? false;
                        return (
                          <label
                            key={`${repository.id}-${branch.value}`}
                            className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-border px-2 text-xs hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-current"
                              checked={checked}
                              onChange={() => onToggleBranch(repository.id, branch.value)}
                            />
                            <span className="truncate">{branch.label}</span>
                          </label>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">No branches</span>
                    )}
                  </div>
                  <RepositoryFolderFilterEditor
                    repositoryId={repository.id}
                    value={folderFilters[repository.id] ?? { mode: "all", paths: [] }}
                    onModeChange={onFolderModeChange}
                    onPathsChange={onFolderPathsChange}
                  />
                </div>
              ))
            ) : (
              <div className="grid min-h-24 content-center rounded-md border border-border text-center text-sm text-muted-foreground md:col-span-2">
                No repositories
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background"
              >
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RepositoryFolderFilterEditor({
  repositoryId,
  value,
  onModeChange,
  onPathsChange
}: {
  repositoryId: string;
  value: FolderFilterState[string];
  onModeChange: (repoId: string, mode: FolderFilterState[string]["mode"]) => void;
  onPathsChange: (repoId: string, value: string) => void;
}) {
  const pathText = value.paths.join("\n");
  const disabled = value.mode === "all";

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium uppercase text-muted-foreground">Folders</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
        <SelectBox
          value={value.mode}
          placeholder="Folder mode"
          onValueChange={(mode) =>
            onModeChange(repositoryId, mode as FolderFilterState[string]["mode"])
          }
          items={[
            { value: "all", label: "All folders" },
            { value: "include", label: "Only paths" },
            { value: "exclude", label: "Exclude paths" }
          ]}
        />
        <textarea
          value={pathText}
          disabled={disabled}
          rows={3}
          placeholder={"src\napps/web"}
          onChange={(event) => onPathsChange(repositoryId, event.target.value)}
          className="min-h-20 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function BranchViewNameDialog({
  state,
  pending,
  error,
  onOpenChange,
  onSubmit
}: {
  state: BranchViewNameDialogState | null;
  pending: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(state?.initialName ?? "");

  useEffect(() => {
    setName(state?.initialName ?? "");
  }, [state]);

  const title =
    state?.mode === "rename"
      ? "Rename branch view"
      : state?.mode === "duplicate"
        ? "Duplicate branch view"
        : "Save branch view";
  const submitLabel =
    state?.mode === "rename" ? "Rename" : state?.mode === "duplicate" ? "Duplicate" : "Save view";
  const submitName = () => {
    const trimmedName = name.trim();
    if (trimmedName) {
      onSubmit(trimmedName);
    }
  };

  return (
    <Dialog.Root open={Boolean(state)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-panel p-5 shadow-xl">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Dialog.Title className="truncate text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitName();
            }}
          >
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-muted-foreground">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
                autoFocus
              />
            </label>
            {error ? <InlineError error={error} /> : null}
            <button
              type="button"
              className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || name.trim().length === 0}
              onClick={submitName}
            >
              {submitLabel}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BranchViewDeleteDialog({
  candidate,
  pending,
  error,
  onOpenChange,
  onConfirm
}: {
  candidate: { id: string; name: string } | null;
  pending: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (viewId: string) => void;
}) {
  return (
    <Dialog.Root open={Boolean(candidate)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-panel p-5 shadow-xl">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-danger/10 text-danger">
              <Trash2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold">
                Delete branch view
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                This removes the saved view "{candidate?.name ?? ""}". Repository data and analytics
                stay unchanged.
              </Dialog.Description>
            </div>
          </div>
          {error ? <InlineError error={error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
                disabled={pending}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-danger px-3 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || !candidate}
              onClick={() => {
                if (candidate) {
                  onConfirm(candidate.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete view
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getVisibleBranchSettings(
  items: RepositoryBranchSetting[],
  selectedRepoId: string
): RepositoryBranchSetting[] {
  if (selectedRepoId === "all") {
    return items;
  }
  return items.filter((item) => item.repository.id === selectedRepoId);
}

function upsertBranchViewResponse(
  data: { items: BranchView[] } | undefined,
  view: BranchView
): { items: BranchView[] } {
  const items = data?.items ?? [];
  const exists = items.some((item) => item.id === view.id);
  const nextItems = exists
    ? items.map((item) => (item.id === view.id ? view : item))
    : [view, ...items];
  return {
    items: nextItems.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  };
}

function removeBranchViewResponse(
  data: { items: BranchView[] } | undefined,
  viewId: string
): { items: BranchView[] } {
  return {
    items: (data?.items ?? []).filter((item) => item.id !== viewId)
  };
}

function serializeBranchSelection(selection: BranchSelectionState): string[] {
  return Object.entries(selection)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([repoId, branches]) =>
      [...branches]
        .sort((left, right) => left.localeCompare(right))
        .map((branchName) => `${repoId}:${branchName}`)
    );
}

function deserializeBranchSelection(values: string[]): BranchSelectionState {
  const selection: BranchSelectionState = {};
  for (const value of values) {
    const separatorIndex = value.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      continue;
    }
    const repoId = value.slice(0, separatorIndex);
    const branchName = value.slice(separatorIndex + 1);
    const currentBranches = selection[repoId] ?? [];
    if (!currentBranches.includes(branchName)) {
      selection[repoId] = [...currentBranches, branchName].sort((left, right) =>
        left.localeCompare(right)
      );
    }
  }
  return selection;
}

function serializeFolderFiltersForStorage(selection: FolderFilterState): RepositoryFolderFilter[] {
  return Object.entries(selection)
    .map(([repositoryId, filter]) => ({
      repositoryId,
      mode: filter.mode,
      paths: normalizeFolderPaths(filter.paths)
    }))
    .filter(
      (filter): filter is RepositoryFolderFilter =>
        filter.mode !== "all" && filter.paths.length > 0
    )
    .sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
}

function serializeFolderFiltersForQuery(selection: FolderFilterState): string[] {
  return serializeFolderFiltersForStorage(selection).flatMap((filter) =>
    filter.paths.map((folderPath) => `${filter.repositoryId}:${filter.mode}:${folderPath}`)
  );
}

function deserializeFolderFilters(values: RepositoryFolderFilter[]): FolderFilterState {
  const selection: FolderFilterState = {};
  for (const filter of values) {
    const paths = normalizeFolderPaths(filter.paths);
    if (paths.length === 0) {
      continue;
    }
    selection[filter.repositoryId] = {
      mode: filter.mode,
      paths
    };
  }
  return selection;
}

function countFolderFilters(selection: FolderFilterState): number {
  return serializeFolderFiltersForStorage(selection).reduce(
    (sum, filter) => sum + filter.paths.length,
    0
  );
}

function updateFolderFilterMode(
  selection: FolderFilterState,
  repoId: string,
  mode: FolderFilterState[string]["mode"]
): FolderFilterState {
  const nextSelection = { ...selection };
  if (mode === "all") {
    delete nextSelection[repoId];
    return nextSelection;
  }
  nextSelection[repoId] = {
    mode,
    paths: selection[repoId]?.paths ?? []
  };
  return nextSelection;
}

function updateFolderFilterPaths(
  selection: FolderFilterState,
  repoId: string,
  value: string
): FolderFilterState {
  const paths = normalizeFolderPathText(value);
  const current = selection[repoId] ?? { mode: "include", paths: [] };
  const nextSelection = { ...selection };
  if (current.mode === "all" || paths.length === 0) {
    if (paths.length === 0) {
      delete nextSelection[repoId];
      return nextSelection;
    }
    nextSelection[repoId] = { mode: "include", paths };
    return nextSelection;
  }
  nextSelection[repoId] = { ...current, paths };
  return nextSelection;
}

function normalizeFolderPathText(value: string): string[] {
  return normalizeFolderPaths(value.split(/[\n,]+/));
}

function normalizeFolderPaths(values: string[]): string[] {
  return [...new Set(values.map(normalizeFolderPath).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function normalizeFolderPath(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function countSelectedBranches(selection: BranchSelectionState): number {
  return Object.values(selection).reduce((sum, branches) => sum + branches.length, 0);
}

function toggleBranchSelection(
  selection: BranchSelectionState,
  repoId: string,
  branchName: string
): BranchSelectionState {
  const currentBranches = selection[repoId] ?? [];
  const nextBranches = currentBranches.includes(branchName)
    ? currentBranches.filter((item) => item !== branchName)
    : [...currentBranches, branchName].sort((left, right) => left.localeCompare(right));
  const nextSelection = { ...selection };
  if (nextBranches.length === 0) {
    delete nextSelection[repoId];
  } else {
    nextSelection[repoId] = nextBranches;
  }
  return nextSelection;
}

function buildConfiguredBranchSelection(
  items: RepositoryBranchSetting[],
  selectedRepoId: string
): BranchSelectionState {
  const selection: BranchSelectionState = {};
  for (const { repository } of getVisibleBranchSettings(items, selectedRepoId)) {
    if (repository.defaultBranch) {
      selection[repository.id] = [repository.defaultBranch];
    }
  }
  return selection;
}

function selectConfiguredVisibleBranches(
  selection: BranchSelectionState,
  items: RepositoryBranchSetting[],
  selectedRepoId: string
): BranchSelectionState {
  const nextSelection = { ...selection };
  for (const { repository } of getVisibleBranchSettings(items, selectedRepoId)) {
    if (repository.defaultBranch) {
      nextSelection[repository.id] = [repository.defaultBranch];
    } else {
      delete nextSelection[repository.id];
    }
  }
  return nextSelection;
}

function selectAllVisibleBranches(
  selection: BranchSelectionState,
  items: RepositoryBranchSetting[],
  selectedRepoId: string
): BranchSelectionState {
  const nextSelection = { ...selection };
  for (const { repository, branchItems } of getVisibleBranchSettings(items, selectedRepoId)) {
    nextSelection[repository.id] = branchItems.map((branch) => branch.value);
  }
  return nextSelection;
}

function clearVisibleBranches(
  selection: BranchSelectionState,
  items: RepositoryBranchSetting[],
  selectedRepoId: string
): BranchSelectionState {
  const nextSelection = { ...selection };
  for (const { repository } of getVisibleBranchSettings(items, selectedRepoId)) {
    delete nextSelection[repository.id];
  }
  return nextSelection;
}

function ProjectDialog({
  open,
  onOpenChange,
  pending,
  error,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: Error | null;
  onSubmit: (input: { name: string; description?: string | null }) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground">
          <Plus className="h-4 w-4" />
          Project
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 grid w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-panel p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold">Create project</Dialog.Title>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onSubmit({
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? "") || null
              });
            }}
          >
            <TextField name="name" label="Name" required />
            <TextField name="description" label="Description" />
            {error ? <InlineError error={error} /> : null}
            <button
              className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background"
              disabled={pending}
            >
              Create
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RepositoryDialog({
  open,
  onOpenChange,
  disabled,
  pending,
  error,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  pending: boolean;
  error: Error | null;
  onSubmit: (input: { input: string; name?: string }) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-panel px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
          Repository
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 grid w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-panel p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold">Add repository</Dialog.Title>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get("name") ?? "");
              onSubmit({
                input: String(form.get("input") ?? ""),
                name: name || undefined
              });
            }}
          >
            <TextField name="input" label="URL, owner/name, or local path" required />
            <TextField name="name" label="Display name" />
            {error ? <InlineError error={error} /> : null}
            <button
              className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background"
              disabled={pending}
            >
              Add
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type DateRangePreset =
  | "all"
  | "month"
  | "previous-month"
  | "week"
  | "previous-week"
  | "today"
  | "yesterday"
  | "custom";

const dateRangePresetItems: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "previous-month", label: "Previous month" },
  { value: "week", label: "This week" },
  { value: "previous-week", label: "Previous week" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "custom", label: "Custom" }
];

function DateRangeControls({
  preset,
  monthCursor,
  from,
  to,
  onPresetChange,
  onMonthShift,
  onFromChange,
  onToChange
}: {
  preset: DateRangePreset;
  monthCursor: Date;
  from: string;
  to: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onMonthShift: (offset: number) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-2 sm:grid-cols-[minmax(140px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.2fr)] xl:border-0 xl:bg-transparent xl:p-0">
      <SelectBox
        value={preset}
        placeholder="Date range"
        onValueChange={(value) => onPresetChange(value as DateRangePreset)}
        items={dateRangePresetItems}
      />
      <div className="grid h-9 grid-cols-[36px_minmax(0,1fr)_36px] overflow-hidden rounded-md border border-border bg-background">
        <button
          type="button"
          aria-label="Previous month"
          title="Previous month"
          className="grid place-items-center border-r border-border text-muted-foreground hover:bg-muted"
          onClick={() => onMonthShift(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="grid min-w-0 place-items-center px-2 text-sm font-medium">
          <span className="truncate">{formatMonthLabel(monthCursor)}</span>
        </div>
        <button
          type="button"
          aria-label="Next month"
          title="Next month"
          className="grid place-items-center border-l border-border text-muted-foreground hover:bg-muted"
          onClick={() => onMonthShift(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <DateField value={from} onChange={onFromChange} label="From" />
        <DateField value={to} onChange={onToChange} label="To" />
      </div>
    </div>
  );
}

function SelectBox({
  value,
  items,
  placeholder,
  disabled,
  onValueChange
}: {
  value: string;
  items: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger className="flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50">
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 max-h-80 overflow-hidden rounded-md border border-border bg-panel shadow-lg">
          <Select.Viewport className="p-1">
            {items.map((item) => (
              <Select.Item
                key={item.value}
                value={item.value}
                className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <Select.ItemText>{item.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function DateField({
  value,
  label,
  onChange
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex h-9 min-w-0 items-center rounded-md border border-border bg-background">
      <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      <span className="sr-only">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full min-w-0 rounded-md bg-transparent pl-9 pr-2 text-sm outline-none"
      />
    </label>
  );
}

function TextField({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        required={required}
        className="h-9 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
      />
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-panel text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function TooltipIconButton({
  label,
  variant = "default",
  disabled,
  onClick,
  children
}: {
  label: string;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const variantClass =
    variant === "primary"
      ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
      : variant === "danger"
        ? "border-danger/50 text-danger hover:bg-danger/10"
        : "border-border text-foreground hover:bg-muted";

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={`grid h-9 w-9 place-items-center rounded-md border bg-background transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClass}`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg group-hover:block group-focus-within:block">
        {label}
      </span>
    </span>
  );
}

function TabTrigger({
  value,
  icon,
  label
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded px-3 text-sm text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
    >
      {icon}
      {label}
    </Tabs.Trigger>
  );
}

function KpiStrip({
  items,
  loading
}: {
  items: Array<{ label: string; value: number | string }>;
  loading: boolean;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-border bg-panel p-4 shadow-panel">
          <div className="text-xs uppercase text-muted-foreground">{item.label}</div>
          <div className="mt-2 text-2xl font-semibold">
            {loading
              ? "..."
              : typeof item.value === "number"
                ? formatNumber(item.value)
                : item.value}
          </div>
        </div>
      ))}
    </section>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
      <h2 className="truncate text-sm font-semibold uppercase tracking-normal text-foreground">
        {title}
      </h2>
      {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function RefreshStatus({ run }: { run: RefreshRun }) {
  const isActive = run.status === "queued" || run.status === "running";
  const progress = calculateRefreshProgress(run);
  const elapsedMs = calculateRefreshElapsedMs(run);
  const remainingLabel = formatRefreshRemaining(run, elapsedMs);
  const statusClass =
    run.status === "failed"
      ? "border-danger/40 bg-danger/5 text-danger"
      : run.status === "succeeded"
        ? "border-success/40 bg-success/5 text-success"
        : "border-accent/40 bg-accent/5 text-accent";
  const Icon = run.status === "failed" ? AlertTriangle : RefreshCw;
  const detailItems = [
    run.currentRepositoryName,
    progress.label,
    remainingLabel,
    `elapsed ${formatDuration(elapsedMs)}`
  ].filter(Boolean);

  return (
    <div
      className={`grid min-w-[min(320px,100%)] max-w-[420px] gap-2 rounded-md border px-3 py-2 text-sm shadow-panel ${statusClass}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={iconClass(isActive)} />
        <span className="shrink-0 font-medium">
          {run.scope === "project" ? "Project refresh" : "Repository refresh"}
        </span>
        <span className="truncate text-muted-foreground">{run.currentStep ?? run.status}</span>
        {progress.percent !== null ? (
          <span className="ml-auto shrink-0 text-xs font-medium tabular-nums">
            {progress.percent}%
          </span>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className={`h-full rounded-full ${
            progress.percent === null
              ? "w-1/2 animate-pulse bg-accent/70"
              : run.status === "failed"
                ? "bg-danger"
                : run.status === "succeeded"
                  ? "bg-success"
                  : "bg-accent"
          }`}
          style={progress.percent === null ? undefined : { width: `${progress.percent}%` }}
        />
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{detailItems.join(" / ")}</span>
      </div>
      {run.errorMessage ? <p className="truncate text-xs text-danger">{run.errorMessage}</p> : null}
    </div>
  );
}

function calculateRefreshProgress(run: RefreshRun): { percent: number | null; label: string } {
  if (run.status === "succeeded") {
    return { percent: 100, label: "done" };
  }

  const total = run.progressTotal;
  const completed = run.progressCompleted;
  if (typeof total === "number" && total > 0 && typeof completed === "number") {
    const boundedCompleted = Math.min(Math.max(completed, 0), total);
    return {
      percent: Math.round((boundedCompleted / total) * 100),
      label:
        run.scope === "project"
          ? `${formatNumber(boundedCompleted)} / ${formatNumber(total)} repositories`
          : `${formatNumber(boundedCompleted)} / ${formatNumber(total)} steps`
    };
  }

  if (typeof total === "number" && total === 0) {
    return { percent: 100, label: "no repositories" };
  }

  return { percent: run.status === "failed" ? 100 : null, label: "working" };
}

function calculateRefreshElapsedMs(run: RefreshRun): number {
  const startedAt = Date.parse(run.startedAt);
  if (!Number.isFinite(startedAt)) {
    return 0;
  }
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  return Math.max(0, (Number.isFinite(finishedAt) ? finishedAt : Date.now()) - startedAt);
}

function formatRefreshRemaining(run: RefreshRun, elapsedMs: number): string | null {
  if (run.status !== "queued" && run.status !== "running") {
    return null;
  }

  const total = run.progressTotal;
  const completed = run.progressCompleted;
  if (
    typeof total !== "number" ||
    total <= 0 ||
    typeof completed !== "number" ||
    completed >= total
  ) {
    return "estimating";
  }
  if (completed <= 0) {
    return "estimating";
  }

  const remainingMs = (elapsedMs / completed) * (total - completed);
  return `~${formatDuration(remainingMs)} left`;
}

function EmptyProjectState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="grid min-h-[420px] content-center justify-items-center gap-4 rounded-md border border-border bg-panel p-8 text-center shadow-panel">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Search className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">No projects yet</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Create a project and attach local repositories for git-only analytics.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground"
      >
        <Plus className="h-4 w-4" />
        Project
      </button>
    </section>
  );
}

function LoadingBlock() {
  return (
    <div className="grid min-h-[260px] content-center justify-items-center text-sm text-muted-foreground">
      Loading
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="grid min-h-[260px] content-center justify-items-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ErrorBanner({ error }: { error: Error }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-danger/40 bg-panel p-4 text-sm shadow-panel">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div>
        <div className="font-medium text-danger">Request failed</div>
        <div className="text-muted-foreground">{error.message}</div>
      </div>
    </div>
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <div className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">
      {error.message}
    </div>
  );
}

interface StoredDateRange {
  preset: DateRangePreset;
  from: string;
  to: string;
  monthCursor: string;
}

function readStoredDateRange(): StoredDateRange | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const candidate = parsed as Partial<StoredDateRange>;
    if (
      !isDateRangePreset(candidate.preset) ||
      !isDateInputOrEmpty(candidate.from) ||
      !isDateInputOrEmpty(candidate.to) ||
      !isDateInput(candidate.monthCursor)
    ) {
      return null;
    }
    return {
      preset: candidate.preset,
      from: candidate.from,
      to: candidate.to,
      monthCursor: candidate.monthCursor
    };
  } catch {
    return null;
  }
}

function storeDateRange(value: StoredDateRange): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A blocked localStorage should not break dashboard filtering.
  }
}

function isDateRangePreset(value: unknown): value is DateRangePreset {
  return typeof value === "string" && dateRangePresetItems.some((item) => item.value === value);
}

function isDateInputOrEmpty(value: unknown): value is string {
  return value === "" || isDateInput(value);
}

function isDateInput(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateInput(value: string): Date | null {
  if (!isDateInput(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function resolveDatePreset(
  preset: DateRangePreset,
  now: Date
): { from: string; to: string; monthCursor: Date } {
  const today = startOfDay(now);

  if (preset === "all") {
    return { from: "", to: "", monthCursor: startOfMonth(today) };
  }

  if (preset === "month") {
    return { ...monthRange(today), monthCursor: startOfMonth(today) };
  }

  if (preset === "previous-month") {
    const previousMonth = addMonths(today, -1);
    return { ...monthRange(previousMonth), monthCursor: startOfMonth(previousMonth) };
  }

  if (preset === "week") {
    return { ...weekRange(today), monthCursor: startOfMonth(today) };
  }

  if (preset === "previous-week") {
    const previousWeek = addDays(today, -7);
    return { ...weekRange(previousWeek), monthCursor: startOfMonth(previousWeek) };
  }

  if (preset === "today") {
    return {
      from: formatDateInput(today),
      to: formatDateInput(today),
      monthCursor: startOfMonth(today)
    };
  }

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return {
      from: formatDateInput(yesterday),
      to: formatDateInput(yesterday),
      monthCursor: startOfMonth(yesterday)
    };
  }

  return { from: "", to: "", monthCursor: startOfMonth(today) };
}

function monthRange(date: Date): { from: string; to: string } {
  const start = startOfMonth(date);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  return {
    from: formatDateInput(start),
    to: formatDateInput(end)
  };
}

function weekRange(date: Date): { from: string; to: string } {
  const start = startOfWeek(date);
  const end = addDays(start, 6);

  return {
    from: formatDateInput(start),
    to: formatDateInput(end)
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const mondayBasedDay = (start.getDay() + 6) % 7;
  return addDays(start, -mondayBasedDay);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatDuration(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "Unknown" : formatNumber(value);
}

function summarizeFileTypes(items: FileTypeAnalyticsRow[]): {
  files: number;
  lines: number;
  types: number;
  touchedFiles: number;
  churn: number;
  binaryFiles: number;
} {
  return items.reduce(
    (summary, item) => ({
      files: summary.files + item.fileCount,
      lines: summary.lines + item.lineCount,
      types: summary.types + 1,
      touchedFiles: summary.touchedFiles + item.touchedFiles,
      churn: summary.churn + item.churn,
      binaryFiles: summary.binaryFiles + item.binaryFiles
    }),
    {
      files: 0,
      lines: 0,
      types: 0,
      touchedFiles: 0,
      churn: 0,
      binaryFiles: 0
    }
  );
}

function summarizeContributors(items: ContributorLeaderboardRow[]): {
  commits: number;
  churn: number;
  netLines: number;
  topWorkload: string;
  topNet: string;
} {
  const totals = items.reduce(
    (summary, item) => ({
      commits: summary.commits + item.commits,
      churn: summary.churn + item.insertions + item.deletions,
      netLines: summary.netLines + item.netLines
    }),
    { commits: 0, churn: 0, netLines: 0 }
  );
  const topWorkload = [...items].sort(
    (left, right) => right.insertions + right.deletions - (left.insertions + left.deletions)
  )[0];
  const topNet = [...items].sort((left, right) => right.netLines - left.netLines)[0];

  return {
    ...totals,
    topWorkload: topWorkload ? topWorkload.displayName : "None",
    topNet: topNet ? topNet.displayName : "None"
  };
}

function calculateNetPercent(insertions: number, deletions: number): number {
  const churn = insertions + deletions;
  return churn === 0 ? 0 : (insertions - deletions) / churn;
}

function calculateShareOfNet(netLines: number, totalNetLines: number): number {
  return totalNetLines === 0 ? 0 : netLines / totalNetLines;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

function iconClass(spinning: boolean): string {
  return `h-4 w-4 ${spinning ? "animate-spin" : ""}`;
}

function requireSelected(value: string | null): string {
  if (!value) {
    throw new Error("No selection.");
  }

  return value;
}
