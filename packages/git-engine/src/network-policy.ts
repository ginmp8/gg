/**
 * Git remote operations require explicit authorization. A user-triggered
 * repository/project Refresh grants consent only to that refresh; scheduled
 * or arbitrary Git calls do not inherit it.
 *
 * GITA_OFFLINE=1 and GITA_ALLOW_REMOTE_GIT=0 are explicit deny switches.
 * This policy does not replace an OS-level outbound firewall.
 */
export function isRemoteGitAllowed(
  env: NodeJS.ProcessEnv = process.env,
  userInitiatedRefresh = false
): boolean {
  return env.GITA_OFFLINE !== "1"
    && env.GITA_ALLOW_REMOTE_GIT !== "0"
    && (userInitiatedRefresh || env.GITA_ALLOW_REMOTE_GIT === "1");
}

export function isGitHubMetadataAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITA_OFFLINE !== "1" && env.GITA_ALLOW_GITHUB_METADATA === "1";
}
