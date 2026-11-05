import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { sidecarFileName, targetTriple } from "./triple.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tauriDir = path.join(projectRoot, "apps/desktop/src-tauri");
const apiDir = path.join(tauriDir, "api-dist");
const nativeRoot = path.join(projectRoot, "node_modules");
const triple = process.env.TAURI_TARGET_TRIPLE ?? targetTriple();

if (!process.versions.node.startsWith("24.")) {
  throw new Error("Desktop sidecar packaging requires Node.js 24.");
}

const nativeBinary = path.join(nativeRoot, "better-sqlite3", "build", "Release", "better_sqlite3.node");
await fs.access(nativeBinary).catch(() => {
  throw new Error("better-sqlite3 native binding is missing. Run npm ci on the target OS/architecture.");
});

await fs.rm(apiDir, { recursive: true, force: true });
await fs.mkdir(path.join(apiDir, "node_modules"), { recursive: true });
await build({
  entryPoints: [path.join(projectRoot, "apps/api/src/index.ts")],
  outfile: path.join(apiDir, "server.mjs"),
  platform: "node",
  format: "esm",
  target: "node24",
  bundle: true,
  external: ["better-sqlite3"],
  logLevel: "warning"
});

// better-sqlite3 loads a platform-specific .node binary. Never bundle the
// compiled .node file into JavaScript or reuse a binding from another runner.
for (const name of ["better-sqlite3", "bindings", "file-uri-to-path"]) {
  await fs.cp(
    path.join(nativeRoot, name),
    path.join(apiDir, "node_modules", name),
    { recursive: true, dereference: true }
  );
}

const sidecarDir = path.join(tauriDir, "binaries");
await fs.mkdir(sidecarDir, { recursive: true });
const executable = path.join(sidecarDir, sidecarFileName(triple));
await fs.copyFile(process.execPath, executable);
if (process.platform !== "win32") await fs.chmod(executable, 0o755);

const packageJson = {
  name: "gita-desktop-backend",
  private: true,
  type: "module",
  description: "Bundled Fastify API and native SQLite driver"
};
await fs.writeFile(path.join(apiDir, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

console.log(`Prepared Tauri resources for ${triple} (Node ${process.version}).`);
