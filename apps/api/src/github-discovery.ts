import { isGitHubMetadataAllowed, runProcess } from "@gg/git-engine";

export interface DiscoveredGitHubRepository {
  fullName: string;
  cloneUrl: string;
  isPrivate: boolean;
  archived: boolean;
  pushedAt: string | null;
  defaultBranch: string | null;
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Strict output validation: no token or unexpected URL is passed to Git. */
export function parseDiscoveredRepositories(
  stdout: string, limit = 5000
): DiscoveredGitHubRepository[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error("Invalid GitHub repository discovery limit.");
  }
  const repos = new Map<string, DiscoveredGitHubRepository>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const row: unknown = JSON.parse(line);
    if (!Array.isArray(row) || row.length !== 6) {
      throw new Error("GitHub discovery returned an unexpected metadata record.");
    }
    const [fullName, cloneUrl, isPrivate, archived, pushedAt, defaultBranch] = row;
    if (typeof fullName !== "string" || !REPO.test(fullName) ||
        typeof cloneUrl !== "string" || typeof isPrivate !== "boolean" ||
        typeof archived !== "boolean") {
      throw new Error("GitHub discovery returned invalid repository metadata.");
    }
    const url = new URL(cloneUrl);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port ||
        url.username || url.password || url.search || url.hash ||
        url.pathname.toLowerCase() !== `/${fullName.toLowerCase()}.git`) {
      throw new Error("GitHub discovery returned an unapproved remote URL.");
    }
    repos.set(fullName.toLowerCase(), {
      fullName, cloneUrl,
      isPrivate, archived,
      pushedAt: typeof pushedAt === "string" ? pushedAt : null,
      defaultBranch: typeof defaultBranch === "string" ? defaultBranch : null
    });
    if (repos.size > limit) throw new Error("GitHub discovery exceeded the configured repository limit.");
  }
  return [...repos.values()].sort((left, right) => left.fullName.localeCompare(right.fullName));
}

/**
 * Explicit user-requested metadata enumeration. Does not clone or fetch.
 * Uses gh's existing authentication and never requests/stores its token.
 */
export async function discoverGitHubRepositories(
  limit = 5000
): Promise<DiscoveredGitHubRepository[]> {
  if (!isGitHubMetadataAllowed()) {
    throw new Error("GitHub metadata discovery is disabled. Set GG_ALLOW_GITHUB_METADATA=1 to opt in.");
  }
  const endpoint = "user/repos?per_page=100&visibility=all&affiliation=owner%2Ccollaborator%2Corganization_member";
  const query = ".[] | [.full_name,.clone_url,.private,.archived,.pushed_at,.default_branch] | @json";
  try {
    const result = await runProcess("gh", [
      "api", "--method", "GET", "--paginate", endpoint, "--jq", query
    ], { timeoutMs: 120_000 });
    return parseDiscoveredRepositories(result.stdout, limit);
  } catch {
    throw new Error("GitHub CLI discovery failed; check gh auth status and network permissions.");
  }
}
