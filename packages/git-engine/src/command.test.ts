import { createServer } from "node:net";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { redactSecrets, runGit, runProcess } from "./command";
import { isRemoteGitAllowed, isGitHubMetadataAllowed } from "./network-policy";

afterEach(() => vi.unstubAllEnvs());

describe("network egress controls", () => {
  it("requires explicit operation authorization and honors offline overrides", () => {
    expect(isRemoteGitAllowed()).toBe(false);
    expect(isRemoteGitAllowed(process.env, true)).toBe(true);
    expect(isGitHubMetadataAllowed()).toBe(false);
    vi.stubEnv("GITA_ALLOW_REMOTE_GIT", "true");
    vi.stubEnv("GITA_ALLOW_GITHUB_METADATA", "yes");
    expect(isRemoteGitAllowed()).toBe(false);
    expect(isGitHubMetadataAllowed()).toBe(false);
    vi.stubEnv("GITA_ALLOW_REMOTE_GIT", "1");
    vi.stubEnv("GITA_ALLOW_GITHUB_METADATA", "1");
    expect(isRemoteGitAllowed()).toBe(true);
    expect(isGitHubMetadataAllowed()).toBe(true);
    vi.stubEnv("GITA_OFFLINE", "1");
    expect(isRemoteGitAllowed()).toBe(false);
    expect(isRemoteGitAllowed(process.env, true)).toBe(false);
    expect(isGitHubMetadataAllowed()).toBe(false);
    vi.stubEnv("GITA_OFFLINE", "0");
    vi.stubEnv("GITA_ALLOW_REMOTE_GIT", "0");
    expect(isRemoteGitAllowed(process.env, true)).toBe(false);
  });

  it("does not start GitHub CLI without consent", async () => {
    await expect(runProcess("gh", ["auth", "status"])).rejects.toThrow(
      /GITA_ALLOW_GITHUB_METADATA=1/
    );
  });

  it("does not open an HTTP connection while Git is in offline mode", async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
    });
    await new Promise<void>((resolve, reject) =>
      server.listen(0, "127.0.0.1", resolve).once("error", reject)
    );
    try {
      const address = server.address() as AddressInfo;
      // Only a local, dummy HTTP endpoint is involved in this proof.
      const url = `http://127.0.0.1:${address.port}/dummy.git`;
      await expect(runGit(["-c", "http.proxy=", "ls-remote", url], {
        timeoutMs: 5_000
      })).rejects.toThrow();
      expect(connections).toBe(0);

    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("the offline override denies network transports even with per-refresh consent", async () => {
    vi.stubEnv("GITA_OFFLINE", "1");
    await expect(runGit(["ls-remote", "https://example.invalid/private.git"], {
      timeoutMs: 5_000,
      allowRemoteGit: true
    })).rejects.toMatchObject({
      result: { stderr: expect.stringMatching(/transport 'https' not allowed/i) }
    });
  });

  it("never forwards a future desktop API token to a child process", async () => {
    vi.stubEnv("GITA_DESKTOP_TOKEN", "a".repeat(64));
    const result = await runProcess(process.execPath, [
      "-e",
      "process.stdout.write(process.env.GITA_DESKTOP_TOKEN ?? 'not-inherited')"
    ]);
    expect(result.stdout).toBe("not-inherited");
  });
});

describe("Git diagnostic redaction", () => {
  it("masks credentials inside HTTPS repository URLs", () => {
    const diagnostic =
      "git clone https://user:sample-pass@example.test/repo.git?access_token=sample-token";
    const sanitized = redactSecrets(diagnostic);
    expect(sanitized).toContain("https://***@example.test/repo.git?access_token=***");
    expect(sanitized).not.toContain("sample-pass");
    expect(sanitized).not.toContain("sample-token");
  });

  it("masks common GitHub and GitLab token formats", () => {
    expect(redactSecrets("github_pat_example ghp_example glpat-example"))
      .toBe("*** *** ***");
  });
});
