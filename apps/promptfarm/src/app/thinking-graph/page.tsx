import { notFound } from "next/navigation";
import { ThinkingGraphWorkspace } from "@/components/thinking-graph/ThinkingGraphWorkspace";
import { requireAppUser } from "@/lib/auth";
import { getLatestProjectSession, getProjectById } from "@/lib/db-client";

type SearchValue = string | string[] | undefined;

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ThinkingGraphPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const user = await requireAppUser();
  const params = await searchParams;
  const projectId = firstValue(params.projectId) ?? null;
  const autostart = firstValue(params.autostart) === "true";
  const autoPersonas = firstValue(params.personas) ?? null;

  const project = projectId ? await getProjectById(user.id, projectId) : null;
  if (projectId && !project) {
    notFound();
  }

  const initialSessionPayload =
    projectId && project ? await getLatestProjectSession(user.id, project.id) : null;

  return (
    <ThinkingGraphWorkspace
      key={project?.id ?? "standalone-thinking-graph"}
      projectId={project?.id ?? null}
      projectName={project?.name ?? null}
      initialIdeaPrompt={project?.idea ?? ""}
      initialSessionPayload={initialSessionPayload}
      autostart={autostart}
      autoPersonaIds={autoPersonas ? autoPersonas.split(",").filter(Boolean) : []}
    />
  );
}
