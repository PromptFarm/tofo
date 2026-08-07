import { syncAppUser as dbSyncAppUser } from "@/lib/db-client";

// Desktop build: no real auth. Every call resolves to the single local user
// that owns this machine's data — there is nothing to sign in to.
const LOCAL_APP_USER_ID = "local-desktop-user";
const LOCAL_APP_USER_EMAIL = "local@promptfarm.app";

export async function getCurrentSupabaseUser() {
  return { id: LOCAL_APP_USER_ID, email: LOCAL_APP_USER_EMAIL };
}

export async function getCurrentAppUser() {
  return dbSyncAppUser(LOCAL_APP_USER_ID, LOCAL_APP_USER_EMAIL);
}

export async function requireAppUser() {
  return getCurrentAppUser();
}
