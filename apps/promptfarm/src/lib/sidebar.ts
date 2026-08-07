import { cookies } from "next/headers";

export const SIDEBAR_COOKIE = "pf-sidebar-collapsed";

export async function getSidebarCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COOKIE)?.value === "true";
}
