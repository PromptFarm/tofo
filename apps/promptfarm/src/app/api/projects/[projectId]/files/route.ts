import { NextResponse } from "next/server";
import { getCurrentLocalUser } from "@/lib/auth";
import {
  createProjectFile,
  getProjectById,
  listProjectFiles,
} from "@/lib/db-client";
import { deleteProjectFile, saveProjectFile } from "@/lib/localFileStorage";

const PROJECT_FILES_BUCKET = "local";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".csv"]);
const ALLOWED_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

function extensionFor(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function contentTypeFor(file: File): string {
  const extension = extensionFor(file.name);
  if (extension === ".md" || extension === ".markdown") return "text/markdown";
  if (extension === ".txt") return "text/plain";
  if (extension === ".csv") return "text/csv";
  if (extension === ".json") return "application/json";

  const contentType = file.type.toLowerCase();
  if (
    contentType &&
    contentType !== "application/octet-stream" &&
    (contentType.startsWith("text/") || ALLOWED_CONTENT_TYPES.has(contentType))
  ) {
    return contentType;
  }

  return "text/plain";
}

function isAllowedTextFile(file: File): boolean {
  const contentType = file.type.toLowerCase();
  return (
    contentType.startsWith("text/") ||
    ALLOWED_CONTENT_TYPES.has(contentType) ||
    ALLOWED_EXTENSIONS.has(extensionFor(file.name))
  );
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "attachment.txt";
}

function logUploadTiming(
  label: string,
  startedAt: number,
  extra?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[project-files][upload]", {
    label,
    elapsedMs: Math.round(performance.now() - startedAt),
    ...extra,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentLocalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  try {
    const files = await listProjectFiles(user.id, projectId);
    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list files." },
      { status: 404 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const startedAt = performance.now();
  try {
    const user = await getCurrentLocalUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logUploadTiming("auth", startedAt);

    const { projectId } = await params;
    logUploadTiming("params", startedAt, { projectId });

    const project = await getProjectById(user.id, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    logUploadTiming("project_lookup", startedAt, { projectId });

    const formData = await request.formData();
    logUploadTiming("form_data", startedAt);

    const candidate = formData.get("file");
    if (!(candidate instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    if (candidate.size <= 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }

    if (candidate.size > MAX_TEXT_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 2 MB." },
        { status: 400 },
      );
    }

    if (!isAllowedTextFile(candidate)) {
      return NextResponse.json(
        { error: "Only text files are supported." },
        { status: 400 },
      );
    }

    const text = await candidate.text();
    if (text.includes("\u0000")) {
      return NextResponse.json(
        { error: "Only text files are supported." },
        { status: 400 },
      );
    }
    logUploadTiming("file_validated", startedAt, {
      filename: candidate.name,
      sizeBytes: candidate.size,
      contentType: contentTypeFor(candidate),
      browserContentType: candidate.type || null,
    });

    const uploadId = crypto.randomUUID();
    const safeName = sanitizeFilename(candidate.name);
    const storagePath = `users/${user.id}/projects/${projectId}/files/${uploadId}/${safeName}`;
    const contentType = contentTypeFor(candidate);

    const arrayBuffer = await candidate.arrayBuffer();
    logUploadTiming("array_buffer", startedAt);

    await saveProjectFile(storagePath, arrayBuffer);
    logUploadTiming("storage_upload_finished", startedAt, {
      bucket: PROJECT_FILES_BUCKET,
      storagePath,
    });

    const file = await createProjectFile(user.id, projectId, {
      storageBucket: PROJECT_FILES_BUCKET,
      storagePath,
      originalName: candidate.name,
      contentType,
      sizeBytes: candidate.size,
    }).catch(async (error) => {
      await deleteProjectFile(storagePath).catch((cleanupError) => {
        console.error("[project-files][upload] cleanup failed", {
          storagePath,
          error: cleanupError,
        });
      });
      throw error;
    });
    logUploadTiming("db_record_created", startedAt, {
      fileId: file.id,
    });

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    console.error("[project-files][upload] failed", {
      elapsedMs: Math.round(performance.now() - startedAt),
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload project file." },
      { status: 500 },
    );
  }
}
