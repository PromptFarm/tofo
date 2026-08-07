"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { SyntheticEdge } from "./types";

export type DemoPlaybackState = {
  visibleRevisionIds: string[];
  selectedRevisionId: string | null;
  mockIndex: number;
  edgesByRevisionId: Record<string, SyntheticEdge[]>;
};

const initialDemoPlaybackState: DemoPlaybackState = {
  visibleRevisionIds: [],
  selectedRevisionId: null,
  mockIndex: 0,
  edgesByRevisionId: {},
};

type DemoPlaybackContextValue = {
  state: DemoPlaybackState;
  setState: Dispatch<SetStateAction<DemoPlaybackState>>;
};

const DemoPlaybackContext = createContext<DemoPlaybackContextValue | null>(null);

export function DemoPlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialDemoPlaybackState);
  const value = useMemo(() => ({ state, setState }), [state]);

  return (
    <DemoPlaybackContext.Provider value={value}>
      {children}
    </DemoPlaybackContext.Provider>
  );
}

export function useDemoPlaybackStore() {
  const context = useContext(DemoPlaybackContext);
  if (!context) {
    throw new Error(
      "useDemoPlaybackStore must be used within DemoPlaybackProvider"
    );
  }

  return context;
}
