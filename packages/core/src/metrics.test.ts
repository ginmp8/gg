import { describe, expect, it } from "vitest";

import { buildActivityBuckets, buildContributorLeaderboard, summarizeCommits } from "./metrics";
import type { CommitRecord } from "./types";

const commits: CommitRecord[] = [
  {
    repoId: "repo-1",
    hash: "a".repeat(40),
    shortHash: "aaaaaaa",
    contributorId: "contrib-1",
    authorName: "Ada",
    authorEmail: "ada@example.com",
    authorDate: "2026-01-02T10:00:00.000Z",
    committerName: "Ada",
    committerEmail: "ada@example.com",
    committerDate: "2026-01-02T10:00:00.000Z",
    subject: "Initial",
    body: "",
    parents: [],
    isMerge: false,
    insertions: 10,
    deletions: 2,
    filesChanged: 2
  },
  {
    repoId: "repo-1",
    hash: "b".repeat(40),
    shortHash: "bbbbbbb",
    contributorId: "contrib-2",
    authorName: "Grace",
    authorEmail: "grace@example.com",
    authorDate: "2026-01-03T10:00:00.000Z",
    committerName: "Grace",
    committerEmail: "grace@example.com",
    committerDate: "2026-01-03T10:00:00.000Z",
    subject: "Merge branch",
    body: "",
    parents: ["a", "c"],
    isMerge: true,
    insertions: 100,
    deletions: 80,
    filesChanged: 4
  }
];

describe("metrics", () => {
  it("keeps merge commits in commit counts but excludes line totals", () => {
    const summary = summarizeCommits("project-1", commits);

    expect(summary.commits).toBe(2);
    expect(summary.insertions).toBe(10);
    expect(summary.deletions).toBe(2);
    expect(summary.netLines).toBe(8);
  });

  it("builds contributor leaderboards with first and last activity", () => {
    const rows = buildContributorLeaderboard(commits);

    expect(rows[0]?.commits).toBe(1);
    expect(rows.find((row) => row.contributorId === "contrib-2")?.insertions).toBe(0);
  });

  it("groups activity by author date", () => {
    const buckets = buildActivityBuckets(commits);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ date: "2026-01-02", commits: 1 });
  });
});
