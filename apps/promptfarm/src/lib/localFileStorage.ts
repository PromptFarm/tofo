import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

// Replaces Supabase Storage (see git history — apps/promptfarm/src/lib/supabase/storage-admin.ts).
// This is a local desktop app with no cloud backend, so project files just
// live on disk next to the SQLite database, under the same app-data
// directory (see lib/sqlite/db.ts's DB_PATH for the sibling pattern).
const FILES_ROOT = join(process.cwd(), ".promptfarm", "files");

// storagePath values are built server-side from a random UUID + a
// sanitized filename (see the upload route) — never taken verbatim from a
// URL param — but this stays defense-in-depth against path traversal via
// the stored value on the read/delete side too.
function resolveWithinRoot(storagePath: string): string {
  const resolved = normalize(join(FILES_ROOT, storagePath));
  if (resolved !== FILES_ROOT && !resolved.startsWith(FILES_ROOT + sep)) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }
  return resolved;
}

export async function saveProjectFile(
  storagePath: string,
  data: ArrayBuffer,
): Promise<void> {
  const fullPath = resolveWithinRoot(storagePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, Buffer.from(data));
}

export async function readProjectFile(storagePath: string): Promise<Buffer> {
  return readFile(resolveWithinRoot(storagePath));
}

export async function deleteProjectFile(storagePath: string): Promise<void> {
  await rm(resolveWithinRoot(storagePath), { force: true });
}
