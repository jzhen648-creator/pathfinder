import type { CSSProperties } from "react";
import { pfNativeSelectStyle } from "@/lib/ui/native-select-style";
import type { ConfirmationQueueItem } from "./stream-confirmation-types";

export const STREAM_MARK_AMBER = "#c9a227";

export type StreamCardVariant =
  | "mark"
  | "pursuit-peer"
  | "pursuit-child"
  | "milestone"
  | "ambiguous";

export function streamCardVariant(item: ConfirmationQueueItem): StreamCardVariant {
  if (item.kind === "ambiguous") return "ambiguous";
  if (item.kind === "mark") return "mark";
  if (item.kind === "milestone") return "milestone";
  if (item.item.parentRef) return "pursuit-child";
  return "pursuit-peer";
}

export const STREAM_CARD_ANIMATION_CSS = `
@keyframes streamCardInPeer {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes streamCardInChild {
  from {
    opacity: 0;
    transform: translateX(8px) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes streamCardInMilestone {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
`;

export const STREAM_CARD_VARIANT_CSS = `
.pf-stream-shell .pf-stream-card {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 26px 26px 22px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(11, 10, 15, 0.84);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-sizing: border-box;
}

.pf-stream-shell .pf-stream-card-wrap {
  position: relative;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

.pf-stream-shell .pf-stream-card-wrap--child {
  margin-left: 20px;
}

.pf-stream-shell .pf-stream-card-wrap--milestone {
  margin-left: 32px;
}

.pf-stream-shell .pf-stream-card-connector {
  position: absolute;
  left: -12px;
  top: 18px;
  width: 24px;
  height: 28px;
  pointer-events: none;
}

.pf-stream-shell .pf-stream-card-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pf-stream-shell .pf-stream-card-title {
  margin: 6px 0 8px;
  font-family: var(--font-pf-roadmap-sans), "Inter", system-ui, sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.014em;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.96);
}

.pf-stream-shell .pf-stream-card-detail {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.45;
}

.pf-stream-shell .pf-stream-card--mark {
  border-left: 3px solid ${STREAM_MARK_AMBER};
  background: rgba(255, 200, 100, 0.04);
  animation: streamCardInPeer 200ms ease-out;
}

.pf-stream-shell .pf-stream-card--mark .pf-stream-card-label {
  color: ${STREAM_MARK_AMBER};
}

.pf-stream-shell .pf-stream-card--mark .pf-stream-card-date {
  margin: 10px 0 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--color-text-primary);
}

.pf-stream-shell .pf-stream-card--pursuit-peer {
  border-left: 3px solid var(--stream-accent, var(--color-border-tertiary));
  animation: streamCardInPeer 200ms ease-out;
}

.pf-stream-shell .pf-stream-card--pursuit-peer .pf-stream-card-label {
  color: var(--stream-accent, var(--color-text-tertiary));
}

.pf-stream-shell .pf-stream-card--pursuit-child {
  border-left: none;
  background: rgba(0, 0, 0, 0.02);
  animation: streamCardInChild 200ms ease-out;
}

.pf-stream-shell .pf-stream-card--pursuit-child .pf-stream-card-label {
  color: var(--stream-accent, var(--color-text-tertiary));
}

.pf-stream-shell .pf-stream-card--pursuit-child .pf-stream-card-parent {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.45;
}

.pf-stream-shell .pf-stream-card--milestone {
  border: 1px solid var(--color-border-tertiary);
  border-left: 2px dashed var(--color-border-tertiary);
  animation: streamCardInMilestone 200ms ease-out;
}

.pf-stream-shell .pf-stream-card--milestone .pf-stream-card-label {
  color: var(--color-text-tertiary);
}

.pf-stream-shell .pf-stream-card--milestone .pf-stream-card-title {
  font-size: 18px;
}

.pf-stream-shell .pf-stream-card--milestone .pf-stream-card-parent {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.45;
}

.pf-stream-shell .pf-stream-card--ambiguous {
  animation: streamCardInPeer 200ms ease-out;
}

@media (max-width: 479px) {
  .pf-stream-shell .pf-stream-card-wrap--child,
  .pf-stream-shell .pf-stream-card-wrap--milestone {
    margin-left: 0;
  }

  .pf-stream-shell .pf-stream-card-connector {
    display: none;
  }
}
`;

export const inputStyle: CSSProperties = {
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--color-border-tertiary)",
  background: "var(--rm-bgEl, var(--color-background-primary, #fff))",
  color: "var(--rm-text1, var(--color-text-primary, #1a1c1e))",
  width: "100%",
  boxSizing: "border-box",
};

export const selectStyle: CSSProperties = {
  ...pfNativeSelectStyle,
  flex: "1 1 100px",
};

export function primaryBtn(accent: string): CSSProperties {
  return {
    width: "100%",
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: accent,
    color: "#0c0a09",
    cursor: "pointer",
  };
}

export function ghostBtn(): CSSProperties {
  return {
    width: "100%",
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--color-border-tertiary)",
    background: "transparent",
    color: "var(--color-text-primary)",
    cursor: "pointer",
  };
}

export const linkBtnStyle: CSSProperties = {
  padding: 0,
  border: "none",
  background: "transparent",
  fontSize: 13,
  color: "var(--color-text-tertiary)",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

export const editIconBtnStyle: CSSProperties = {
  padding: "4px 6px",
  border: "none",
  background: "transparent",
  color: "var(--color-text-tertiary)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

export const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

export const actionsColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 20,
};

export const responsiveActionsCss = `
@media (max-width: 768px) {
  .pf-stream-shell .pf-stream-confirm-actions button {
    width: 100%;
  }
}
`;
