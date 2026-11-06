#!/usr/bin/env node
/** Local JSON CLI for agents, shell scripts and harnesses. Never opens network or starts a server. */
import { executeGGCli, ggCliCatalog, ggCliHelp, openGGDatabaseReadOnly } from "@gg/db";

async function main(argv: string[]) {
  if (argv.length === 0 || argv.includes("--help") || argv[0] === "help") {
    process.stdout.write(ggCliHelp() + "\n");
    return;
  }
  if (argv[0] === "catalog" && argv.length === 1) {
    process.stdout.write(JSON.stringify(ggCliCatalog(), null, 2) + "\n");
    return;
  }
  const db = openGGDatabaseReadOnly();
  try {
    const result = await executeGGCli(db,argv);
    process.stdout.write(JSON.stringify(result,null,2) + "\n");
  } finally {
    db.sqlite.close();
  }
}
main(process.argv.slice(2)).catch(error => {
  process.stderr.write(JSON.stringify({
    error: "gg_cli_error",
    message: error instanceof Error ? error.message : String(error)
  }) + "\n");
  process.exitCode = 1;
});
