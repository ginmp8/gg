#!/usr/bin/env node
/** Local JSON CLI for agents, shell scripts and harnesses. Never opens network or starts a server. */
import { executeGitaCli, gitaCliCatalog, gitaCliHelp, openGitaDatabaseReadOnly } from "@gita/db";

async function main(argv: string[]) {
  if (argv.length === 0 || argv.includes("--help") || argv[0] === "help") {
    process.stdout.write(gitaCliHelp() + "\n");
    return;
  }
  if (argv[0] === "catalog" && argv.length === 1) {
    process.stdout.write(JSON.stringify(gitaCliCatalog(), null, 2) + "\n");
    return;
  }
  const db = openGitaDatabaseReadOnly();
  try {
    const result = await executeGitaCli(db,argv);
    process.stdout.write(JSON.stringify(result,null,2) + "\n");
  } finally {
    db.sqlite.close();
  }
}
main(process.argv.slice(2)).catch(error => {
  process.stderr.write(JSON.stringify({
    error: "gita_cli_error",
    message: error instanceof Error ? error.message : String(error)
  }) + "\n");
  process.exitCode = 1;
});
