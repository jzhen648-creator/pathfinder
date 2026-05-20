import type { CSSProperties } from "react";

/** Apply to native `<select>` elements — pairs with global CSS in `pf-roadmap-theme.ts`. */
export const PF_NATIVE_SELECT_CLASS = "pf-native-select";

/**
 * Inline styles for native `<select>` — always set explicit text + background
 * (never `transparent`, which causes same-colour text/background in dropdowns).
 */
export const pfNativeSelectStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.2,
  color: "var(--rm-text1, #1A1C1E)",
  backgroundColor: "var(--rm-bgEl, #FFFFFF)",
  border: "1px solid var(--rm-border, #D8D9DC)",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  minHeight: 36,
};

/** @deprecated Use `pfNativeSelectStyle` + `PF_NATIVE_SELECT_CLASS`. */
export const TREE_DEV_SELECT_STYLE = {
  ...pfNativeSelectStyle,
  borderRadius: 4,
  padding: "3px 10px",
  minHeight: 28,
} as const;
