import { createClient } from "@supabase/supabase-js";

export const PROJECT_FILES_BUCKET =
  process.env.SUPABASE_PROJECT_FILES_BUCKET ?? "project-files";

export function createStorageAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Supabase storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function ensureProjectFilesBucket(
  storage: ReturnType<typeof createStorageAdminClient>,
) {
  const existing = await storage.storage.getBucket(PROJECT_FILES_BUCKET);
  if (!existing.error) {
    return;
  }

  const created = await storage.storage.createBucket(PROJECT_FILES_BUCKET, {
    public: false,
    fileSizeLimit: "2MB",
    allowedMimeTypes: [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ],
  });

  if (created.error) {
    throw new Error(created.error.message || "Failed to create project files bucket.");
  }
}
