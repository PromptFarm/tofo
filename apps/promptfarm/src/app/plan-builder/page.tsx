"use client";

import { useMemo } from "react";
import { Code2, Scale, Users, Landmark } from "lucide-react";
import { RevisionSidebar } from "@/components/layout/RevisionSidebar";
import { TopNav } from "@/components/layout/TopNav";
import { PerspectiveCard } from "@/components/perspectives/PerspectiveCard";
import { BuilderBreakdown } from "@/components/perspectives/BuilderBreakdown";
import { getProjectMock } from "@/lib/planning/mock-project";
import { useDemoPlaybackStore } from "@/lib/planning/demo-playback-store";
import { getIterationById, getLatestIteration } from "@/lib/planning/selectors";
import type { IterationNode } from "@/lib/planning/types";

const project = getProjectMock();

const perspectiveMeta = [
  {
    key: "builder",
    icon: Code2,
    iconBg: "rgba(0,90,194,0.1)",
    iconColor: "#005ac2",
    name: "Builder",
    suggestionColor: "#005ac2",
    active: true,
  },
  {
    key: "critic",
    icon: Scale,
    iconBg: "rgba(239,68,68,0.1)",
    iconColor: "#ef4444",
    name: "Critic",
    suggestionColor: "#ef4444",
    active: false,
  },
  {
    key: "user",
    icon: Users,
    iconBg: "rgba(34,197,94,0.1)",
    iconColor: "#16a34a",
    name: "User",
    suggestionColor: "#16a34a",
    active: false,
  },
  {
    key: "investor",
    icon: Landmark,
    iconBg: "rgba(147,51,234,0.1)",
    iconColor: "#9333ea",
    name: "Investor",
    suggestionColor: "#9333ea",
    active: false,
  },
] as const;

export default function PlanBuilderPage() {
  const { state: playbackState, setState: setPlaybackState } =
    useDemoPlaybackStore();
  const revisionsById = useMemo(
    () =>
      new Map<string, IterationNode>(
        project.iterations.map((revision) => [revision.id, revision])
      ),
    []
  );
  const visibleRevisions = useMemo(
    () =>
      playbackState.visibleRevisionIds
        .map((revisionId) => revisionsById.get(revisionId))
        .filter((revision): revision is IterationNode => Boolean(revision)),
    [playbackState.visibleRevisionIds, revisionsById]
  );
  const visibleProject = useMemo(
    () => ({
      ...project,
      iterations: visibleRevisions,
    }),
    [visibleRevisions]
  );

  const selectedRevision = useMemo(
    () =>
      playbackState.selectedRevisionId
        ? getIterationById(visibleProject, playbackState.selectedRevisionId) ??
          getLatestIteration(visibleProject)
        : getLatestIteration(visibleProject),
    [playbackState.selectedRevisionId, visibleProject]
  );

  if (!selectedRevision) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <TopNav />
        <div className="flex flex-1 min-h-0">
          <RevisionSidebar
            project={visibleProject}
            selectedRevisionId={playbackState.selectedRevisionId ?? ""}
            onSelectRevision={(revisionId) =>
              setPlaybackState((prev) => ({
                ...prev,
                selectedRevisionId: revisionId,
              }))
            }
          />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-sm text-on-surface-variant">
              No visible revisions yet. Start a revision in Idea Builder.
            </p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <TopNav />
      <div className="flex flex-1 min-h-0">
        <RevisionSidebar
          project={visibleProject}
          selectedRevisionId={selectedRevision.id}
          onSelectRevision={(revisionId) =>
            setPlaybackState((prev) => ({
              ...prev,
              selectedRevisionId: revisionId,
            }))
          }
        />

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 px-10 py-8">
            <h1 className="font-display text-5xl font-bold text-on-surface">
              Perspectives
            </h1>
            <p className="text-on-surface-variant text-lg mt-2">
              Different viewpoints on your idea · {selectedRevision.version}
            </p>

            <div className="grid grid-cols-5 gap-6 mt-10">
              <div className="col-span-3 grid grid-cols-2 gap-5">
                {perspectiveMeta.map((meta) => {
                  const perspective = project.perspectives?.[meta.key];
                  if (!perspective) {
                    return null;
                  }

                  return (
                    <PerspectiveCard
                      key={meta.key}
                      icon={meta.icon}
                      iconBg={meta.iconBg}
                      iconColor={meta.iconColor}
                      name={meta.name}
                      keyInsight={perspective.insight}
                      mainConcern={perspective.concern}
                      suggestion={perspective.suggestion}
                      suggestionColor={meta.suggestionColor}
                      active={meta.active}
                    />
                  );
                })}
              </div>

              <div className="col-span-2">
                <BuilderBreakdown
                  title="Builder Breakdown"
                  subtitle={selectedRevision.summary}
                  reasoning={selectedRevision.output.solution}
                  steps={selectedRevision.output.steps.map((step) => ({
                    title: step.text,
                    description:
                      step.normalized?.replaceAll("-", " ") ??
                      "Execution detail pending",
                  }))}
                />
              </div>
            </div>

            <div className="flex justify-center mt-16 mb-10">
              <button
                className="flex items-center gap-2 px-8 py-3 rounded-lg text-on-primary text-sm font-medium transition-all duration-200 ease-out hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #005ac2, #004fab)",
                }}
              >
                <span>✦</span>
                Refine with Perspectives
              </button>
            </div>

            <footer className="flex items-center justify-between py-6 text-xs text-on-surface-variant">
              <span>&copy; 2024 PromptFarm Serene Architect</span>
              <div className="flex gap-4">
                <a
                  href="#"
                  className="hover:text-on-surface transition-all duration-200 ease-out"
                >
                  Privacy
                </a>
                <a
                  href="#"
                  className="hover:text-on-surface transition-all duration-200 ease-out"
                >
                  Terms
                </a>
                <a
                  href="#"
                  className="hover:text-on-surface transition-all duration-200 ease-out"
                >
                  API
                </a>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
