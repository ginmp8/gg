import { afterEach, describe, expect, it, vi } from "vitest";

import { createGitHubAdapter } from "./github";

afterEach(() => vi.unstubAllEnvs());

describe("github adapter degraded behavior", () => {
  it("does not invoke gh or query PR metadata when explicitly offline", async () => {
    vi.stubEnv("GITA_OFFLINE", "1");
    const runner = vi.fn(async () => {
      throw new Error("The GitHub CLI should not be executed while offline.");
    });
    const adapter = createGitHubAdapter(runner);
    const state = {
      available: false,
      reason: "network_disabled",
      message: "GitHub metadata is disabled by GITA_OFFLINE=1 or GITA_ALLOW_GITHUB_METADATA=0."
    };

    await expect(adapter.getStatus()).resolves.toEqual(state);
    await expect(adapter.fetchPullRequests("example/private")).resolves.toEqual({
      state,
      pullRequests: []
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("the offline kill-switch overrides GitHub metadata consent", async () => {
    vi.stubEnv("GITA_ALLOW_GITHUB_METADATA", "1");
    vi.stubEnv("GITA_OFFLINE", "1");
    const runner = vi.fn(async () => {
      throw new Error("The CLI must not start when GITA_OFFLINE=1.");
    });
    const adapter = createGitHubAdapter(runner);
    await expect(adapter.getStatus()).resolves.toMatchObject({
      available: false,
      reason: "network_disabled"
    });
    expect(runner).not.toHaveBeenCalled();
  });
  it("returns a degraded state when gh is missing", async () => {
    vi.stubEnv("GITA_ALLOW_GITHUB_METADATA", "1");
    const adapter = createGitHubAdapter(async () => {
      const error = new Error("spawn gh ENOENT");
      throw error;
    });

    await expect(adapter.getStatus()).resolves.toEqual({
      available: false,
      reason: "missing_gh",
      message: "GitHub metadata unavailable because the gh CLI is not installed."
    });
  });
});
