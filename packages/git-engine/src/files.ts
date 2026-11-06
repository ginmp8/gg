import path from "node:path";

import type { RepositoryFile } from "@gg/core";

export function parseLsTreeFiles(
  stdout: string,
  updatedAt: string
): Array<Omit<RepositoryFile, "repoId">> {
  return stdout
    .split("\0")
    .map((record) => record.trimEnd())
    .filter(Boolean)
    .flatMap((record) => {
      const tabIndex = record.indexOf("\t");
      if (tabIndex === -1) {
        return [];
      }

      const metadata = record.slice(0, tabIndex).trim().split(/\s+/);
      const objectType = metadata[1];
      const byteSize = Number.parseInt(metadata[3] ?? "0", 10);
      const filePath = record.slice(tabIndex + 1);
      if (objectType !== "blob" || !filePath) {
        return [];
      }

      return [
        {
          path: filePath,
          extension: getExtension(filePath),
          topLevelDirectory: getTopLevelDirectory(filePath),
          byteSize: Number.isFinite(byteSize) ? byteSize : 0,
          lineCount: null,
          isBinary: false,
          updatedAt
        }
      ];
    });
}

export function parseGrepLineCounts(stdout: string, treeRef: string): Map<string, number> {
  const prefix = `${treeRef}:`;
  const counts = new Map<string, number>();

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.startsWith(prefix)) {
      continue;
    }

    const payload = line.slice(prefix.length);
    const separator = payload.lastIndexOf(":");
    if (separator === -1) {
      continue;
    }

    const filePath = payload.slice(0, separator);
    const lineCount = Number.parseInt(payload.slice(separator + 1), 10);
    if (filePath && Number.isFinite(lineCount)) {
      counts.set(filePath, lineCount);
    }
  }

  return counts;
}

export function applyLineCounts(
  files: Array<Omit<RepositoryFile, "repoId">>,
  lineCounts: Map<string, number>
): Array<Omit<RepositoryFile, "repoId">> {
  return files.map((file) => {
    const lineCount = lineCounts.get(file.path);
    if (lineCount !== undefined) {
      return { ...file, lineCount, isBinary: false };
    }

    return {
      ...file,
      lineCount: file.byteSize === 0 ? 0 : null,
      isBinary: file.byteSize > 0
    };
  });
}

function getExtension(filePath: string): string | null {
  const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();
  return extension || null;
}

function getTopLevelDirectory(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/");
  const [first] = normalized.split("/");
  return first && first !== normalized ? first : null;
}
