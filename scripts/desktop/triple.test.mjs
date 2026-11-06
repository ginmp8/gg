import assert from "node:assert/strict";
import test from "node:test";

import { sidecarFileName, targetTriple } from "./triple.mjs";

test("the sidecar name matches Tauri's target-triple convention", () => {
  assert.equal(targetTriple("win32", "x64"), "x86_64-pc-windows-msvc");
  assert.equal(targetTriple("win32", "arm64"), "aarch64-pc-windows-msvc");
  assert.equal(targetTriple("darwin", "arm64"), "aarch64-apple-darwin");
  assert.equal(targetTriple("linux", "x64"), "x86_64-unknown-linux-gnu");
  assert.equal(sidecarFileName(targetTriple("win32", "x64")), "node-x86_64-pc-windows-msvc.exe");
  assert.equal(sidecarFileName(targetTriple("linux", "x64")), "node-x86_64-unknown-linux-gnu");
});

test("unknown platforms and path-like triples are rejected", () => {
  assert.throws(() => targetTriple("plan9", "x64"), /Unsupported/);
  assert.throws(() => sidecarFileName("../escape"), /Invalid/);
});
