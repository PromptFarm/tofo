"use client";

import { LogOut } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  function handleSignOut() {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/tofo/auth/signout";
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        title={collapsed ? "Sign out" : undefined}
        aria-label="Sign out"
        className={cn(
          "flex h-9 items-center rounded-md text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-low)] transition-colors cursor-pointer bg-transparent border-0",
          collapsed
            ? "w-full justify-center p-0"
            : "w-full gap-2.5 px-3 py-2 text-xs",
        )}
      >
        <LogOut size={12} />
        {!collapsed && "Sign out"}
      </AlertDialogTrigger>
      <AlertDialogContent className="border-[var(--surface-container)] bg-[var(--surface-lowest)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[var(--on-surface)]">Sign out?</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--on-surface-variant)]">
            You will be returned to the login page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[var(--surface-container)] bg-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-low)] hover:text-[var(--on-surface)]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSignOut}
            className="bg-[var(--surface-low)] text-[var(--on-surface)] hover:bg-[var(--surface-container)] border border-[var(--surface-container)]"
          >
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
