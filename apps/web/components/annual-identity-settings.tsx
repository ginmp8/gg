"use client";

import type { AnnualIdentityLink } from "@gita/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { getAnnualIdentities, saveAnnualIdentity, syncAnnualGitHub } from "@/lib/api";

export function AnnualIdentitySettings({
  projectId, repositoryId
}: { projectId: string; repositoryId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [canonicalEmail, setCanonicalEmail] = useState("");
  const [githubLogin, setGithubLogin] = useState("");
  const repoFilter = repositoryId === "all" ? undefined : repositoryId;
  const identitiesQuery = useQuery({
    queryKey: ["annual-identities", projectId],
    queryFn: () => getAnnualIdentities(projectId)
  });
  const ghMutation = useMutation({
    mutationFn: () => syncAnnualGitHub(projectId, repoFilter),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["annual", projectId] })
  });
  const identityMutation = useMutation({
    mutationFn: (link: AnnualIdentityLink) => saveAnnualIdentity(projectId, link),
    onSuccess: () => {
      setEmail("");
      setCanonicalEmail("");
      setGithubLogin("");
      void queryClient.invalidateQueries({ queryKey: ["annual-identities", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["annual", projectId] });
    }
  });


  return (
          <section className="rounded-md border border-border bg-panel p-4">
            <h3 className="text-sm font-semibold">Git author identities and GitHub collaboration</h3>
            <div className="mt-3 grid gap-3">
              <p className="text-sm text-muted-foreground">
                Map Git author emails to a canonical email, and optionally map that person to a GitHub login.
                GitHub metadata is enabled by default unless explicitly disabled. PR/review snapshots
                are fetched only when you click below; unavailable data is not counted as zero.
              </p>
              <form className="grid gap-2 md:grid-cols-4" onSubmit={(event) => {
                event.preventDefault();
                identityMutation.mutate({
                  email: email.trim(), canonicalEmail: canonicalEmail.trim(),
                  githubLogin: githubLogin.trim() || null
                });
              }}>
                <input aria-label="Git author email" placeholder="Git author email" type="email" required
                  value={email} onChange={(event) => setEmail(event.target.value)}
                  className="h-9 min-w-0 rounded border border-border bg-background px-2 text-sm" />
                <input aria-label="Canonical email" placeholder="Canonical email" type="email" required
                  value={canonicalEmail} onChange={(event) => setCanonicalEmail(event.target.value)}
                  className="h-9 min-w-0 rounded border border-border bg-background px-2 text-sm" />
                <input aria-label="GitHub login (optional)" placeholder="GitHub login (optional)"
                  value={githubLogin} onChange={(event) => setGithubLogin(event.target.value)}
                  className="h-9 min-w-0 rounded border border-border bg-background px-2 text-sm" />
                <button disabled={identityMutation.isPending}
                  className="h-9 rounded bg-foreground px-3 text-sm text-background disabled:opacity-50">
                  Save identity link
                </button>
              </form>
              {identityMutation.isError && <p role="alert" className="text-sm text-danger">{identityMutation.error.message}</p>}
              {identitiesQuery.isError && <p role="alert" className="text-sm text-danger">{identitiesQuery.error.message}</p>}
              {(identitiesQuery.data?.items.length ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">
                  {identitiesQuery.data?.items.map((link) =>
                    <p key={link.email}>{link.email} → {link.canonicalEmail}{link.githubLogin ? ` (GitHub: ${link.githubLogin})` : ""}</p>
                  )}
                </div>
              )}
              <button type="button" onClick={() => ghMutation.mutate()} disabled={ghMutation.isPending}
                className="inline-flex w-fit items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
                <RefreshCw className="h-4 w-4" />
                {ghMutation.isPending ? "Fetching GitHub PR/review snapshots..." : "Fetch GitHub PRs and reviews (network)"}
              </button>
              {ghMutation.isError && <p role="alert" className="text-sm text-danger">{ghMutation.error.message}</p>}
              {ghMutation.isSuccess && <p role="status" className="text-sm text-muted-foreground">
                Collaboration snapshot saved. Missing reviews are marked incomplete rather than counted as zero.
              </p>}
            </div>
          </section>
  );
}
