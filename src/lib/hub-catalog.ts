import type { LifeAreaId } from "./types";

export type HubCatalogEntry = {
  /** One or two sentences on what belongs on this hub. */
  about: string;
  /** Short example pursuits — shown as chips in the hub sidebar. */
  examples: string[];
};

/** Locked default-hub copy — keyed by theme id + hub display name (`Branch.label` / `thread.type`). */
const HUB_CATALOG: Partial<Record<LifeAreaId, Record<string, HubCatalogEntry>>> = {
  finance: {
    Income: {
      about:
        "Earning power over time: salary, freelance, business revenue, and the choices that grow what comes in.",
      examples: ["Negotiate a raise", "Start a side income", "Stabilise cash flow"],
    },
    Investing: {
      about:
        "Growing and allocating wealth — index funds, pensions, property, and long-horizon bets on your future self.",
      examples: ["Open an ISA", "Increase pension contributions", "Build an allocation plan"],
    },
    Protection: {
      about:
        "Financial safety nets: emergency fund, insurance, and resilience when life throws a curveball.",
      examples: ["Hit a runway target", "Review insurance", "Stress-test the safety net"],
    },
    Giving: {
      about:
        "Money flowing outward with intention — gifts, charity, family support, and causes you want to fuel.",
      examples: ["Set a giving budget", "Start recurring donations", "Support someone directly"],
    },
  },
  work: {
    Career: {
      about:
        "Your professional path: roles, promotions, pivots, and the arc of what you do for a living.",
      examples: ["Land a new role", "Scope a promotion", "Plan a career pivot"],
    },
    Skills: {
      about:
        "Capabilities you are building or sharpening — technical depth, craft, credentials, and deliberate practice.",
      examples: ["Complete a certification", "Deepen a core skill", "Teach what you know"],
    },
    Projects: {
      about:
        "Concrete builds and deliveries — side projects, flagship work, portfolios, and things you ship.",
      examples: ["Ship a v1", "Finish a portfolio piece", "Deliver a flagship project"],
    },
    Network: {
      about:
        "People who amplify your work — mentors, peers, collaborators, and the relationships around your craft.",
      examples: ["Find a mentor", "Grow a peer circle", "Run a team ritual"],
    },
  },
  becoming: {
    Purpose: {
      about:
        "Why you are here — north star, values in practice, and the direction your life is meant to take.",
      examples: ["Write a personal mission", "Refine your north star", "Align a quarter to purpose"],
    },
    Spirituality: {
      about:
        "Meaning beyond the practical — faith, contemplative practice, wonder, and what grounds you.",
      examples: ["Establish a daily practice", "Join a community", "Take a retreat"],
    },
    "Inner work": {
      about:
        "The inner life — therapy, journaling, shadow work, identity shifts, and becoming more whole.",
      examples: ["Start therapy", "Clarify core values", "Work through a pattern"],
    },
    Habits: {
      about:
        "Daily rhythms that compound — morning blocks, reviews, rituals, and the small repeats that shape who you are.",
      examples: ["Lock a morning routine", "Weekly review ritual", "Build a keystone habit"],
    },
  },
  people: {
    Family: {
      about:
        "The family story — parents, children, siblings, and the obligations and joys of kin.",
      examples: ["Plan quality time", "Support a family member", "Heal a family dynamic"],
    },
    Romance: {
      about:
        "Partnership and intimacy — dating, marriage, cohabitation, and the love story you are writing.",
      examples: ["Deepen partnership", "Plan a shared chapter", "Repair after conflict"],
    },
    Friendships: {
      about:
        "Chosen family — close friends, social circles, and bonds that outlast any single season.",
      examples: ["Reconnect with a friend", "Host a gathering", "Invest in a core group"],
    },
    Community: {
      about:
        "Belonging beyond your inner circle — neighbours, groups, causes, and places you show up.",
      examples: ["Join a local group", "Volunteer regularly", "Build community roots"],
    },
  },
  health: {
    Movement: {
      about:
        "How you move — training, sport, mobility, and building a body that can keep up with your life.",
      examples: ["Start strength training", "Train for an event", "Fix a mobility limit"],
    },
    Mind: {
      about:
        "Mental fitness — stress, focus, emotional regulation, and habits that keep your mind clear.",
      examples: ["Reduce chronic stress", "Build a mindfulness habit", "Protect deep focus"],
    },
    Sleep: {
      about:
        "Rest as infrastructure — bedtime routines, sleep quality, and recovery you can rely on.",
      examples: ["Fix a sleep schedule", "Improve sleep hygiene", "Recover from burnout"],
    },
    Nutrition: {
      about:
        "Fuel and nourishment — how you eat, hydration, and food choices that support the life you want.",
      examples: ["Simplify weekday meals", "Cut a bad habit", "Fuel for performance"],
    },
  },
  pleasures: {
    Hobbies: {
      about:
        "Pastimes that restore you — making, playing, collecting, and joy that is yours alone.",
      examples: ["Revive a hobby", "Finish a creative project", "Protect hobby time"],
    },
    Culture: {
      about:
        "Art, media, and ideas that move you — books, film, music, and feeding your curiosity.",
      examples: ["Read a book stack", "See live performance", "Start a culture ritual"],
    },
    Experiences: {
      about:
        "Memories in the making — travel, adventures, firsts, and moments worth planning for.",
      examples: ["Plan a trip", "Try something new", "Mark a milestone experience"],
    },
    Downtime: {
      about:
        "Unstructured rest — slowing down, doing nothing on purpose, and protecting space to recharge.",
      examples: ["Block a no-plan weekend", "Reduce screen evenings", "Protect white space"],
    },
  },
};

function normalizeHubKey(label: string): string {
  return label.trim().toLowerCase();
}

/** Catalog copy for a default hub name under a theme; `null` if unknown (custom hub). */
export function hubCatalogEntry(areaId: string, hubLabel: string): HubCatalogEntry | null {
  const area = HUB_CATALOG[areaId as LifeAreaId];
  if (!area) return null;
  const needle = normalizeHubKey(hubLabel);
  const key = Object.keys(area).find((k) => normalizeHubKey(k) === needle);
  return key ? area[key]! : null;
}

/** Fallback when the hub name is custom or not in the locked taxonomy. */
export function hubCatalogFallback(areaId: string, hubLabel: string): HubCatalogEntry {
  const label = hubLabel.trim() || "this hub";
  const byTheme: Partial<Record<LifeAreaId, string>> = {
    finance: "Money, security, and how resources flow through your life.",
    work: "Skills, career momentum, and work that matters to you.",
    becoming: "Identity, inner life, and who you are growing into.",
    people: "Relationships and the people who shape your story.",
    health: "Body, mind, and the foundations that carry everything else.",
    pleasures: "Joy, rest, and the parts of life you protect for yourself.",
  };
  return {
    about: `${label} is a track under ${byTheme[areaId as LifeAreaId] ?? "this theme"}. Goals and timeline notes you add here stay grouped on the map.`,
    examples: ["Add a goal that fits this track", "Capture a timeline note"],
  };
}

export function hubPanelCopy(areaId: string, hubLabel: string): HubCatalogEntry {
  return hubCatalogEntry(areaId, hubLabel) ?? hubCatalogFallback(areaId, hubLabel);
}
