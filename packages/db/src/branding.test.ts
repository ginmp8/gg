import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveGGPaths } from "./client";

const previousRoot = process.env.GG_ROOT;
const previousData = process.env.GG_DATA_DIR;
const oldRoot = process.env.GITA_ROOT;
const oldData = process.env.GITA_DATA_DIR;

afterEach(() => {
  for (const [key, value] of [
    ["GG_ROOT", previousRoot], ["GG_DATA_DIR", previousData],
    ["GITA_ROOT", oldRoot], ["GITA_DATA_DIR", oldData]
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GG Analytics local data compatibility", () => {
  it("uses the new branding for new local installations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-data-"));
    try {
      delete process.env.GG_ROOT; delete process.env.GG_DATA_DIR;
      delete process.env.GITA_ROOT; delete process.env.GITA_DATA_DIR;
      const paths = resolveGGPaths(root);
      expect(paths.dataDir).toBe(path.join(root, ".gg"));
      expect(paths.databasePath).toBe(path.join(root, ".gg", "gg.sqlite"));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("reopens an existing legacy database rather than hiding its projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-legacy-"));
    try {
      delete process.env.GG_ROOT; delete process.env.GG_DATA_DIR;
      delete process.env.GITA_ROOT; delete process.env.GITA_DATA_DIR;
      fs.mkdirSync(path.join(root, ".gita"));
      fs.writeFileSync(path.join(root, ".gita", "gita.sqlite"), "existing");
      const paths = resolveGGPaths(root);
      expect(paths.databasePath).toBe(path.join(root, ".gita", "gita.sqlite"));
      fs.mkdirSync(path.join(root, ".gg"));
      fs.writeFileSync(path.join(root, ".gg", "gg.sqlite"), "new");
      expect(resolveGGPaths(root).databasePath).toBe(path.join(root, ".gg", "gg.sqlite"));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
