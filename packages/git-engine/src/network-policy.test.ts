import { describe, expect, it } from "vitest";
import { isGitHubMetadataAllowed, isRemoteGitAllowed } from "./network-policy";

describe("GG Analytics network policy migration", () => {
  it("continues to respect a historical offline deny after branding", () => {
    const legacy = { GITA_OFFLINE: "1", GG_ALLOW_REMOTE_GIT: "1" };
    expect(isRemoteGitAllowed(legacy, true)).toBe(false);
    expect(isGitHubMetadataAllowed(legacy)).toBe(false);
  });
  it("does not override an explicit historical network denial", () => {
    const legacy = { GG_ALLOW_REMOTE_GIT: "1", GITA_ALLOW_REMOTE_GIT: "0" };
    expect(isRemoteGitAllowed(legacy, true)).toBe(false);
    expect(isRemoteGitAllowed({ GG_OFFLINE: "1" }, true)).toBe(false);
    expect(isGitHubMetadataAllowed({ GITA_ALLOW_GITHUB_METADATA: "0" })).toBe(false);
  });
  it("keeps new opt-in behavior and defaults", () => {
    expect(isRemoteGitAllowed({}, true)).toBe(true);
    expect(isRemoteGitAllowed({}, false)).toBe(false);
    expect(isRemoteGitAllowed({ GG_ALLOW_REMOTE_GIT: "1" }, false)).toBe(true);
    expect(isGitHubMetadataAllowed({})).toBe(true);
  });
});
