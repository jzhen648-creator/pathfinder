/** Scoped roadmap / north-star shell tokens + layout (injected under `.pf-roadmap`). */
export const PF_ROADMAP_THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400&display=swap');

.pf-roadmap {
  --font-pf-roadmap-sans: "DM Sans", system-ui, sans-serif;
  --font-pf-roadmap-serif: "Lora", Georgia, serif;
  --rm-canvas: #F5F3EE;
  --rm-canvas2: #EDEBE4;
  --rm-ink900: #1A1C1E;
  --rm-ink700: #3D4046;
  --rm-ink500: #6B7280;
  --rm-ink300: #B8BDC4;
  --rm-ink100: #ECEEF0;
  --rm-bgEl: #FFFFFF;
  --rm-border: #D8D9DC;
  --rm-text1: #1A1C1E;
  --rm-text2: #3D4046;
  --rm-text3: #6B7280;
}
@media (prefers-color-scheme: dark) {
  .pf-roadmap {
    --rm-canvas: #16181A;
    --rm-canvas2: #1E2022;
    --rm-bgEl: #242628;
    --rm-border: #2E3236;
    --rm-text1: #E8EAEC;
    --rm-text2: #9CA3AF;
    --rm-text3: #6B7280;
    --rm-ink100: #252729;
    --rm-ink300: #2E3236;
    --rm-ink500: #6B7280;
    --rm-ink900: #E8EAEC;
  }
}
.pf-roadmap {
  font-family: var(--font-pf-roadmap-sans);
}
.pf-roadmap .pf-roadmap-mono {
  font-family: "DM Mono", ui-monospace, monospace;
}
.pf-roadmap .pf-roadmap-shell {
  display: grid;
  grid-template-rows: 48px 1fr;
  grid-template-columns: 200px 1fr;
  height: 100dvh;
  min-height: 100dvh;
}
.pf-roadmap .pf-roadmap-shell > header {
  grid-column: 1 / -1;
}
.pf-roadmap .rm-sidebar {
  grid-row: 2;
  grid-column: 1;
  background: var(--rm-bgEl);
  border-right: 1px solid var(--rm-border);
  padding: 8px 0 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pf-roadmap .rm-sidebar-divider {
  height: 1px;
  background: var(--rm-border);
  margin: 10px 12px;
}
.pf-roadmap .rm-main {
  grid-row: 2;
  grid-column: 2;
  background: var(--rm-canvas2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}
.pf-roadmap .rm-page-header {
  background: var(--rm-bgEl);
  border-bottom: 1px solid var(--rm-border);
  padding: 14px 24px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
  flex-wrap: wrap;
}
.pf-roadmap .rm-page-title {
  font-family: var(--font-pf-roadmap-serif);
  font-size: 20px;
  font-weight: 400;
  color: var(--rm-text1);
  margin-right: auto;
}
.pf-roadmap .rm-legend {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.pf-roadmap .rm-leg-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--rm-text3);
}
.pf-roadmap .rm-canvas-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}
.pf-roadmap .rm-pan-viewport {
  overflow: hidden;
  width: 100%;
}
.pf-roadmap .rm-pan-surface {
  user-select: none;
  -webkit-user-select: none;
}
.pf-roadmap .rm-tree-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 12px;
  margin: 0 8px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  width: calc(100% - 16px);
  text-align: left;
}
.pf-roadmap .rm-tree-toggle:hover {
  background: var(--rm-ink100);
}
.pf-roadmap .rm-tree-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pf-roadmap .rm-tree-name {
  font-size: 12px;
  color: var(--rm-text3);
  flex: 1;
}
.pf-roadmap .rm-tree-toggle.rm-off .rm-tree-dot {
  opacity: 0.25;
}
.pf-roadmap .rm-tree-toggle.rm-off .rm-tree-name {
  opacity: 0.4;
}
.pf-roadmap .rm-toggle-pill {
  width: 26px;
  height: 15px;
  border-radius: 8px;
  background: var(--rm-ink300);
  position: relative;
  flex-shrink: 0;
  transition: background 200ms;
}
.pf-roadmap .rm-toggle-pill::after {
  content: "";
  position: absolute;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  top: 2px;
  left: 2px;
  transition: transform 200ms;
}
.pf-roadmap .rm-tree-toggle:not(.rm-off) .rm-toggle-pill {
  background: var(--rm-ink900);
}
.pf-roadmap .rm-tree-toggle:not(.rm-off) .rm-toggle-pill::after {
  transform: translateX(11px);
}
.pf-roadmap .rm-hover-card {
  position: absolute;
  background: var(--rm-bgEl);
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  padding: 11px 14px;
  min-width: 190px;
  max-width: 230px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.13);
  pointer-events: none;
  z-index: 100;
}
.pf-roadmap .rm-hc-eyebrow {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 3px;
}
.pf-roadmap .rm-hc-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--rm-text1);
  margin-bottom: 4px;
}
.pf-roadmap .rm-hc-date {
  font-size: 11px;
  font-family: var(--font-pf-roadmap-sans);
  color: var(--rm-text3);
  margin-bottom: 5px;
}
.pf-roadmap .rm-hc-body {
  font-size: 12px;
  color: var(--rm-text2);
  line-height: 1.5;
}
`;
