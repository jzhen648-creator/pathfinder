/** Dark cinematic tree canvas — scoped under `.pf-tree-canvas` (replaces roadmap shell on `/tree`). */
export const PF_TREE_CANVAS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&family=Lora:ital,wght@0,400;1,400&display=swap');

.pf-tree-canvas {
  --font-pf-tree-sans: "Inter", system-ui, sans-serif;
  --font-pf-tree-mono: "JetBrains Mono", ui-monospace, monospace;
  --pf-tree-bg: #07060a;
  --pf-tree-ink: rgba(245, 243, 250, 0.92);
  --pf-tree-ink-dim: rgba(245, 243, 250, 0.55);
  --pf-tree-ink-mute: rgba(245, 243, 250, 0.32);
  --pf-tree-glass-bg: rgba(255, 255, 255, 0.02);
  --pf-tree-glass-border: rgba(255, 255, 255, 0.08);
  --pf-tree-glass-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
  --color-background-primary: var(--pf-tree-glass-bg);
  --color-background-secondary: rgba(255, 255, 255, 0.04);
  --color-text-primary: var(--pf-tree-ink);
  --color-text-secondary: var(--pf-tree-ink-dim);
  --color-text-tertiary: var(--pf-tree-ink-mute);
  --color-border-secondary: var(--pf-tree-glass-border);
  --color-border-tertiary: rgba(255, 255, 255, 0.06);
  --rm-bgEl: var(--pf-tree-glass-bg);
  --rm-border: var(--pf-tree-glass-border);
  --rm-text1: var(--pf-tree-ink);
  --rm-text2: var(--pf-tree-ink-dim);
  --rm-text3: var(--pf-tree-ink-mute);
  --rm-canvas: var(--pf-tree-bg);
  --rm-canvas2: var(--pf-tree-bg);
  font-family: var(--font-pf-tree-sans);
  color: var(--pf-tree-ink);
  background: var(--pf-tree-bg);
}

.pf-tree-canvas-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--pf-tree-bg);
}

.pf-tree-canvas-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.pf-tree-canvas-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 25;
}

.pf-tree-canvas-hud > * {
  pointer-events: auto;
}

.pf-tree-glass-panel {
  background: var(--pf-tree-glass-bg);
  border: 1px solid var(--pf-tree-glass-border);
  border-radius: 16px;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: var(--pf-tree-glass-shadow);
}

.pf-tree-hud-metrics {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 26;
  padding: 8px 16px;
  border-radius: 999px;
  font-family: var(--font-pf-tree-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pf-tree-ink-mute);
  white-space: nowrap;
}

.pf-tree-hud-metrics strong {
  color: var(--pf-tree-ink-dim);
  font-weight: 500;
}

.pf-tree-hud-top-right {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 26;
  display: flex;
  align-items: center;
  gap: 10px;
}

.pf-tree-hud-wordmark {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 26;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--pf-tree-ink);
  opacity: 0.85;
}

.pf-tree-hud-wordmark span {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--pf-tree-ink-mute);
}

.pf-tree-hud-tools {
  position: absolute;
  bottom: 18px;
  left: 16px;
  z-index: 26;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: min(520px, calc(100% - 32px));
}

.pf-tree-hud-btn {
  font-family: var(--font-pf-tree-sans);
  font-size: 12px;
  line-height: 1;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid var(--pf-tree-glass-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--pf-tree-ink-dim);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.pf-tree-hud-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--pf-tree-ink);
}

.pf-tree-hud-btn.is-active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--pf-tree-ink);
  border-color: rgba(255, 255, 255, 0.14);
}

.pf-tree-hud-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pf-tree-detail-rail {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(to right, rgba(11, 10, 15, 0.86), rgba(11, 10, 15, 0.5));
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(26px) saturate(1.1);
  -webkit-backdrop-filter: blur(26px) saturate(1.1);
  animation: treeGoalRailIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.pf-tree-rail-crumb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 12px;
  flex-shrink: 0;
}

