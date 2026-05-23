import type { CSSProperties } from "react";

/** Shared visual tokens for fullscreen onboarding scenes. */
export const OB_PRIMARY = "#EF9F27";
export const OB_PRIMARY_HOVER = "#f5b34d";
export const OB_PRIMARY_TEXT = "#07060A";
export const OB_CARD_BG = "rgba(7, 6, 10, 0.80)";
export const OB_CARD_BORDER = "rgba(255,255,255,0.08)";
export const OB_TEXT_PRIMARY = "rgba(245, 243, 250, 0.95)";
export const OB_TEXT_SECONDARY = "rgba(245, 243, 250, 0.55)";
export const OB_TEXT_MUTED = "rgba(245, 243, 250, 0.38)";
export const OB_FONT_SANS = "var(--font-pf-roadmap-sans), 'DM Sans', sans-serif";
export const OB_FONT_SERIF = "var(--font-pf-roadmap-serif), Lora, Georgia, serif";
export const OB_VIGNETTE =
  "radial-gradient(ellipse at center, rgba(7,6,10,0.72) 30%, rgba(7,6,10,0.40) 100%)";

export const obPrimaryButtonStyle = {
  background: OB_PRIMARY,
  color: OB_PRIMARY_TEXT,
  border: "none",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.01em",
  fontFamily: OB_FONT_SANS,
} as const;

export const obSecondaryButtonStyle = {
  background: "transparent",
  color: "rgba(245,243,250,0.72)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: OB_FONT_SANS,
} as const;

/** Visible back / escape control on onboarding fullscreen scenes. */
export const obBackButtonStyle: CSSProperties = {
  ...obSecondaryButtonStyle,
  background: "rgba(9,8,14,0.88)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "rgba(245,243,250,0.82)",
  borderRadius: 999,
  padding: "9px 18px",
  fontSize: 13,
  fontWeight: 500,
};

export const obCardStyle = {
  background: OB_CARD_BG,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 20,
  border: `1px solid ${OB_CARD_BORDER}`,
  fontFamily: OB_FONT_SANS,
} as const;

/** Font imports + CSS vars for fullscreen onboarding (no .pf-roadmap wrapper). */
export const ONBOARDING_UI_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@400;500&display=swap');
:root {
  --font-pf-roadmap-sans: "DM Sans", system-ui, sans-serif;
  --font-pf-roadmap-serif: "Lora", Georgia, serif;
}
`;

/** Theme pill for onboarding theme/hub pick — persistent ring while selected. */
export function obThemeChipStyle(color: string, isSelected: boolean): CSSProperties {
  return {
    background: isSelected ? `${color}32` : "rgba(9,8,14,0.92)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: `${isSelected ? 2 : 1.5}px solid ${isSelected ? color : `${color}99`}`,
    borderRadius: 999,
    padding: isSelected ? "9px 20px" : "8px 17px",
    fontSize: 14,
    lineHeight: 1.2,
    color: isSelected ? "#F5F3FA" : color,
    fontWeight: isSelected ? 700 : 600,
    cursor: "pointer",
    fontFamily: OB_FONT_SANS,
    outline: "none",
    letterSpacing: isSelected ? "0.01em" : "0",
    boxShadow: isSelected
      ? `0 0 0 2px ${color}55, 0 0 32px ${color}48, inset 0 0 24px ${color}20`
      : `0 0 16px ${color}1a`,
    textShadow: isSelected ? `0 0 18px ${color}90` : "none",
    transition: "box-shadow 200ms ease, border-color 200ms ease, background 200ms ease, color 200ms ease",
  };
}
