"use client";

import { create } from "zustand";

import {
  deleteProjectFile,
  listProjectFiles,
  uploadProjectFile,
  type ProjectFileSummary,
} from "@/lib/thinking-graph/client";

type ProjectFilesEntry = {
  files: ProjectFileSummary[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

type ProjectFilesState = {
  byProjectId: Record<string, ProjectFilesEntry>;
  ensureFiles: (projectId: string) => Promise<void>;
  refreshFiles: (projectId: string) => Promise<void>;
  uploadFile: (projectId: string, file: File) => Promise<ProjectFileSummary>;
  deleteFile: (projectId: string, fileId: string) => Promise<void>;
  clearProjectFiles: (projectId: string) => void;
};

const emptyEntry: ProjectFilesEntry = {
  files: [],
  loaded: false,
  loading: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function selectProjectFilesEntry(
  state: ProjectFilesState,
  projectId: string | null,
): ProjectFilesEntry {
  if (!projectId) return emptyEntry;
  return state.byProjectId[projectId] ?? emptyEntry;
}

export const useProjectFilesStore = create<ProjectFilesState>((set, get) => ({
  byProjectId: {},

  ensureFiles: async (projectId) => {
    const current = get().byProjectId[projectId];
    if (current?.loaded || current?.loading) return;
    await get().refreshFiles(projectId);
  },

  refreshFiles: async (projectId) => {
    set((state) => ({
      byProjectId: {
        ...state.byProjectId,
        [projectId]: {
          ...(state.byProjectId[projectId] ?? emptyEntry),
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const files = await listProjectFiles(projectId);
      set((state) => ({
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            files,
            loaded: true,
            loading: false,
            error: null,
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...(state.byProjectId[projectId] ?? emptyEntry),
            loading: false,
            error: errorMessage(error, "Failed to load project files."),
          },
        },
      }));
    }
  },

  uploadFile: async (projectId, file) => {
    set((state) => ({
      byProjectId: {
        ...state.byProjectId,
        [projectId]: {
          ...(state.byProjectId[projectId] ?? emptyEntry),
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const uploaded = await uploadProjectFile(projectId, file);
      set((state) => {
        const current = state.byProjectId[projectId] ?? emptyEntry;
        return {
          byProjectId: {
            ...state.byProjectId,
            [projectId]: {
              files: [uploaded, ...current.files],
              loaded: true,
              loading: false,
              error: null,
            },
          },
        };
      });
      return uploaded;
    } catch (error) {
      set((state) => ({
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...(state.byProjectId[projectId] ?? emptyEntry),
            loading: false,
            error: errorMessage(error, "Failed to upload project file."),
          },
        },
      }));
      throw error;
    }
  },

  deleteFile: async (projectId, fileId) => {
    try {
      await deleteProjectFile(projectId, fileId);
      set((state) => {
        const current = state.byProjectId[projectId] ?? emptyEntry;
        return {
          byProjectId: {
            ...state.byProjectId,
            [projectId]: {
              ...current,
              files: current.files.filter((file) => file.id !== fileId),
              loaded: true,
              error: null,
            },
          },
        };
      });
    } catch (error) {
      set((state) => ({
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...(state.byProjectId[projectId] ?? emptyEntry),
            error: errorMessage(error, "Failed to delete project file."),
          },
        },
      }));
      throw error;
    }
  },

  clearProjectFiles: (projectId) =>
    set((state) => {
      const next = { ...state.byProjectId };
      delete next[projectId];
      return { byProjectId: next };
    }),
}));
