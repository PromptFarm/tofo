import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAppUser } from "@/lib/auth";
import { getSidebarCollapsed } from "@/lib/sidebar";
import { hasTeamPresets, listTeamPresets, seedDefaultTeams } from "@/lib/db-client";
import { TeamsPageClient } from "./TeamsPageClient";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const [user, sidebarCollapsed] = await Promise.all([requireAppUser(), getSidebarCollapsed()]);

  const seeded = await hasTeamPresets(user.id);
  if (!seeded) await seedDefaultTeams(user.id);
  const teams = await listTeamPresets(user.id);

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--on-surface)] flex overflow-hidden">
      <AppSidebar active="teams" defaultCollapsed={sidebarCollapsed} />
      <TeamsPageClient initialTeams={teams} />
    </div>
  );
}
