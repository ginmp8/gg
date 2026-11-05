import { describe, expect, it } from "vitest";

import { redactSecrets } from "./command";

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
});
