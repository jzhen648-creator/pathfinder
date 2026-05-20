import type { LifeAreaId } from "./types";
import { hubMatchKey, normalizeHubLabelKey } from "./taxonomy";

export { hubMatchKey, normalizeHubLabelKey } from "./taxonomy";

export type HubCatalogEntry = {
  /** What this hub is for — 2–3 sentences. */
  about: string;
  /** Why this matters — 1–2 sentences. */
  why: string;
  belongsHere: [string, string, string];
  doesNotBelongHere: [string, string, string];
  /** One sentence for AI routing in Stream extract. */
  aiRoutingNote: string;
  /** Short example pursuits — shown as chips in the hub sidebar empty state. */
  examples: string[];
};

/** Locked default-hub copy — keyed by theme id + hub display name (`Branch.label` / `thread.type`). */
const HUB_CATALOG: Partial<Record<LifeAreaId, Record<string, HubCatalogEntry>>> = {
  finance: {
    Income: {
      about:
        "Money you earn or control as cash flow — salary, freelance, business revenue, commissions, and raises. This hub is about bringing money in, not where you invest it or what you owe.",
      why: "Income sets the ceiling for every other financial choice; naming it clearly stops money stuff from collapsing into one vague blob.",
      belongsHere: [
        "Negotiate a raise",
        "Start freelance income",
        "Stabilise monthly cash flow",
      ],
      doesNotBelongHere: [
        "ISA contributions (→ Assets)",
        "Emergency fund target (→ Safety net)",
        "Pay off credit card (→ Liabilities)",
      ],
      aiRoutingNote:
        "Route here when the item is about earning or cash inflow, not investing, insuring, or repaying debt.",
      examples: [
        "Negotiate a raise",
        "Start freelance income",
        "Stabilise monthly cash flow",
        "Land first mortgage broker role",
        "Track commission ramp in year one",
      ],
    },
    Assets: {
      about:
        "Wealth you grow and hold — pensions, index funds, property equity, brokerage accounts, and allocation decisions. Long-horizon building, not monthly paycheck or monthly bills.",
      why: "Compounding only shows up when investments are separated from day-to-day income and expenses.",
      belongsHere: [
        "Open a stocks & shares ISA",
        "Increase pension contributions",
        "Rebalance portfolio allocation",
      ],
      doesNotBelongHere: [
        "Salary negotiation (→ Income)",
        "Income protection insurance (→ Safety net)",
        "Mortgage balance payoff (→ Liabilities)",
      ],
      aiRoutingNote:
        "Route here for investing, saving for growth, or net-worth building — not salary, insurance, or debt payments.",
      examples: [
        "Open a stocks & shares ISA",
        "Increase pension contributions",
        "Rebalance portfolio allocation",
        "Hit £10k invested milestone",
        "Write a simple investment policy",
      ],
    },
    "Safety net": {
      about:
        "Resilience when things go wrong — emergency fund, insurance (health, life, travel, income protection), wills tied to protection, and runway planning.",
      why: "A safety net turns panic into options; it deserves its own lane so it is not confused with investing or debt.",
      belongsHere: [
        "Hit 6-month emergency fund",
        "Review insurance stack",
        "Stress-test runway if income stops",
      ],
      doesNotBelongHere: [
        "Stock market investing (→ Assets)",
        "Credit card payoff (→ Liabilities)",
        "Negotiate salary (→ Income)",
      ],
      aiRoutingNote:
        "Route here for insurance, emergency funds, and downside protection — not investment growth or debt repayment.",
      examples: [
        "Hit 6-month emergency fund",
        "Review income protection insurance",
        "Stress-test runway if income stops",
        "Top up high-interest savings",
        "Update will tied to protection plan",
      ],
    },
    Liabilities: {
      about:
        "Debts and obligations you must repay — mortgages, loans, credit cards, BNPL, and structured payoff plans. Not charitable giving or investing.",
      why: "Debt has its own psychology and math; tracking it separately keeps payoff plans honest.",
      belongsHere: [
        "Pay off credit card",
        "Refinance mortgage",
        "Snowball consumer debt",
      ],
      doesNotBelongHere: [
        "Values-led charity or tithing (→ Purpose)",
        "Building investment portfolio (→ Assets)",
        "Income protection policy (→ Safety net)",
      ],
      aiRoutingNote:
        "Route here only for money you owe creditors — never for giving, earning, or investing.",
      examples: [
        "Pay off credit card",
        "Refinance mortgage",
        "Snowball consumer debt",
        "Settle joint property with Dad",
        "Close BNPL balance before move",
      ],
    },
  },
  work: {
    Career: {
      about:
        "Your professional trajectory — job titles, promotions, employer changes, industry pivots, and the story of what you do for a living. Strategy and position, not craft details or shipped artifacts.",
      why: "Career moves are high-stakes and infrequent; they deserve a hub that is not cluttered with every course or side repo.",
      belongsHere: [
        "Land Head of Product role",
        "Plan promotion to director",
        "Scope industry pivot",
      ],
      doesNotBelongHere: [
        "Complete AWS certification (→ Skills)",
        "Ship portfolio website v1 (→ Builds & Launches)",
        "Close friendship with former colleague (→ Friendships)",
      ],
      aiRoutingNote:
        "Route here for role, employer, promotion, or career direction — not learning plans or shipped work products.",
      examples: [
        "Land Head of Product role",
        "Plan promotion to director",
        "Scope industry pivot",
        "First interview with brokerage",
        "Map commission ramp timeline",
      ],
    },
    Skills: {
      about:
        "Capabilities you are building — courses, certifications, deliberate practice, tools, mentors, and professional relationships that make you better at the craft. Networking for learning and career capital, not social life.",
      why: "Skills compound separately from any single job title or shipped project.",
      belongsHere: [
        "Complete product management certification",
        "Find a mentor in your field",
        "Deepen SQL for analytics",
      ],
      doesNotBelongHere: [
        "Ship side project MVP (→ Builds & Launches)",
        "Ask for promotion (→ Career)",
        "Weekend trip with friends (→ Joy)",
      ],
      aiRoutingNote:
        "Route here for learning, credentials, practice, and professional network for growth — not job offers or finished deliverables.",
      examples: [
        "Complete CeMAP qualification",
        "Deepen SQL for analytics",
        "Find a mentor in your field",
        "LinkedIn outreach for learning (not social)",
        "Finish product management course",
      ],
    },
    "Builds & Launches": {
      about:
        "Concrete work you ship — side projects, portfolio pieces, flagship builds, launches, and published artifacts with a done state. If it has a deliverable or release, it lives here.",
      why: "Shipping is a different muscle from climbing the ladder or taking a course; separating it keeps busy from done.",
      belongsHere: [
        "Ship Pathfinder v1",
        "Finish case-study portfolio",
        "Deliver Q3 product launch",
      ],
      doesNotBelongHere: [
        "Promotion planning (→ Career)",
        "Learn React course (→ Skills)",
        "Hobby game dev with no ship goal (→ Joy)",
      ],
      aiRoutingNote:
        "Route here when the user describes building, shipping, or releasing a tangible work output — not career moves or skill study alone. When a new target is a clear next chapter of an existing shipped/growth pursuit on this hub (same channel or product, higher metric, later date), extract it as a continuation (parentRef to the earlier pursuit), not a peer.",
      examples: [
        "Ship Pathfinder v1",
        "Finish case-study portfolio",
        "Deliver Q3 product launch",
        "Publish paid newsletter issue",
        "Release portfolio website",
        "Reach 10k YouTube subscribers (continuation after 5k goal on this hub)",
      ],
    },
  },
  becoming: {
    Purpose: {
      about:
        "Meaning and direction — values, north star, faith, wonder, contemplation, and values-led giving. The why behind your life, not day-to-day mood management or hobbies.",
      why: "Without a purpose hub, existential goals get misfiled as generic self-help or random projects.",
      belongsHere: [
        "Clarify whether I still believe in my career north star",
        "Values-led giving plan",
        "Contemplative retreat for direction (not therapy)",
      ],
      doesNotBelongHere: [
        "Weekly therapy for anxiety (→ Inner life)",
        "Grief after father's death (→ Inner life)",
        "Plan concert trip (→ Joy)",
      ],
      aiRoutingNote:
        "Route here for meaning, values, spirituality, intentional giving, and life direction — not therapy, grief processing, habits for mental health, or entertainment. If the core question is 'what do I believe / what matters', Purpose; if 'how do I heal or change patterns', Inner life.",
      examples: [
        "Write a personal mission",
        "Refine my north star",
        "Move back to London for family (values-led)",
        "Values-led giving plan",
        "Figure out what I actually want long-term",
      ],
    },
    "Inner life": {
      about:
        "Psychological and identity work in practice — therapy, journaling, shadow patterns, identity shifts, grief processing, and personal rituals. Not physical appearance or career skills.",
      why: "Inner work is ongoing and intimate; it should not compete with skills on the tree or body projects under Health.",
      belongsHere: [
        "Weekly therapy for anxiety",
        "Work through grief after a loss",
        "Work through recurring relationship pattern",
      ],
      doesNotBelongHere: [
        "Clarify life mission statement (→ Purpose)",
        "Values-led charity plan (→ Purpose)",
        "Girls' weekend trip (→ Joy)",
      ],
      aiRoutingNote:
        "Route here for therapy, grief, shadow patterns, identity shifts, and personal rituals that process inner experience — never for north-star/values questions (Purpose), job skills, or cosmetic body projects.",
      examples: [
        "Start therapy",
        "Process anxiety before the move",
        "Journal through a breakup",
        "Work through anger at Dad",
        "Build a morning reflection ritual",
      ],
    },
    Joy: {
      about:
        "Play, culture, and experiences that make life worth living — hobbies, travel, music, art, and anything that refuels you without a work outcome attached.",
      why: "Joy deferred becomes burnout; giving it a hub prevents every fun thing from looking like a career project.",
      belongsHere: [
        "Revive weekend hiking",
        "Plan Japan trip",
        "See live jazz monthly",
      ],
      doesNotBelongHere: [
        "Launch paid newsletter as a business (→ Builds & Launches)",
        "Values clarification retreat (→ Purpose)",
        "Skincare routine for confidence in body (→ Appearance)",
      ],
      aiRoutingNote:
        "Route here for hobbies, travel, culture, and play — not work outputs, therapy, or physical medical/aesthetic treatment plans. If someone would feel guilty calling it work, it belongs here.",
      examples: [
        "Revive weekend hiking",
        "Plan Japan trip",
        "See live jazz monthly",
        "Join local game night",
        "Book concert tickets",
      ],
    },
  },
  people: {
    Family: {
      about:
        "Kin and family role — parents, children, siblings, co-parenting, elder care, and family obligations or healing. Blood or chosen family structure, not friends or romance.",
      why: "Family dynamics carry unique guilt and duty; they should not be diluted into generic relationships.",
      belongsHere: [
        "Weekly call with dad",
        "Co-parenting schedule",
        "Support sibling through illness",
      ],
      doesNotBelongHere: [
        "Date night with partner (→ Romance)",
        "Reconnect with university friend (→ Friendships)",
        "Couples therapy for partnership (→ Romance)",
      ],
      aiRoutingNote:
        "Route here for parents, children, siblings, and family care — not partners or friends.",
      examples: [
        "Weekly call with dad",
        "Co-parenting schedule",
        "Support sibling through illness",
        "Discuss London return with parents",
        "Heal tension with mum",
      ],
    },
    Romance: {
      about:
        "Partnership and intimacy — dating, marriage, cohabitation, commitment, and the romantic relationship you are building or repairing.",
      why: "Partnership goals have different stakes and rhythms than friendship or family duty.",
      belongsHere: [
        "Plan engagement",
        "Repair after major conflict",
        "Align on having kids",
      ],
      doesNotBelongHere: [
        "Host friends dinner (→ Friendships)",
        "Visit parents (→ Family)",
        "Individual therapy for self only (→ Inner life)",
      ],
      aiRoutingNote:
        "Route here for spouse, partner, dating, or romantic commitment — not friends or relatives.",
      examples: [
        "Plan engagement",
        "Repair after major conflict",
        "Align on having kids",
        "Date night ritual",
        "Spouse visa paperwork",
      ],
    },
    Friendships: {
      about:
        "Chosen relationships and belonging — close friends, communities, neighbours, groups, and showing up for causes with people. Professional networking for career growth goes to Skills.",
      why: "Friendships need intentional care but are not the same as family duty or romance.",
      belongsHere: [
        "Reconnect with old friend",
        "Host monthly dinner club",
        "Volunteer with local group",
      ],
      doesNotBelongHere: [
        "LinkedIn outreach for job search (→ Skills)",
        "Anniversary trip with partner (→ Romance)",
        "Family reunion (→ Family)",
      ],
      aiRoutingNote:
        "Route here for friends, community, and social belonging — not professional networking or family/romantic partners.",
      examples: [
        "Reconnect with old friend",
        "Host monthly dinner club",
        "Volunteer with local group",
        "Meet neighbours properly",
        "Find London Thai community",
      ],
    },
  },
  health: {
    Movement: {
      about:
        "Physical activity and capacity — strength, cardio, sport, steps, mobility, and training plans. What your body does, not what you eat or how you look.",
      why: "Movement drives energy for every other theme; isolating it keeps training plans from dissolving into vague health goals.",
      belongsHere: [
        "Start 3× strength program",
        "Train for half marathon",
        "Fix hip mobility",
      ],
      doesNotBelongHere: [
        "Meal prep system (→ Nutrition)",
        "Sleep schedule (→ Rest)",
        "Hair transplant (→ Appearance)",
      ],
      aiRoutingNote:
        "Route here for exercise, sport, and movement practice — not diet, sleep, or cosmetic procedures.",
      examples: [
        "Start 3× strength program",
        "Train for half marathon",
        "Join Muay Thai gym",
        "Fix hip mobility",
        "Couch-to-5k plan",
      ],
    },
    Nutrition: {
      about:
        "Food and hydration as fuel — meal patterns, macros, cutting habits, supplements tied to diet, and eating for energy or health markers.",
      why: "Nutrition is daily and behavioral; it is not the same as training load or sleep architecture.",
      belongsHere: [
        "Simplify weekday dinners",
        "Cut late-night snacking",
        "Protein target for training block",
      ],
      doesNotBelongHere: [
        "Couch-to-5k plan (→ Movement)",
        "CPAP for sleep apnea (→ Rest)",
        "Teeth whitening (→ Appearance)",
      ],
      aiRoutingNote:
        "Route here for eating, drinking, and food habits — not workouts, sleep, or cosmetic body projects.",
      examples: [
        "Simplify weekday dinners",
        "Cut late-night snacking",
        "Protein target for training",
        "Learn Thai cooking at home",
        "Calibrate London food budget",
      ],
    },
    Appearance: {
      about:
        "Body projects you choose for how you look or feel in your body — teeth, hair, skin, grooming, and cosmetic procedures.",
      why: "Appearance goals are specific, often clinical or cosmetic, and should not absorb all self-improvement.",
      belongsHere: [
        "Plan Invisalign",
        "Book dermatologist for acne",
        "Complete hair restoration protocol",
      ],
      doesNotBelongHere: [
        "Therapy for body image (→ Inner life)",
        "Buy dream watch (→ Joy)",
        "General fat loss via diet (→ Nutrition)",
      ],
      aiRoutingNote:
        "Route here for intentional look/feel body projects (teeth, hair, skin, cosmetic) — not therapy, training, or pure financial purchases.",
      examples: [
        "Plan Invisalign",
        "Book dermatologist for acne",
        "Complete hair restoration protocol",
        "Finish dental work before move",
        "Skincare routine for confidence",
      ],
    },
    Rest: {
      about:
        "Sleep and recovery as infrastructure — bedtime routines, sleep quality, naps, burnout recovery, and unstructured downtime that restores you. Not hobbies unless the goal is rest.",
      why: "Rest is the most underrated lever; giving it a hub stops I'm tired from living only as a vague mark.",
      belongsHere: [
        "Fix 10pm wind-down",
        "Block recovery weekend after launch",
        "Address chronic undersleep",
      ],
      doesNotBelongHere: [
        "Meditation for self-understanding (→ Inner life)",
        "Weekend ski trip (→ Joy)",
        "Strength deload week (→ Movement)",
      ],
      aiRoutingNote:
        "Route here for sleep, rest, recovery, and deliberate downtime — not entertainment or exercise programming.",
      examples: [
        "Fix 10pm wind-down",
        "Block recovery weekend after launch",
        "Address chronic undersleep",
        "Protect sleep during newborn phase",
        "Take a real no-plan Sunday",
      ],
    },
  },
};

