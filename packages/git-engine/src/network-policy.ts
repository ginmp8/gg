/**
 * Git remote operations require explicit authorization. A user-triggered
 * repository/project Refresh grants consent only to that refresh; scheduled
 * or arbitrary Git calls do not inherit it.
 *
 * GG_OFFLINE=1 and GG_ALLOW_REMOTE_GIT=0 are explicit deny switches.
 * This policy does not replace an OS-level outbound firewall.
 */
export function isRemoteGitAllowed(
  env: NodeJS.ProcessEnv = process.env,
  userInitiatedRefresh = false
): boolean {
  // Legacy explicit denials remain authoritative after the rebrand.
  return env.GG_OFFLINE !== "1" && env.GITA_OFFLINE !== "1"
    && env.GG_ALLOW_REMOTE_GIT !== "0" && env.GITA_ALLOW_REMOTE_GIT !== "0"
    && (userInitiatedRefresh || env.GG_ALLOW_REMOTE_GIT === "1" ||
      env.GITA_ALLOW_REMOTE_GIT === "1");
}

/** Read-only GitHub metadata is enabled by default; explicit offline switches win. */
export function isGitHubMetadataAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GG_OFFLINE !== "1" && env.GITA_OFFLINE !== "1" &&
    env.GG_ALLOW_GITHUB_METADATA !== "0" && env.GITA_ALLOW_GITHUB_METADATA !== "0";
}