.pf-tree-rail-crumb {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: var(--font-pf-tree-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
  min-width: 0;
}

.pf-tree-rail-crumb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #0b0a11;
  border: 1px solid currentColor;
}

.pf-tree-rail-crumb-sep {
  color: rgba(255, 255, 255, 0.2);
}

.pf-tree-rail-crumb-active {
  color: rgba(255, 255, 255, 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf-tree-rail-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  font-size: 18px;
  line-height: 1;
}

.pf-tree-rail-close:hover {
  color: rgba(255, 255, 255, 0.72);
}

.pf-tree-rail-catalog {
  padding: 4px 24px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.pf-tree-rail-title {
  margin: 6px 0 10px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.022em;
  line-height: 1.15;
  color: rgba(255, 255, 255, 0.96);
}

.pf-tree-rail-body {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.62);
  text-wrap: pretty;
}

.pf-tree-rail-meta {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.38);
}

.pf-tree-rail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.pf-tree-rail-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.94);
  color: #0a0911;
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-family: var(--font-pf-tree-sans);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.002em;
  cursor: pointer;
}

.pf-tree-rail-btn-primary:hover {
  background: #fff;
}

.pf-tree-rail-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 9px 13px;
  font-family: var(--font-pf-tree-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.pf-tree-rail-btn-ghost:hover {
  color: rgba(255, 255, 255, 0.82);
  border-color: rgba(255, 255, 255, 0.16);
}

.pf-tree-rail-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px 24px;
}

.pf-tree-rail-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-family: var(--font-pf-tree-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
}

.pf-tree-rail-section-add {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  font-family: var(--font-pf-tree-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0;
}

.pf-tree-rail-section-add:hover {
  color: rgba(255, 255, 255, 0.78);
}

.pf-tree-rail-pursuit-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 11px;
  margin: 0 -10px 4px;
  padding: 12px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.pf-tree-rail-pursuit-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.pf-tree-rail-pursuit-title {
  flex: 1;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: -0.005em;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.94);
}

.pf-tree-rail-pursuit-title.is-on-hold {
  color: rgba(255, 255, 255, 0.55);
}

.pf-tree-rail-pursuit-title.is-complete {
  color: rgba(255, 255, 255, 0.5);
  text-decoration: line-through;
  text-decoration-color: rgba(255, 255, 255, 0.3);
}

