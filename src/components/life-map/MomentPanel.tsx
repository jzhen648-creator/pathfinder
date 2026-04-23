"use client";

import { memo } from "react";

type MomentPanelProps = {
  moment: unknown;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
};

export const MomentPanel = memo(function MomentPanel({
  isOpen,
  onClose,
}: MomentPanelProps) {
  if (!isOpen) return null;
  return <div onClick={onClose} style={{ display: "none" }} />;
});
