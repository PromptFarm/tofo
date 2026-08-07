"use client";

import {
  getRevisionPathIds,
  getRevisionTreeRows,
} from "@/lib/planning/selectors";
import type { Project } from "@/lib/planning/types";

interface RevisionSidebarProps {
  project: Project;
  selectedRevisionId: string;
  onSelectRevision: (revisionId: string) => void;
}

export function RevisionSidebar({
  project,
  selectedRevisionId,
  onSelectRevision,
}: RevisionSidebarProps) {
  const rows = getRevisionTreeRows(project);
  const activePath = new Set(getRevisionPathIds(project, selectedRevisionId));

  return (
    <aside className="w-72 shrink-0 bg-surface-low h-full sticky top-0 flex flex-col">
      <div className="px-5 pt-6 pb-4 border-b border-surface-container">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant leading-tight">
          Revisions
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center px-3">
            <p className="text-sm text-on-surface-variant text-center">
              No revisions yet. Click Start Revision to reveal the first mock.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {rows.map(({ revision, depth }) => {
              const isActive = revision.id === selectedRevisionId;
              const isInActivePath = activePath.has(revision.id);

              return (
                <button
                  key={revision.id}
                  type="button"
                  title={revision.summary}
                  onClick={() => onSelectRevision(revision.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all duration-200 ease-out ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : isInActivePath
                        ? "border-primary/25 bg-primary/5"
                        : "border-transparent hover:bg-surface-container"
                  }`}
                  style={{ paddingLeft: `${12 + depth * 16}px` }}
                >
                  <span
                    className={`block text-[11px] font-semibold uppercase tracking-wider ${
                      isActive
                        ? "text-primary"
                        : isInActivePath
                          ? "text-primary/80"
                          : "text-on-surface-variant"
                    }`}
                  >
                    {revision.version}
                  </span>
                  <span className="block text-sm text-on-surface truncate mt-0.5">
                    {revision.summary}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
