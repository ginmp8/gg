import { openGGDatabase } from "@gg/db";

import { buildServer } from "./server";

const database = openGGDatabase();
const server = await buildServer(database);
const port = Number(process.env.GG_API_PORT ?? process.env.GITA_API_PORT ?? 4443);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("GG_API_PORT must be a valid TCP port.");
}

try {
  await server.listen({ host: "127.0.0.1", port });
  server.log.info(`GG API listening on http://127.0.0.1:${port}`);
} catch (error) {
  server.log.error(error);
  database.sqlite.close();
  process.exit(1);
}

const shutdown = async (): Promise<void> => {
  await server.close();
  database.sqlite.close();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
