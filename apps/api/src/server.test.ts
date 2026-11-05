import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openGitaDatabase, type GitaDatabase } from "@gita/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "./server";

const tempRoots: string[] = [];
const databases: GitaDatabase[] = [];

function createTestDatabase(): GitaDatabase {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gita-api-"));
  tempRoots.push(root);
  const database = openGitaDatabase(root);
  databases.push(database);
  return database;
}

afterEach(() => {
  vi.unstubAllEnvs();
  while (databases.length > 0) {
    databases.pop()?.sqlite.close();
  }
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("API server CORS", () => {
  it("allows browser preflight for mutation methods used by the web app", async () => {
    const server = await buildServer(createTestDatabase());

    const responses = await Promise.all(
      ["PATCH", "DELETE"].map((method) =>
        server.inject({
          method: "OPTIONS",
          url: "/api/branch-views/test",
          headers: {
            origin: "http://127.0.0.1:4444",
            "access-control-request-method": method
          }
        })
      )
    );

    await server.close();

    for (const response of responses) {
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4444");
      expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
      expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    }
  });

  it("does not trust an unrelated service on a different localhost port", async () => {
    const server = await buildServer(createTestDatabase());
    try {
      const response = await server.inject({
        method: "OPTIONS",
        url: "/api/branch-views/test",
        headers: {
          origin: "http://127.0.0.1:3000",
          "access-control-request-method": "DELETE"
        }
      });
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("allows explicitly configured origins", async () => {
    vi.stubEnv("GITA_ALLOWED_WEB_ORIGINS", "https://gita.example.test");
    const server = await buildServer(createTestDatabase());
    try {
      const response = await server.inject({
        method: "OPTIONS",
        url: "/api/branch-views/test",
        headers: {
          origin: "https://gita.example.test",
          "access-control-request-method": "PATCH"
        }
      });
      expect(response.headers["access-control-allow-origin"]).toBe("https://gita.example.test");
    } finally {
      await server.close();
    }
  });

  it("rejects wildcard CORS configuration", async () => {
    vi.stubEnv("GITA_ALLOWED_WEB_ORIGINS", "*");
    await expect(buildServer(createTestDatabase())).rejects.toThrow(/exact HTTP\(S\) origins/);
  });

  it("rejects an unexpected Host header even without an Origin header", async () => {
    const server = await buildServer(createTestDatabase());
    try {
      const blocked = await server.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "unexpected.example.test" }
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toMatchObject({ error: "invalid_host" });

      const local = await server.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "localhost:4443" }
      });
      expect(local.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("allows an explicitly trusted API hostname", async () => {
    vi.stubEnv("GITA_ALLOWED_API_HOSTS", "gita.example.test");
    const server = await buildServer(createTestDatabase());
    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "gita.example.test" }
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});
