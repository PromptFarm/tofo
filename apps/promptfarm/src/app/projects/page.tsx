import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAppUser } from "@/lib/auth";
import { listProjects } from "@/lib/db-client";
import { getSidebarCollapsed } from "@/lib/sidebar";
import { listTeamPresets } from "@/lib/db-client";
import { isModelProviderConfigured } from "@/lib/sqlite/appSettings";
import { ProjectsPageClient } from "./ProjectsPageClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!isModelProviderConfigured()) {
    redirect("/tofo/settings?firstRun=1");
  }

  const [user, sidebarCollapsed] = await Promise.all([requireAppUser(), getSidebarCollapsed()]);
  const [projects, teams] = await Promise.all([listProjects(user.id), listTeamPresets(user.id)]);

  console.log("[projects:list] api payload", projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    selectedTeamId: project.selectedTeamId,
    latestSessionId: project.latestSessionId,
    domainTags: project.domainTags,
  })));

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--on-surface)] flex overflow-hidden">
      <AppSidebar active="projects" defaultCollapsed={sidebarCollapsed} />
      <ProjectsPageClient initialProjects={projects} initialTeams={teams} />
    </div>
  );
}
