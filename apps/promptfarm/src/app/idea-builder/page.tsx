"use client";

import { useMemo, useState } from "react";
import { Code2, Landmark, Scale, Users } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { TopNav } from "@/components/layout/TopNav";
import { RevisionSidebar } from "@/components/layout/RevisionSidebar";
import { PromptEditor } from "@/components/projects/PromptEditor";
import { CoreProblemCard } from "@/components/projects/CoreProblemCard";
import { SolutionCard } from "@/components/projects/SolutionCard";
import { RoadmapCard } from "@/components/projects/RoadmapCard";
import { RisksCard } from "@/components/projects/RisksCard";
import { PerspectiveCard } from "@/components/perspectives/PerspectiveCard";
import { getProjectMock } from "@/lib/planning/mock-project";
import { useDemoPlaybackStore } from "@/lib/planning/demo-playback-store";
import { getIterationById, getLatestIteration } from "@/lib/planning/selectors";
import type { IterationNode, PerspectivesBlock } from "@/lib/planning/types";

const project = getProjectMock();
const syntheticMeta = [
  {
    key: "builder",
    icon: Code2,
    iconBg: "rgba(0,90,194,0.1)",
    iconColor: "#005ac2",
    name: "Builder",
    suggestionColor: "#005ac2",
  },
  {
    key: "critic",
    icon: Scale,
    iconBg: "rgba(239,68,68,0.1)",
    iconColor: "#ef4444",
    name: "Critic",
    suggestionColor: "#ef4444",
  },
  {
    key: "user",
    icon: Users,
    iconBg: "rgba(34,197,94,0.1)",
    iconColor: "#16a34a",
    name: "User",
    suggestionColor: "#16a34a",
  },
  {
    key: "investor",
    icon: Landmark,
    iconBg: "rgba(147,51,234,0.1)",
    iconColor: "#9333ea",
    name: "Investor",
    suggestionColor: "#9333ea",
  },
] as const;

