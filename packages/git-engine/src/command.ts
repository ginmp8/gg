import { spawn } from "node:child_process";

import { isGitHubMetadataAllowed, isRemoteGitAllowed } from "./network-policy";

export interface GitCommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface GitCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Only an explicitly requested remote refresh may authorize network Git. */
  allowRemoteGit?: boolean;
}

export class GitCommandError extends Error {
  readonly result: GitCommandResult;

  constructor(message: string, result: GitCommandResult) {
    super(message);
    this.name = "GitCommandError";
    this.result = result;
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function redactSecrets(value: string): string {
  return value
    .replace(/(https?:\/\/)[^\s/?#]*@/gi, "$1***@")
    .replace(/([?&](?:token|access_token|auth|authorization|password|private_token|client_secret|api_key)=)[^&#\s]*/gi, "$1***")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)\b/g, "***");
}

export async function runGit(args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
  return runProcess("git", args, options);
}

export async function runProcess(
  command: string,
  args: string[],
  options: GitCommandOptions = {}
): Promise<GitCommandResult> {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const safeArgs = args.map(redactSecrets);

  // The GitHub CLI can access the network even for status checks.
  // Respect explicit offline/metadata-disable switches before starting it.
  if (command === "gh" && !isGitHubMetadataAllowed()) {
    throw new Error(
      "GitHub metadata is disabled by GG_OFFLINE=1 or GG_ALLOW_GITHUB_METADATA=0."
    );
  }

  const childEnv = { ...process.env };
  // A future packaged desktop may use a private API token. Neither Git nor
  // the GitHub CLI needs it, so do not leak it into child processes.
  delete childEnv.GG_DESKTOP_TOKEN;
  if (command === "git") {
    const remoteAllowed = options.allowRemoteGit === false
      ? false
      : isRemoteGitAllowed(process.env, options.allowRemoteGit === true);
    // Restrict transport even for approved operations: no git://, ext:: or
    // custom remote helpers. Local-repository refreshes remain file-only.
    childEnv.GIT_ALLOW_PROTOCOL = remoteAllowed ? "file:https:ssh" : "file";
    childEnv.GIT_TERMINAL_PROMPT = "0";
  }

  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: childEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      const result: GitCommandResult = {
        command,
        args: safeArgs,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(error.message),
        exitCode: null,
        durationMs: Math.round(performance.now() - started),
        timedOut
      };
      reject(new GitCommandError(`${command} failed to start: ${error.message}`, result));
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      const result: GitCommandResult = {
        command,
        args: safeArgs,
        stdout: exitCode === 0 && !timedOut ? stdout : redactSecrets(stdout),
        stderr: redactSecrets(stderr),
        exitCode,
        durationMs: Math.round(performance.now() - started),
        timedOut
      };

      if (exitCode === 0 && !timedOut) {
        resolve(result);
      } else {
        const summary = timedOut
          ? `${command} timed out after ${timeoutMs}ms`
          : `${command} exited with code ${exitCode}`;
        reject(new GitCommandError(summary, result));
      }
    });
  });
}
