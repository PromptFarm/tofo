"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        onClick={(e) => e.preventDefault()}
        className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--on-surface-variant)] hover:text-[var(--color-error-text)] hover:bg-[var(--color-error-bg)] transition-colors cursor-pointer bg-transparent border-0 p-0"
      >
        <Trash2 size={13} />
      </AlertDialogTrigger>
      <AlertDialogContent className="border-[var(--surface-container)] bg-[var(--surface-lowest)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[var(--on-surface)]">Delete project?</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--on-surface-variant)]">
            <span className="text-[var(--on-surface)] font-medium">{projectName}</span> will be removed from your projects list. This action can be undone by contacting support.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[var(--surface-container)] bg-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-low)] hover:text-[var(--on-surface)]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-[var(--color-error-text)] text-white hover:bg-[#b91c1c] disabled:opacity-60"
          >
            {loading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
