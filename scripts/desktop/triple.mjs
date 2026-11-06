import os from "node:os";

const TRIPLES = {
  win32: { x64: "x86_64-pc-windows-msvc", arm64: "aarch64-pc-windows-msvc" },
  darwin: { x64: "x86_64-apple-darwin", arm64: "aarch64-apple-darwin" },
  linux: { x64: "x86_64-unknown-linux-gnu", arm64: "aarch64-unknown-linux-gnu" }
};

export function targetTriple(platform = process.platform, architecture = os.arch()) {
  const triple = TRIPLES[platform]?.[architecture];
  if (!triple) throw new Error(`Unsupported Tauri desktop target: ${platform}/${architecture}`);
  return triple;
}

export function sidecarFileName(triple) {
  if (!/^[a-z0-9_-]+$/.test(triple)) throw new Error("Invalid target triple");
  return `node-${triple}${triple.includes("windows") ? ".exe" : ""}`;
}
