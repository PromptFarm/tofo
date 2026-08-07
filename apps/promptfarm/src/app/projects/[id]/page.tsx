import { notFound } from "next/navigation";
import { ProjectScreen } from "@/components/project-screen/ProjectScreen";
import { requireAppUser } from "@/lib/auth";
import { getLatestProjectSession, getProjectById } from "@/lib/db-client";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAppUser();
  const { id } = await params;
  const sp = await searchParams;

  const project = await getProjectById(user.id, id);
  if (!project) {
    notFound();
  }

  const autostart = sp.autostart === "true";
  const autoPersonas = typeof sp.personas === "string" ? sp.personas : null;

  const initialSessionPayload = await getLatestProjectSession(user.id, project.id);

  return (
    <ProjectScreen
      projectId={project.id}
      projectName={project.name}
      domainTags={project.domainTags}
      initialIdeaPrompt={project.idea ?? ""}
      initialSessionPayload={initialSessionPayload}
      autostart={autostart}
      autoPersonaIds={autoPersonas ? autoPersonas.split(",").filter(Boolean) : []}
    />
  );
}
