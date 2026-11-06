"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { Project } from "@gita/core";

interface Props {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: Error | null;
  onConfirm: (projectId: string, confirmName: string) => void;
}

export function ProjectDeleteDialog({
  project, open, onOpenChange, pending, error, onConfirm
}: Props) {
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { if (!open) setConfirmation(""); }, [open]);
  if (!project) return null;
  const matches = confirmation === project.name;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-panel p-5 text-foreground shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-2">
              <Dialog.Title className="text-lg font-semibold text-danger">Delete project permanently</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                This removes the project, its analysis data, repository records,
                branch views and Gita-owned Git mirrors. Source repositories,
                including any local directories you added, will not be deleted.
                This operation cannot be undone.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" disabled={pending} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            if (matches && !pending) onConfirm(project.id, confirmation);
          }}>
            <label className="grid gap-1 text-sm">
              <span>Type <strong className="break-all">{project.name}</strong> to confirm:</span>
              <input
                autoFocus
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-10 rounded border border-border bg-background px-3 text-foreground outline-none focus:border-danger"
              />
            </label>
            {error && <p className="text-sm text-danger" role="alert">{error.message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={pending} onClick={() => onOpenChange(false)}
                className="h-9 rounded border border-border px-4 text-sm hover:bg-muted">Cancel</button>
              <button type="submit" disabled={!matches || pending}
                className="inline-flex h-9 items-center gap-2 rounded bg-danger px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
                {pending ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
