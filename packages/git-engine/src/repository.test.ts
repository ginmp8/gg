import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeRepository, ensureMirrorRepository, resolveRepositoryInput } from "./repository";

afterEach(() => vi.unstubAllEnvs());

describe("repository analysis", () => {
  it("rejects remote repository refresh before creating a mirror by default", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-offline-"));
    try {
      const mirror = path.join(tmpDir, "private.git");
      await expect(ensureMirrorRepository({
        fetchUrl: "https://example.invalid/private.git",
        cachePath: mirror,
        reposRoot: tmpDir
      })).rejects.toThrow(/GG_ALLOW_REMOTE_GIT=1/);
      expect(fs.existsSync(mirror)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
  it("allows an explicitly requested remote refresh and uses the registered source on repeat fetch", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-remote-consent-"));
    const sourcePath = path.join(tmpDir, "source.git");
    const cachePath = path.join(tmpDir, "mirror.git");
    const params = {
      fetchUrl: pathToFileURL(sourcePath).href,
      cachePath,
      reposRoot: tmpDir
    };
    try {
      git(["init", "--bare", sourcePath]);
      await expect(ensureMirrorRepository(params)).rejects.toThrow(/Remote Git access is disabled/);
      expect(fs.existsSync(cachePath)).toBe(false);

      const first = await ensureMirrorRepository({ ...params, userInitiated: true });
      expect(first.operation).toBe("clone");

      // A modified cache must never redirect a user-authorized refresh to a
      // different network endpoint; the registered URL takes precedence.
      const foreignOrigin = "https://untrusted.example/other.git";
      git(["-C", cachePath, "remote", "set-url", "origin", foreignOrigin]);
      const repeated = await ensureMirrorRepository({ ...params, userInitiated: true });
      expect(repeated.operation).toBe("fetch");
      expect(
        execFileSync("git", ["-C", cachePath, "remote", "get-url", "origin"], { encoding: "utf8" }).trim()
      ).toBe(foreignOrigin);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("the explicit offline switch blocks even a requested remote refresh", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-forced-offline-"));
    try {
      vi.stubEnv("GG_OFFLINE", "1");
      const cachePath = path.join(tmpDir, "mirror.git");
      await expect(ensureMirrorRepository({
        fetchUrl: "https://example.invalid/private.git",
        cachePath,
        reposRoot: tmpDir,
        userInitiated: true
      })).rejects.toThrow(/Remote Git access is disabled/);
      expect(fs.existsSync(cachePath)).toBe(false);

      vi.stubEnv("GG_OFFLINE", "0");
      vi.stubEnv("GG_ALLOW_REMOTE_GIT", "0");
      await expect(ensureMirrorRepository({
        fetchUrl: "https://example.invalid/private.git",
        cachePath,
        reposRoot: tmpDir,
        userInitiated: true
      })).rejects.toThrow(/Remote Git access is disabled/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects embedded HTTPS credentials unless deliberately enabled", () => {
    const previous = process.env.GG_ALLOW_URL_CREDENTIALS;
    delete process.env.GG_ALLOW_URL_CREDENTIALS;
    try {
      expect(() => resolveRepositoryInput("https://user:sample-pass@example.test/org/repo.git"))
        .toThrow(/embedded credentials/);
      expect(() => resolveRepositoryInput("https://example.test/org/repo.git?access_token=sample-token"))
        .toThrow(/embedded credentials/);
      expect(resolveRepositoryInput("https://example.test/org/repo.git").fetchUrl)
        .toBe("https://example.test/org/repo.git");
      process.env.GG_ALLOW_URL_CREDENTIALS = "1";
      expect(resolveRepositoryInput("https://user:sample-pass@example.test/org/repo.git").fetchUrl)
        .toContain("sample-pass");
    } finally {
      if (previous === undefined) delete process.env.GG_ALLOW_URL_CREDENTIALS;
      else process.env.GG_ALLOW_URL_CREDENTIALS = previous;
    }
  });

  it("rejects an existing mirror whose origin was changed to an HTTP remote", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-cache-egress-"));
    try {
      const sourcePath = path.join(tmpDir, "source.git");
      const cachePath = path.join(tmpDir, "mirror.git");
      git(["init", "--bare", sourcePath]);
      await ensureMirrorRepository({ fetchUrl: sourcePath, cachePath, reposRoot: tmpDir });
      git(["-C", cachePath, "remote", "set-url", "origin", "http://127.0.0.1:9/dummy.git"]);
      await expect(ensureMirrorRepository({
        fetchUrl: sourcePath, cachePath, reposRoot: tmpDir
      })).rejects.toMatchObject({
        result: { stderr: expect.stringMatching(/transport 'http' not allowed/i) }
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("analyzes commits from all branches while keeping file inventory on the analysis branch", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-git-engine-"));
    try {
      const sourcePath = path.join(tmpDir, "source");
      const cachePath = path.join(tmpDir, "cache.git");

      git(["init", "--initial-branch=dev", sourcePath]);
      fs.writeFileSync(path.join(sourcePath, "README.md"), "base\n");
      git(["-C", sourcePath, "add", "README.md"]);
      git([
        "-C",
        sourcePath,
        "-c",
        "user.name=Ada",
        "-c",
        "user.email=ada@example.com",
        "commit",
        "-m",
        "base"
      ]);

      git(["-C", sourcePath, "checkout", "-b", "feature/extra"]);
      fs.writeFileSync(path.join(sourcePath, "feature.txt"), "feature\n");
      git(["-C", sourcePath, "add", "feature.txt"]);
      git([
        "-C",
        sourcePath,
        "-c",
        "user.name=Grace",
        "-c",
        "user.email=grace@example.com",
        "commit",
        "-m",
        "feature work"
      ]);
      git(["-C", sourcePath, "checkout", "dev"]);

      await ensureMirrorRepository({
        fetchUrl: sourcePath,
        cachePath,
        reposRoot: tmpDir
      });

      const analysis = await analyzeRepository(cachePath, "dev");

      expect(analysis.commits.map((commit) => commit.subject).sort()).toEqual([
        "base",
        "feature work"
      ]);
      expect(analysis.files.map((file) => file.path)).toEqual(["README.md"]);
      expect(analysis.branches.map((branch) => branch.name).sort()).toEqual([
        "dev",
        "feature/extra"
      ]);
      expect(analysis.commitBranches).toContainEqual(
        expect.objectContaining({
          branchName: "feature/extra",
          remote: null
        })
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function git(args: string[]): void {
  execFileSync("git", args, {
    stdio: "ignore"
  });
}
