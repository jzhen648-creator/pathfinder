"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PreviewNodeKind = "pursuit" | "mark" | "milestone";

export type PreviewNode = {
  id: string;
  kind: PreviewNodeKind;
  title: string;
  hubId: string;
  areaId: string;
  parentId: string | null;
  bloomStatus?: string;
  goalType?: string;
  /** Mark calendar date (ISO or parseable). */
  date?: string | null;
  /** Milestone target pursuit preview id. */
  pursuitClientId?: string;
  /** New pursuit client key from extraction. */
  clientKey?: string;
};

/** Single slot for the card currently under review (before Add). */
export const PREVIEW_PENDING_NODE_ID = "stream-preview-pending";

export function previewNodesEqual(
  a: PreviewNode | null,
  b: PreviewNode | null,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.hubId === b.hubId &&
    a.areaId === b.areaId &&
    a.parentId === b.parentId &&
    a.bloomStatus === b.bloomStatus &&
    a.goalType === b.goalType &&
    a.date === b.date &&
    a.pursuitClientId === b.pursuitClientId &&
    a.clientKey === b.clientKey
  );
}

export type StreamPreviewContextValue = {
  previewNodes: PreviewNode[];
  /** Live placement hint for the active confirmation card. */
  pendingPreviewNode: PreviewNode | null;
  addPreviewNode: (node: PreviewNode) => void;
  setPendingPreviewNode: (node: PreviewNode | null) => void;
  clearPreviewNodes: () => void;
};

const StreamPreviewContext = createContext<StreamPreviewContextValue | null>(null);

export function StreamPreviewProvider({ children }: { children: ReactNode }) {
  const [previewNodes, setPreviewNodes] = useState<PreviewNode[]>([]);
  const [pendingPreviewNode, setPendingPreviewNodeState] = useState<PreviewNode | null>(null);

  const setPendingPreviewNode = useCallback((node: PreviewNode | null) => {
    setPendingPreviewNodeState((prev) =>
      previewNodesEqual(prev, node) ? prev : node,
    );
  }, []);

  const addPreviewNode = useCallback((node: PreviewNode) => {
    setPreviewNodes((prev) => {
      if (prev.some((n) => n.id === node.id)) return prev;
      return [...prev, node];
    });
  }, []);

  const clearPreviewNodes = useCallback(() => {
    setPreviewNodes([]);
    setPendingPreviewNode(null);
  }, [setPendingPreviewNode]);

  const value = useMemo(
    () => ({
      previewNodes,
      pendingPreviewNode,
      addPreviewNode,
      setPendingPreviewNode,
      clearPreviewNodes,
    }),
    [previewNodes, pendingPreviewNode, addPreviewNode, setPendingPreviewNode, clearPreviewNodes],
  );

  return (
    <StreamPreviewContext.Provider value={value}>{children}</StreamPreviewContext.Provider>
  );
}

export function useStreamPreview(): StreamPreviewContextValue {
  const ctx = useContext(StreamPreviewContext);
  if (!ctx) {
    throw new Error("useStreamPreview must be used within StreamPreviewProvider");
  }
  return ctx;
}

export function useStreamPreviewOptional(): StreamPreviewContextValue | null {
  return useContext(StreamPreviewContext);
}
