import { describe, expect, it } from "vitest";

import { redactSecrets, runProcess } from "./command";

describe("Git diagnostic redaction", () => {
  it("masks credentials inside HTTPS repository URLs", () => {
    const diagnostic =
      "git clone https://user:sample-pass@example.test/repo.git?access_token=sample-token";
    const sanitized = redactSecrets(diagnostic);
    expect(sanitized).toContain("https://***@example.test/repo.git?access_token=***");
    expect(sanitized).not.toContain("sample-pass");
    expect(sanitized).not.toContain("sample-token");
  });

  it("masks common GitHub and GitLab token formats", () => {
    expect(redactSecrets("github_pat_example ghp_example glpat-example"))
      .toBe("*** *** ***");
  });
  it("does not forward the desktop API token to Git-like child processes", async () => {
    const previous = process.env.GITA_DESKTOP_TOKEN;
    process.env.GITA_DESKTOP_TOKEN = "a".repeat(64);
    try {
      const result = await runProcess(process.execPath, [
        "-e",
        "process.stdout.write(process.env.GITA_DESKTOP_TOKEN ?? 'not-inherited')"
      ]);
      expect(result.stdout).toBe("not-inherited");
    } finally {
      if (previous === undefined) delete process.env.GITA_DESKTOP_TOKEN;
      else process.env.GITA_DESKTOP_TOKEN = previous;
    }
  });
});
