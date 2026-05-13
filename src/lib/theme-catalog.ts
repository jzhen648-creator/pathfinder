import type { LifeAreaId } from "./types";

export type ThemeCatalogEntry = {
  /** What this theme means in a whole life — the grand framing. */
  vision: string;
  /** How the four hubs divide this theme (one line each, hub name → role). */
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
      "Money is not just numbers — it is security, optionality, and what you can build or give. This theme holds how resources flow in, grow, stay protected, and move outward with intention.",
    dimensions: [
      "Income — earning power and cash flow",
      "Investing — long-horizon growth and allocation",
      "Protection — runway, insurance, resilience",
      "Giving — generosity with purpose",
    ],
    lenses: [
      "Is earning keeping pace with the life you want?",
      "Is wealth growing or only sitting idle?",
      "Do you have a real safety net?",
      "Does money leave your life in ways that match your values?",
    ],
    healthySignals: [
      "Goals across more than one hub — not all eggs in one basket",
      "Timeline notes that show decisions, not just wishes",
      "At least one bloomed or growing pursuit",
    ],
    gapSignals: [
      "Only income tracked — nothing on investing or protection",
      "No goals at all — money story untold on the map",
      "Goals without timeline — the narrative is missing",
    ],
  },
  work: {
    vision:
      "Work is where capability meets the world — career arc, craft, what you ship, and who amplifies you. This theme is your professional story: what you do, how you grow, and what you leave behind.",
    dimensions: [
      "Career — roles, pivots, and trajectory",
      "Skills — depth, credentials, deliberate practice",
      "Projects — things you build and deliver",
      "Network — mentors, peers, collaborators",
    ],
    lenses: [
      "Is your career direction explicit or drifting?",
      "Are you building skills that compound?",
      "Are you shipping, or only planning?",
      "Do you have people who sharpen your work?",
    ],
    healthySignals: [
      "Active goals on skills or projects, not only career title",
      "Evidence of shipped work on the timeline",
      "Balance between growth and delivery",
    ],
    gapSignals: [
      "Career hub only — no skill-building or project goals",
      "No network or collaboration tracked",
      "Stalled goals with no recent timeline activity",
    ],
  },
  becoming: {
    vision:
      "Who you are becoming is the inner arc — purpose, meaning, inner work, and the daily habits that compound identity. This theme is not productivity; it is orientation and depth.",
    dimensions: [
      "Purpose — north star and values in practice",
      "Spirituality — meaning, faith, contemplation",
      "Inner work — therapy, patterns, wholeness",
      "Habits — rituals and rhythms that shape you",
    ],
    lenses: [
      "Do you have a lived sense of direction, not just ambition?",
      "Is inner life resourced — or only optimized?",
      "Are habits supporting who you want to be?",
      "Does the timeline show real inner shifts?",
    ],
    healthySignals: [
      "Goals or notes across inner life and daily practice",
      "Habits hub with an active pursuit",
      "Timeline moments that mark identity shifts",
    ],
    gapSignals: [
      "Only purpose statements — no habits or inner work",
      "Empty theme — growth not yet mapped",
      "Goals with no reflection on the timeline",
    ],
  },
  people: {
    vision:
      "Relationships are the fabric of a life — family, partnership, friendship, and community. This theme holds who you love, who shapes you, and where you belong.",
    dimensions: [
      "Family — kin, obligation, and care",
      "Romance — partnership and intimacy",
      "Friendships — chosen family and closeness",
      "Community — belonging beyond your inner circle",
    ],
    lenses: [
      "Are the relationships that matter most represented?",
      "Is partnership or family getting intentional attention?",
      "Do you invest in friendship, not only romance or family?",
      "Do you show up somewhere larger than yourself?",
    ],
    healthySignals: [
      "Goals or timeline notes on more than one relationship hub",
      "Recent moments that show quality time or repair",
      "Active pursuits on friendship or community",
    ],
    gapSignals: [
      "One hub dominates — other bonds invisible on the map",
      "No relationship goals — people story untold",
      "Timeline thin — relationships happen but aren't captured",
    ],
  },
  health: {
    vision:
      "Health is the foundation everything else stands on — how you move, think, rest, and fuel. This theme is body and mind as infrastructure, not vanity.",
    dimensions: [
      "Movement — training, sport, mobility",
      "Mind — stress, focus, emotional regulation",
      "Sleep — rest and recovery you can rely on",
      "Nutrition — fuel and nourishment",
    ],
    lenses: [
      "Is movement consistent with the life you lead?",
      "Is mental load managed or ignored?",
      "Is sleep treated as infrastructure?",
      "Does nutrition support energy and longevity?",
    ],
    healthySignals: [
      "Goals across body and mind, not only one lever",
      "Sleep or recovery explicitly tracked",
      "Timeline shows habit formation or turning points",
    ],
    gapSignals: [
      "Only movement — sleep and nutrition absent",
      "No health goals — foundation unmapped",
      "All goals stalled — burnout risk",
    ],
  },
  pleasures: {
    vision:
      "Pleasure is not indulgence — it is restoration, joy, and the parts of life you protect for yourself. Hobbies, culture, experiences, and real downtime keep you human.",
    dimensions: [
      "Hobbies — pastimes that restore you",
      "Culture — art, media, curiosity fed",
      "Experiences — trips, adventures, firsts",
      "Downtime — unstructured rest on purpose",
    ],
    lenses: [
      "Do you have joy that is yours, not only obligation?",
      "Is culture or curiosity alive in your week?",
      "Are experiences planned, not only deferred?",
      "Is downtime protected — or always sacrificed?",
    ],
    healthySignals: [
      "At least one active hobby or culture pursuit",
      "Timeline moments of joy or restoration",
      "Downtime treated as intentional, not accidental",
    ],
    gapSignals: [
      "Empty theme — joy not yet claimed on the map",
      "Only experiences — no hobbies or quiet rest",
      "No timeline — pleasures happen but aren't honoured",
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
        "This theme groups hubs and goals that belong together in one part of your life. A fuller picture emerges as you add pursuits and timeline notes.",
      dimensions: [],
      lenses: ["What matters here?", "What is active?", "What is missing?"],
      healthySignals: ["Goals and timeline notes across multiple hubs"],
      gapSignals: ["Sparse mapping — much of this theme may still be untold"],
    }
  );
}
