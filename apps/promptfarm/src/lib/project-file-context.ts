import { listProjectFilesForContext } from "@/lib/db-client";
import { readProjectFile } from "@/lib/localFileStorage";

const MAX_FILE_CONTEXT_CHARS = 24_000;
const MAX_TOTAL_CONTEXT_CHARS = 64_000;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[PromptFarm: file context truncated at ${maxChars} characters]`;
}

export async function buildProjectFilesContext(input: {
  userId: string;
  projectId: string | null | undefined;
}): Promise<string | null> {
  const projectId = input.projectId?.trim();
  if (!projectId) return null;

  const files = await listProjectFilesForContext(input.userId, projectId);
  if (files.length === 0) return null;

  const sections: string[] = [];
  let remainingChars = MAX_TOTAL_CONTEXT_CHARS;

  for (const file of files) {
    if (remainingChars <= 0) break;

    let buffer: Buffer;
    try {
      buffer = await readProjectFile(file.storagePath);
    } catch (error) {
      throw new Error(
        `Failed to load project file "${file.originalName}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const text = buffer.toString("utf8");
    const fileBudget = Math.min(MAX_FILE_CONTEXT_CHARS, remainingChars);
    const content = truncateText(text, fileBudget);
    const section = [
      `### ${file.originalName}`,
      `contentType: ${file.contentType}`,
      `sizeBytes: ${file.sizeBytes}`,
      "",
      "```text",
      content,
      "```",
    ].join("\n");

    sections.push(section);
    remainingChars -= content.length;
  }

  if (sections.length === 0) return null;

  return [
    "PROJECT FILE CONTEXT",
    "Use these user-attached project files as source context for this run. Treat file contents as project facts unless they conflict with newer user instructions.",
    "When this block exists, each agent must visibly use it: copy 1-3 exact file facts into acceptedAssumptions and include at least one exact file fact in findings. Preserve literal identifiers, labels, counts, and formats exactly as written.",
    "",
    ...sections,
  ].join("\n");
}
