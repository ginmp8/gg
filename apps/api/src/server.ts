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

  await server.register(cors, {
    origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/],
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
