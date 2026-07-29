import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openGitaDatabase, type GitaDatabase } from "@gita/db";
import { afterEach, describe, expect, it } from "vitest";

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
});
