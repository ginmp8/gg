import { describe, expect, it } from "vitest";

import { createGitHubAdapter } from "./github";

describe("github adapter degraded behavior", () => {
  it("returns a degraded state when gh is missing", async () => {
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