export default function IdeaBuilderPage() {
  const { state: playbackState, setState: setPlaybackState } =
    useDemoPlaybackStore();
  const [isFloatingComposerOpen, setIsFloatingComposerOpen] = useState(false);
  const [selectedSyntheticKey, setSelectedSyntheticKey] = useState<
    keyof PerspectivesBlock | null
  >(null);
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
  const selectedRevisionId = playbackState.selectedRevisionId;
  const mockIndex = playbackState.mockIndex;
  const hasIterations = visibleRevisions.length > 0;
  const hasMoreRevisions = mockIndex < project.iterations.length;

  const visibleProject = useMemo(
    () => ({
      ...project,
      iterations: visibleRevisions,
    }),
    [visibleRevisions]
  );

  const selectedRevision = useMemo(
    () =>
      hasIterations
        ? selectedRevisionId
          ? getIterationById(visibleProject, selectedRevisionId) ??
            getLatestIteration(visibleProject)
          : getLatestIteration(visibleProject)
        : undefined,
    [hasIterations, selectedRevisionId, visibleProject]
  );

  const revealNextRevision = () => {
    if (!hasMoreRevisions) {
      setIsFloatingComposerOpen(false);
      return;
    }

    setPlaybackState((prev) => {
      if (prev.mockIndex >= project.iterations.length) {
        return prev;
      }

      const nextRevision = project.iterations[prev.mockIndex];
      if (!nextRevision) {
        return prev;
      }

      return {
        ...prev,
        visibleRevisionIds: [...prev.visibleRevisionIds, nextRevision.id],
        selectedRevisionId: nextRevision.id,
        mockIndex: prev.mockIndex + 1,
      };
    });
    setSelectedSyntheticKey(null);
    setIsFloatingComposerOpen(false);
  };

  if (!hasIterations) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <TopNav />
        <div className="flex flex-1 min-h-0">
          <RevisionSidebar
            project={visibleProject}
            selectedRevisionId={selectedRevisionId ?? ""}
            onSelectRevision={(revisionId) =>
              setPlaybackState((prev) => ({
                ...prev,
                selectedRevisionId: revisionId,
              }))
            }
          />
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 px-10 py-8 w-full">
              <div className="max-w-4xl mx-auto">
                <h1 className="font-display text-xl font-semibold text-on-surface mb-6">
                  {project.title}
                </h1>
                <PromptEditor
                  defaultValue={project.idea.text}
                  primaryLabel="Start Revision"
                  primaryDisabled={!hasMoreRevisions}
                  onPrimaryAction={revealNextRevision}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!selectedRevision) {
    return null;
  }

  const selectedPerspectives = selectedRevision.perspectives ?? project.perspectives;
  const selectedPerspective = selectedSyntheticKey
    ? selectedPerspectives?.[selectedSyntheticKey]
    : undefined;
  const selectedSyntheticMeta = selectedSyntheticKey
    ? syntheticMeta.find((item) => item.key === selectedSyntheticKey)
    : undefined;

  const roadmapSteps = selectedRevision.output.steps.map((step) => ({
    title: step.text,
    description:
      step.normalized?.replaceAll("-", " ") ??
      "Execution detail to be specified in this revision.",
  }));

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
          <div className="flex-1 px-10 pt-8 pb-80 w-full">
            <div className="flex items-center justify-between mb-6">
              <h1 className="font-display text-xl font-semibold text-on-surface">
                {project.title}
              </h1>
              <span
                className="text-xs font-medium text-primary bg-primary-container/50 px-3 py-1 rounded-full"
                title={selectedRevision.summary}
              >
                {selectedRevision.version}
              </span>
            </div>

            <div className="bg-surface-low rounded-xl p-6">
              <h2 className="font-display text-lg font-semibold text-on-surface">
                Synthetic Review
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Select a synthetic perspective to inspect the breakdown.
              </p>

              <div className="grid grid-cols-2 gap-5 mt-5">
                {syntheticMeta.map((meta) => {
                  const perspective = selectedPerspectives?.[meta.key];
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
                      active={selectedSyntheticKey === meta.key}
                      onClick={() => setSelectedSyntheticKey(meta.key)}
                    />
                  );
                })}
              </div>
            </div>

            <DialogPrimitive.Root
              open={Boolean(selectedSyntheticKey)}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedSyntheticKey(null);
                }
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/30" />
                <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 w-[50vw] min-w-[520px] bg-surface p-6 overflow-y-auto shadow-[0_8px_40px_rgba(15,23,42,0.22)]">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <DialogPrimitive.Title className="font-display font-bold text-on-surface text-xl">
                        {selectedSyntheticMeta?.name ?? "Synthetic"} Breakdown
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="text-sm text-on-surface-variant mt-0.5">
                        {selectedRevision.summary}
                      </DialogPrimitive.Description>
                    </div>
                    <DialogPrimitive.Close className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-all duration-200 ease-out">
                      ✕
                    </DialogPrimitive.Close>
                  </div>

                  {selectedPerspective && selectedSyntheticMeta ? (
                    <div>
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
                          Technical Reasoning
                        </span>
                        <p className="text-sm text-on-surface leading-relaxed mt-2">
                          {`${selectedPerspective.insight} ${selectedPerspective.concern} ${selectedPerspective.suggestion}`}
                        </p>
                      </div>

                      <div className="mt-6 space-y-4">
                        {selectedRevision.output.steps.map((step, index) => (
                          <div key={step.id} className="flex gap-3 items-start">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-primary-fixed-dim flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">
                                {index + 1}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-display font-semibold text-on-surface text-sm">
                                {step.text}
                              </h4>
                              <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">
                                {step.normalized?.replaceAll("-", " ") ??
                                  "Execution detail pending"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </DialogPrimitive.Popup>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <div className="grid grid-cols-2 gap-6 mt-10">
              <CoreProblemCard content={selectedRevision.output.problem} />
              <SolutionCard content={selectedRevision.output.solution} />
            </div>

            <div className="grid grid-cols-5 gap-8 mt-10">
              <div className="col-span-3">
                <RoadmapCard steps={roadmapSteps} />
              </div>
              <div className="col-span-2">
                <RisksCard risks={selectedRevision.output.risks} />
              </div>
            </div>
          </div>
        </main>
      </div>

      {!isFloatingComposerOpen ? (
        <div className="fixed bottom-6 left-72 right-0 z-30 flex justify-center">
          <button
            type="button"
            disabled={!hasMoreRevisions}
            onClick={() => setIsFloatingComposerOpen(true)}
            className={`h-11 px-8 rounded-full text-on-primary text-sm font-medium shadow-[0_6px_22px_rgba(0,90,194,0.28)] transition-all duration-200 ease-out ${
              hasMoreRevisions ? "hover:opacity-90" : "opacity-50 cursor-not-allowed"
            }`}
            style={{
              background: "linear-gradient(135deg, #005ac2, #004fab)",
            }}
          >
            Next Iteration
          </button>
        </div>
      ) : (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/12"
            onClick={() => setIsFloatingComposerOpen(false)}
          />
          <div className="fixed bottom-6 left-72 right-0 z-50 px-8 flex justify-center">
            <div className="w-[min(920px,calc(100vw-24rem))]">
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => setIsFloatingComposerOpen(false)}
                  className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-md transition-all duration-200 ease-out bg-surface-lowest/70 backdrop-blur-sm border border-surface-container/70"
                >
                  Close
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  revealNextRevision();
                }}
              >
                <PromptEditor
                  defaultValue={selectedRevision.input}
                  primaryLabel="Next Iteration"
                  primaryDisabled={!hasMoreRevisions}
                  onPrimaryAction={revealNextRevision}
                />
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