function normalizeHubKey(label: string): string {
  return normalizeHubLabelKey(label);
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
    becoming: "Purpose, inner life, and joy you protect for yourself.",
    people: "Relationships and the people who shape your story.",
    health: "Physical foundation — movement, fuel, appearance, and rest.",
  };
  const themeLine = byTheme[areaId as LifeAreaId] ?? "this theme";
  return {
    about: `${label} is a track under ${themeLine}. Pursuits and marks you add here stay grouped on the map.`,
    why: "Naming what matters in this part of your life makes it easier to act on and remember.",
    belongsHere: [
      `Add a pursuit that fits ${label}`,
      "Capture a mark when something changes",
      "Review what is active on this hub",
    ],
    doesNotBelongHere: [
      "Items that clearly belong on another hub in this theme",
      "Work that is really about a different part of life",
      "Duplicates of pursuits already on the map",
    ],
    aiRoutingNote: `Route here only when the item clearly fits ${label} under ${themeLine}.`,
    examples: ["Add a pursuit that fits this track", "Capture a mark"],
  };
}

export function hubPanelCopy(areaId: string, hubLabel: string): HubCatalogEntry {
  return hubCatalogEntry(areaId, hubLabel) ?? hubCatalogFallback(areaId, hubLabel);
}

/** User-facing hub title — resolves legacy DB labels to current catalog names. */
export function canonicalHubDisplayLabel(areaId: string, hubLabel: string): string {
  const trimmed = hubLabel.trim();
  if (!trimmed || trimmed === "—") return trimmed;
  const area = HUB_CATALOG[areaId as LifeAreaId];
  if (!area) return trimmed;
  const needle = normalizeHubKey(trimmed);
  const key = Object.keys(area).find((k) => normalizeHubKey(k) === needle);
  return key ?? trimmed;
}

/** Parse redirect target hub name from a doesNotBelongHere line, e.g. "(→ Assets)". */
export function parseHubRedirectTarget(line: string): string | null {
  const m = /\(→\s*([^)]+)\)\s*$/.exec(line.trim());
  return m?.[1]?.trim() ?? null;
}
