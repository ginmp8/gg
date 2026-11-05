// Executed in each OS CI runner after the sidecar bundle is prepared.
// Verifies the exact packaged API and native better-sqlite3 binding without
// needing to launch a graphical webview in CI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiEntry = path.join(root, "apps/desktop/src-tauri/api-dist/server.mjs");
const token = "a".repeat(64);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gita-sidecar-smoke-"));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).on("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await reservePort();
const child = spawn(process.execPath, [apiEntry], {
  env: {
    ...process.env,
    GITA_API_PORT: String(port),
    GITA_ROOT: root,
    GITA_DATA_DIR: tmp,
    GITA_DESKTOP_TOKEN: token
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let diagnostics = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    if (diagnostics.length < 4096) {
      diagnostics += String(chunk).slice(0, 4096 - diagnostics.length);
    }
  });
}
function safeDiagnostics() {
  return diagnostics
    .replaceAll(token, "[redacted]")
    .replace(/(https?:\/\/)[^\s/?#]*@/gi, "$1[redacted]@")
    .replace(/([?&](?:token|password|access_token)=)[^&#\s]*/gi, "$1[redacted]");
}

try {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Sidecar exited before becoming ready (code ${child.exitCode}): ${safeDiagnostics()}`);
    }
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(600)
      });
      if (result.ok) { healthy = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.ok(healthy, `Packaged API did not start: ${safeDiagnostics()}`);
  const denied = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(denied.status, 401);
  const allowed = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.equal(body.ok, true);
  console.log("Packaged desktop API + SQLite startup: PASS");
} finally {
  child.kill();
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
