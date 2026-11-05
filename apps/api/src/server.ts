import cors from "@fastify/cors";
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

  // Only the two actual Gita dashboard origins are trusted implicitly.
  // Explicitly configured extra origins are not a substitute for authentication.
  const configuredOrigins = (process.env.GITA_ALLOWED_WEB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = [
    "http://127.0.0.1:4444",
    "http://localhost:4444",
    ...configuredOrigins.map((origin) => {
      const parsed = new URL(origin);
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
