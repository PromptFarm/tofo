import { NextResponse } from "next/server";
import { getCurrentSupabaseUser } from "@/lib/auth";
import {
  deleteProjectFileRecord,
  getProjectFileForUser,
} from "@/lib/db-client";
import { createStorageAdminClient } from "@/lib/supabase/storage-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; fileId: string }> },
) {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, fileId } = await params;
  const file = await getProjectFileForUser(user.id, projectId, fileId);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const storage = createStorageAdminClient();
  const remove = await storage.storage
    .from(file.storageBucket)
    .remove([file.storagePath]);

  if (remove.error) {
    return NextResponse.json(
      { error: remove.error.message || "Failed to delete file from storage." },
      { status: 500 },
    );
  }

  await deleteProjectFileRecord(user.id, projectId, fileId);
  return NextResponse.json({ ok: true });
}
