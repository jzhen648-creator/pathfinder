import type { LifeAreaId } from "./types";

export type ThemeCatalogEntry = {
  /** What this theme means in a whole life — the grand framing. */
  vision: string;
  /** How the hubs divide this theme (one line each, hub name → role). */
  dimensions: string[];
  /** What a future AI (or you) should read when evaluating this theme. */
  lenses: string[];
  /** Signals that this part of life is well tended. */
  healthySignals: string[];
  /** Common blind spots when this theme is under-mapped. */
  gapSignals: string[];
};

const THEME_CATALOG: Record<LifeAreaId, ThemeCatalogEntry> = {
  finance: {
    vision:
      "Money is not just numbers — it is security, optionality, and what you can build or clear. This theme holds how resources flow in, grow, stay protected, and what you owe.",
    dimensions: [
      "Income — earning power and cash flow",
      "Assets — long-horizon growth and allocation",
      "Safety net — runway, insurance, resilience",
      "Liabilities — loans, credit, what you owe",
    ],
    lenses: [
      "Is earning keeping pace with the life you want?",
      "Is wealth growing or only sitting idle?",
      "Do you have a real safety net?",
      "Are debts and obligations under control?",
    ],
    healthySignals: [
      "Pursuits across more than one hub — not all eggs in one basket",
      "Marks that show decisions, not just wishes",
      "At least one bloomed or growing pursuit",
    ],
    gapSignals: [
      "Only income tracked — nothing on investments or safety net",
      "No pursuits at all — money story untold on the map",
      "Debt invisible — obligations not represented",
    ],
  },
  work: {
    vision:
      "Work is where capability meets the world — career arc, craft, and what you ship. This theme is your professional story: what you do, how you grow, and what you leave behind.",
    dimensions: [
      "Career — roles, pivots, and trajectory",
      "Skills — depth, credentials, deliberate practice",
      "Builds & Launches — things you build and ship",
    ],
    lenses: [
      "Is your career direction explicit or drifting?",
      "Are you building skills that compound?",
      "Are you shipping, or only planning?",
    ],
    healthySignals: [
      "Active pursuits on skills or projects, not only career title",
      "Evidence of shipped work on the timeline",
      "Balance between growth and delivery",
    ],
    gapSignals: [
      "Career hub only — no skill-building or project pursuits",
      "Stalled pursuits with no recent timeline activity",
      "Skills tracked but nothing shipping",
    ],
  },
  becoming: {
    vision:
      "Self & Mind is your inner world — values, emotions, reflection, and joy you protect. Orientation and depth, not physical projects (see Health & Body).",
    dimensions: [
      "Purpose & Values — direction, meaning, identity, and principles",
      "Mind & Emotions — thoughts, feelings, patterns, and psychological wellbeing",
      "Joy & Creativity — hobbies, play, culture, and personal expression",
    ],
    lenses: [
      "Do you have a lived sense of direction, not just ambition?",
      "Is your emotional and mental life resourced — or only optimized?",
      "Do you protect joy and creativity that is yours?",
      "Does the timeline show real inner shifts?",
    ],
    healthySignals: [
      "Pursuits or marks across purpose, mind, and joy hubs",
      "Mind & Emotions hub with an active pursuit",
      "Timeline marks that capture identity shifts",
    ],
    gapSignals: [
      "Only values statements — no mind or joy",
      "Empty theme — inner life not yet mapped",
      "Pursuits with no emotional or reflective story on the timeline",
    ],
  },
  people: {
    vision:
      "Relationships are the fabric of a life — family, partnership, and friendship. This theme holds who you love and who shapes you.",
    dimensions: [
      "Family — kin, obligation, and care",
      "Romance — partnership and intimacy",
      "Friendships — chosen family, circles, and belonging",
    ],
    lenses: [
      "Are the relationships that matter most represented?",
      "Is partnership or family getting intentional attention?",
      "Do you invest in friendship, not only romance or family?",
    ],
    healthySignals: [
      "Pursuits or marks on more than one relationship hub",
      "Recent marks that show quality time or repair",
      "Active pursuits on friendship",
    ],
    gapSignals: [
      "One hub dominates — other bonds invisible on the map",
      "No relationship pursuits — people story untold",
      "Timeline thin — relationships happen but aren't captured",
    ],
  },
  health: {
    vision:
      "Health and body are the foundation everything else stands on — how you move, fuel, rest, and tend appearance. Physical infrastructure only; meaning and joy live under Self & Mind.",
    dimensions: [
      "Movement — training, sport, mobility",
      "Nutrition — fuel and nourishment",
      "Appearance — teeth, hair, skin, and body projects you choose",
      "Rest — sleep and unstructured recovery",
    ],
    lenses: [
      "Is movement consistent with the life you lead?",
      "Does nutrition support energy and longevity?",
      "Are appearance projects you care about on the map?",
      "Is rest treated as infrastructure?",
    ],
    healthySignals: [
      "Pursuits across movement, nutrition, and rest",
      "Appearance or rest explicitly tracked",
      "Balance across physical levers",
    ],
    gapSignals: [
      "Only movement — nutrition or rest absent",
      "No health & body pursuits — foundation unmapped",
      "All pursuits stalled — burnout risk",
    ],
  },
};

export function themeCatalogEntry(areaId: string): ThemeCatalogEntry | null {
  return THEME_CATALOG[areaId as LifeAreaId] ?? null;
}

export function themePanelCopy(areaId: string): ThemeCatalogEntry {
  return (
    themeCatalogEntry(areaId) ?? {
      vision:
        "This theme groups hubs and pursuits that belong together in one part of your life. A fuller picture emerges as you add pursuits and marks.",
      dimensions: [],
      lenses: ["What matters here?", "What is active?", "What is missing?"],
      healthySignals: ["Pursuits and marks across multiple hubs"],
      gapSignals: ["Sparse mapping — much of this theme may still be untold"],
    }
  );
}