.pf-tree-rail-pursuit-badge {
  font-family: var(--font-pf-tree-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.pf-tree-rail-pursuit-done {
  font-family: var(--font-pf-tree-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.pf-tree-rail-empty {
  padding: 22px 0;
  font-family: "Lora", Georgia, serif;
  font-size: 13.5px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.42);
  text-wrap: pretty;
}

.pf-tree-rail-hub-card {
  display: grid;
  gap: 6px;
  width: 100%;
  margin: 0 -10px 6px;
  padding: 12px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.pf-tree-rail-hub-card:hover {
  background: rgba(255, 255, 255, 0.03);
}

.pf-tree-rail-hub-card--open {
  border-left: 2px solid var(--hub-accent, rgba(255,255,255,0.28));
  background: rgba(255, 255, 255, 0.018);
  padding-left: 12px;
}

.pf-tree-rail-hub-card--closed {
  border: 1px dashed color-mix(in srgb, var(--hub-accent, #7B68C8) 34%, rgba(255,255,255,0.08));
  background: color-mix(in srgb, var(--hub-accent, #7B68C8) 7%, transparent);
  padding: 11px 10px;
}

.pf-tree-rail-hub-card--hold {
  position: relative;
  overflow: hidden;
  touch-action: manipulation;
  user-select: none;
}

.pf-tree-rail-hub-card--hold.is-holding,
.pf-tree-rail-hub-card--hold.is-opening {
  border-style: solid;
  background: color-mix(in srgb, var(--hub-accent, #7B68C8) 12%, transparent);
}

.pf-tree-rail-hub-card--hold:disabled {
  cursor: progress;
}

.pf-tree-rail-hub-card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pf-tree-rail-hub-card-title {
  font-size: 13.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.94);
}

.pf-tree-rail-hub-state {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 2px 7px;
  font-family: var(--font-pf-tree-mono, ui-monospace, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pf-tree-rail-hub-state--open {
  border: 1px solid color-mix(in srgb, var(--hub-accent, #7B68C8) 42%, rgba(255,255,255,0.08));
  color: color-mix(in srgb, var(--hub-accent, #7B68C8) 72%, white);
  background: color-mix(in srgb, var(--hub-accent, #7B68C8) 12%, transparent);
}

.pf-tree-rail-hub-state--closed {
  border: 1px solid color-mix(in srgb, var(--hub-accent, #7B68C8) 32%, rgba(255,255,255,0.08));
  color: rgba(255,255,255,0.54);
  background: rgba(255,255,255,0.025);
}

.pf-tree-rail-hub-card-blurb {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.45);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.pf-tree-rail-hub-hold-track {
  position: relative;
  display: block;
  height: 4px;
  margin-top: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.pf-tree-rail-hub-hold-fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--hub-accent, #7B68C8) 70%, white),
    var(--hub-accent, #7B68C8)
  );
  box-shadow: 0 0 14px color-mix(in srgb, var(--hub-accent, #7B68C8) 55%, transparent);
  transform: scaleX(var(--hub-progress, 0));
  transform-origin: left;
  transition: transform 120ms linear;
}

.pf-tree-rail-hub-hold-fill::after {
  content: "";
  position: absolute;
  inset: -1px 0;
  width: 42%;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent);
  opacity: 0;
  transform: translateX(-120%);
}

.pf-tree-rail-hub-card--hold.is-holding .pf-tree-rail-hub-hold-fill {
  transform: scaleX(var(--hub-progress, 0));
}

.pf-tree-rail-hub-card--hold.is-opening .pf-tree-rail-hub-hold-fill {
  transform: scaleX(var(--hub-progress, 1));
}

.pf-tree-rail-hub-card--hold.is-opening .pf-tree-rail-hub-hold-fill::after {
  opacity: 1;
  animation: pf-tree-hub-opening-sheen 1.25s ease-in-out infinite;
}

.pf-tree-rail-hub-hold-hint {
  font-family: var(--font-pf-tree-mono, ui-monospace, monospace);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--hub-accent, #7B68C8) 58%, rgba(255,255,255,0.44));
}

@keyframes pf-tree-hub-opening-sheen {
  0% {
    transform: translateX(-130%);
  }
  100% {
    transform: translateX(260%);
  }
}

.pf-tree-detail-rail-accent {
  display: none;
}

.pf-tree-theme-drawer {
  position: absolute;
  bottom: 18px;
  right: 16px;
  z-index: 26;
  min-width: 200px;
  max-width: 240px;
  padding: 10px;
}

.pf-tree-theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--pf-tree-ink-dim);
  font-size: 12px;
}

.pf-tree-theme-toggle:hover {
  background: rgba(255, 255, 255, 0.04);
}

.pf-tree-theme-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pf-tree-theme-toggle.is-off .pf-tree-theme-dot,
.pf-tree-theme-toggle.is-off span {
  opacity: 0.35;
}

.tree-hub-hover-fill,
.tree-hub-hover-rim {
  transition: fill-opacity 150ms ease-out, stroke-opacity 150ms ease-out;
}

.tree-goal-hover-stroke,
.tree-goal-hover-glow {
  transition: stroke-opacity 150ms ease-out, fill-opacity 150ms ease-out;
}

.tree-mark-node-visual {
  transition: transform 120ms ease-out;
  transform-box: fill-box;
  transform-origin: center;
}
`;

export const TREE_DETAIL_RAIL_WIDTH_PX = 360;
