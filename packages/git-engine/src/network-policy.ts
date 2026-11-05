/**
 * External network access is denied by default. The GITA_OFFLINE kill-switch
 * overrides individual, explicit opt-ins.
 *
 * This application policy covers Git and the GitHub CLI entrypoints; it is
 * not an operating-system firewall for other processes or build tools.
 */
export function isRemoteGitAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITA_OFFLINE !== "1" && env.GITA_ALLOW_REMOTE_GIT === "1";
}

export function isGitHubMetadataAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITA_OFFLINE !== "1" && env.GITA_ALLOW_GITHUB_METADATA === "1";
}
