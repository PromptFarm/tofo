"use client"

import { create } from "zustand"

import type {
  PersistentItem,
  PersistentItemClosedHow,
} from "@/lib/thinking-graph/server/types"

type ThinkingGraphPersistenceState = {
  /** All persistent items for this session — open + closed */
  persistentItems: PersistentItem[]

  /** Replace items wholesale when loading from a session payload */
  loadPersistentItems: (items: PersistentItem[]) => void

  /**
   * Merge newly-extracted items from a completed run into the list.
   * Skips items whose text already exists as an open item (dedup by text).
   */
  addPersistentItems: (items: PersistentItem[]) => void

  /** Mark an item as resolved */
  closePersistentItem: (
    id: string,
    closedInRunId: string,
    closedHow: PersistentItemClosedHow,
  ) => void
}

export const useThinkingGraphPersistenceStore =
  create<ThinkingGraphPersistenceState>((set, get) => ({
    persistentItems: [],

    loadPersistentItems: (items) => set({ persistentItems: items }),

    addPersistentItems: (incoming) => {
      const { persistentItems } = get()
      const openTexts = new Set(
        persistentItems
          .filter((i) => !i.closedInRunId)
          .map((i) => i.text.trim().toLowerCase()),
      )
      const deduped = incoming.filter(
        (i) => !openTexts.has(i.text.trim().toLowerCase()),
      )
      if (deduped.length === 0) return
      set({ persistentItems: [...persistentItems, ...deduped] })
    },

    closePersistentItem: (id, closedInRunId, closedHow) =>
      set((state) => ({
        persistentItems: state.persistentItems.map((item) =>
          item.id === id ? { ...item, closedInRunId, closedHow } : item,
        ),
      })),
  }))

/** Selector: only items that are still open */
export function selectOpenItems(state: ThinkingGraphPersistenceState) {
  return state.persistentItems.filter((i) => !i.closedInRunId)
}
