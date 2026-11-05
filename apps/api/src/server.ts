import cors from "@fastify/cors";
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import type { GitaDatabase } from "@gita/db";

import { registerRoutes } from "./routes";

export async function buildServer(database: GitaDatabase): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  // A loopback-only unauthenticated API must also reject hostile Host headers:
  // browser same-origin policy does not protect against DNS rebinding.
  const additionalHosts = (process.env.GITA_ALLOWED_API_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (additionalHosts.some((host) => !/^[a-z0-9.-]+$/.test(host))) {
    throw new Error("GITA_ALLOWED_API_HOSTS must contain exact hostnames.");
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]", ...additionalHosts]);
  server.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host?.toLowerCase().replace(/:\d+$/, "");
    if (host && !allowedHosts.has(host)) {
      return reply.status(403).send({ error: "invalid_host" });
    }
  });

  // Only the two actual Gita dashboard origins are trusted implicitly.
  // Explicitly configured extra origins are not a substitute for authentication.
  const configuredOrigins = (process.env.GITA_ALLOWED_WEB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = [
    "http://127.0.0.1:4444",
    "http://localhost:4444",
    ...(process.env.GITA_DESKTOP_TOKEN
      ? ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]
      : []),
    ...configuredOrigins.map((origin) => {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error("GITA_ALLOWED_WEB_ORIGINS must contain exact HTTP(S) origins.");
      }
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("GITA_ALLOWED_WEB_ORIGINS must contain exact HTTP(S) origins.");
      }
      return origin;
    })
  ];

  await server.register(cors, {
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"]
  });

  // In a packaged desktop build the backend is loopback-only, but still
  // requires an unpredictable per-process token: CORS/Host are not auth.
  const desktopToken = process.env.GITA_DESKTOP_TOKEN;
  if (desktopToken) {
    if (!/^[a-f0-9]{64}$/.test(desktopToken)) {
      throw new Error("GITA_DESKTOP_TOKEN must be a 256-bit lowercase hex token.");
    }
    const expected = Buffer.from(`Bearer ${desktopToken}`);
    server.addHook("onRequest", async (request, reply) => {
      if (request.method === "OPTIONS") return;
      const supplied = request.headers.authorization;
      const provided = typeof supplied === "string" ? Buffer.from(supplied) : Buffer.alloc(0);
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      ) {
        return reply.status(401).send({ error: "unauthorized" });
      }
    });
  }

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: "validation_error",
        issues: error.issues
      });
      return;
    }

    server.log.error(error);
    void reply.status(500).send({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unexpected error"
    });
  });

  registerRoutes(server, database);
  return server;
}
