/** Local browser preferences: never sent to GitHub or shared between GG installations. */
export interface ComparisonPreferences {
  year: number;
  tagId: string;
  search: string;
  selections: Record<string, string[]>;
}
export interface DashboardScopePreference {
  projectId: string | null;
  repositoryId: string;
  metric: string;
}
const COMPARISON_KEY = "gg.compareContributors.v1";
const DASHBOARD_SCOPE_KEY = "gg.dashboardScope.v1";

export function currentYearToDate(now: Date): { from: string; to: string } {
  const format = (value: Date) =>
    [String(value.getFullYear()).padStart(4, "0"),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")].join("-");
  return { from: format(new Date(now.getFullYear(), 0, 1)), to: format(now) };
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function fromLocalStorage(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    // Carry forward the user's choices from before the GG Analytics rename.
    const legacyKey = key.replace(/^gg\./, "gita.");
    const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch { return null; }
}
function toLocalStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Browsers with blocked storage must retain usable in-memory controls. */ }
}
function contextKey(projectId: string, repositoryId: string): string {
  return encodeURIComponent(projectId) + ":" + encodeURIComponent(repositoryId);
}
export function defaultComparisonPreferences(year: number): ComparisonPreferences {
  return { year, tagId: "", search: "", selections: {} };
}
export function parseComparisonPreferences(value: unknown, defaultYear: number): ComparisonPreferences {
  const input = object(value);
  const year = Number.isInteger(input?.year) && Number(input?.year) >= 1970 &&
    Number(input?.year) <= 2100 ? Number(input?.year) : defaultYear;
  const raw = object(input?.selections);
  const selections: Record<string, string[]> = {};
  if (raw) for (const [key, values] of Object.entries(raw)) {
    if (!/^(19[7-9]\d|20\d\d|2100)$/.test(key) || !Array.isArray(values)) continue;
    selections[key] = [...new Set(values.filter((entry): entry is string =>
      typeof entry === "string" && entry.length > 0 && entry.length <= 320))];
  }
  return {
    year,
    tagId: typeof input?.tagId === "string" && input.tagId.length < 320 ? input.tagId : "",
    search: typeof input?.search === "string" && input.search.length <= 100 ? input.search : "",
    selections
  };
}
export function readComparisonPreferences(projectId: string, repositoryId: string, year: number): ComparisonPreferences {
  const all = object(fromLocalStorage(COMPARISON_KEY));
  return parseComparisonPreferences(all?.[contextKey(projectId, repositoryId)], year);
}
export function storeComparisonPreferences(
  projectId: string, repositoryId: string, value: ComparisonPreferences
): void {
  const current = object(fromLocalStorage(COMPARISON_KEY)) ?? {};
  toLocalStorage(COMPARISON_KEY, {
    ...current, [contextKey(projectId,repositoryId)]: value
  });
}
/** Select all contributors visible under tag and text filters, or deselect that subset. */
export function toggleAllMatching(current: readonly string[], matches: readonly string[]): string[] {
  const matching = [...new Set(matches)];
  if (matching.length === 0) return [...current];
  const set = new Set(current);
  if (matching.every(email => set.has(email))) {
    const filtered = new Set(matching);
    return current.filter(email => !filtered.has(email));
  }
  return [...current, ...matching.filter(email => !set.has(email))];
}
export function parseDashboardScopePreference(value: unknown): DashboardScopePreference | null {
  const x = object(value);
  if (!x || (x.projectId !== null && typeof x.projectId !== "string") ||
    typeof x.repositoryId !== "string" || !x.repositoryId ||
    typeof x.metric !== "string" || !x.metric) return null;
  return {
    projectId: x.projectId as string | null,
    repositoryId: x.repositoryId,
    metric: x.metric
  };
}
export function readDashboardScopePreference(): DashboardScopePreference | null {
  return parseDashboardScopePreference(fromLocalStorage(DASHBOARD_SCOPE_KEY));
}
export function storeDashboardScopePreference(value: DashboardScopePreference): void {
  toLocalStorage(DASHBOARD_SCOPE_KEY, value);
}
