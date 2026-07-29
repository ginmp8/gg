import { spawn } from "node:child_process";

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
    .replace(/(https?:\/\/)([^/@:\s]+):([^/@\s]+)@/gi, "$1$2:***@")
    .replace(/(gh[pousr]_[A-Za-z0-9_]+)/g, "***");
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

  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
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
        args,
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
        args,
        stdout,
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
