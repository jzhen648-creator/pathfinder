// ─── Pathfinder · theme icons ────────────────────────────────────────
// Thin-stroke geometric glyphs, embedded inside gateway medallions.
// Each icon renders at any size; stroke is rendered as currentColor.
// Designed to be calm symbols, not loud illustrations.

function PFThemeIcon({ theme, size = 16, color = "currentColor", stroke = 1.25 }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: color, strokeWidth: stroke,
    strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block" },
  };
  switch (theme) {
    case "work": // ladder — career direction
      return (
        <svg {...p}>
          <line x1="9"  y1="3" x2="9"  y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
          <line x1="9"  y1="8"  x2="15" y2="8"/>
          <line x1="9"  y1="13" x2="15" y2="13"/>
          <line x1="9"  y1="18" x2="15" y2="18"/>
        </svg>
      );
    case "money": // a small leaf / growth — earn, grow, protect, owe
      return (
        <svg {...p}>
          <path d="M5 19 C 5 11, 11 5, 19 5 C 19 13, 13 19, 5 19 Z"/>
          <path d="M5 19 L 14 10"/>
        </svg>
      );
    case "becoming": // open arc — purpose / horizon
      return (
        <svg {...p}>
          <path d="M4 17 a8 8 0 0 1 16 0"/>
          <line x1="12" y1="6" x2="12" y2="3"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      );
    case "people": // two arcs intersecting — relationship
      return (
        <svg {...p}>
          <circle cx="9" cy="12" r="5"/>
          <circle cx="15" cy="12" r="5"/>
        </svg>
      );
    case "health": // pulse — body, motion
      return (
        <svg {...p}>
          <path d="M3 12 L8 12 L10 8 L13 16 L15 12 L21 12"/>
        </svg>
      );
    default:
      return <svg {...p}><circle cx="12" cy="12" r="4"/></svg>;
  }
}

Object.assign(window, { PFThemeIcon });
