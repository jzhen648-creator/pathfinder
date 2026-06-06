"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHEET_CSS = `
@keyframes nodeContextSheetSlideUp {
  from { opacity: 0; transform: translateY(100%); }
  to { opacity: 1; transform: translateY(0); }
}

.pf-node-context-spotlight {
  position: fixed;
  z-index: 209;
  border-radius: 50%;
  pointer-events: auto;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
}

.pf-node-context-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 210;
  padding: 16px clamp(16px, 4vw, 32px) max(20px, env(safe-area-inset-bottom));
  border-radius: 20px 20px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 6, 10, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 -18px 54px rgba(0, 0, 0, 0.42);
  color: var(--color-text-primary, #f0ede6);
  animation: nodeContextSheetSlideUp 280ms ease-out both;
}

.pf-node-context-sheet-inner {
  width: min(640px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pf-node-context-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-bottom: 2px;
}

.pf-node-context-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-text-primary, #f0ede6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf-node-context-subtitle {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.pf-node-context-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 480px) {
  .pf-node-context-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.pf-node-context-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 76px;
  padding: 10px 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-primary, #f0ede6);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.pf-node-context-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
}

.pf-node-context-action:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.pf-node-context-action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
}

.pf-node-context-action.is-destructive {
  color: var(--color-text-danger, #f87171);
}

.pf-node-context-action.is-destructive .pf-node-context-action-icon {
  background: rgba(248, 113, 113, 0.12);
  color: var(--color-text-danger, #f87171);
}

.pf-node-context-action.is-warning {
  color: rgba(251, 191, 36, 0.92);
}

.pf-node-context-action.is-warning .pf-node-context-action-icon {
  background: rgba(251, 191, 36, 0.12);
  color: rgba(251, 191, 36, 0.92);
}

.pf-node-context-destructive-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.pf-node-context-section-label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}
`;

export type NodeContextMenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  warning?: boolean;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

export type NodeContextMenuProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  spotlight: { clientX: number; clientY: number };
  spotlightRadiusPx?: number;
  actions: NodeContextMenuAction[];
  destructiveActions?: NodeContextMenuAction[];
  onClose: () => void;
  children?: ReactNode;
};

export function NodeContextMenu({
  open,
  title,
  subtitle,
  spotlight,
  spotlightRadiusPx = 44,
  actions,
  destructiveActions = [],
  onClose,
  children,
}: NodeContextMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const r = spotlightRadiusPx;
  const spotlightStyle = {
    left: spotlight.clientX - r,
    top: spotlight.clientY - r,
    width: r * 2,
    height: r * 2,
  };

  const renderAction = (action: NodeContextMenuAction) => (
    <button
      key={action.id}
      type="button"
      role="menuitem"
      disabled={action.disabled}
      className={[
        "pf-node-context-action",
        action.destructive ? "is-destructive" : "",
        action.warning ? "is-warning" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        if (action.disabled) return;
        void action.onSelect();
      }}
    >
      <span className="pf-node-context-action-icon" aria-hidden>
        {action.icon}
      </span>
      {action.label}
    </button>
  );

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      <div
        className="pf-node-context-spotlight"
        style={spotlightStyle}
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onTouchStart={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        className="pf-node-context-sheet"
        role="menu"
        aria-label={`Actions for ${title}`}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="pf-node-context-sheet-inner">
          <div className="pf-node-context-header">
            <h2 className="pf-node-context-title">{title}</h2>
            {subtitle ? <p className="pf-node-context-subtitle">{subtitle}</p> : null}
          </div>

          {children ?? (
            <>
              <div className="pf-node-context-grid">{actions.map(renderAction)}</div>
              {destructiveActions.length > 0 ? (
                <div className="pf-node-context-destructive-section">
                  <p className="pf-node-context-section-label">Archive &amp; status</p>
                  <div className="pf-node-context-grid">{destructiveActions.map(renderAction)}</div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Inline SVG icons for context menu actions. */
export function ContextMenuIconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ContextMenuIconMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 3 13 9 9 15 5 9 9 3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContextMenuIconStream() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 9c2-3 4-3 6 0s4 3 6 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    </svg>
  );
}

export function ContextMenuIconMilestone() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6v3.5l2 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ContextMenuIconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4.5 9.5 7.5 12.5 13.5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContextMenuIconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M6.5 5v8M11.5 5v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ContextMenuIconEdit() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M11.5 3.5 14.5 6.5 6 15H3v-3l8.5-8.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContextMenuIconArchive() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 6h11M5 6V14.5h8V6M7 9h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContextMenuIconReframe() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M5 6.5A4.5 4.5 0 0 1 13 6.5M13 11.5A4.5 4.5 0 0 1 5 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M3 6.5H5V4.5M15 11.5H13v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
