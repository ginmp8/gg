import { openGitaDatabase } from "@gita/db";

import { buildServer } from "./server";

const database = openGitaDatabase();
const server = await buildServer(database);
const port = 4443;

try {
  await server.listen({ host: "127.0.0.1", port });
  server.log.info(`Gita API listening on http://127.0.0.1:${port}`);
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
