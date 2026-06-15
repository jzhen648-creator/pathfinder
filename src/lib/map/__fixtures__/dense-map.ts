import type { FormattedMapContext, FormattedMapPursuit } from "@/lib/ai/format-map-context";
import type { ReadingPacket } from "@/lib/map/compile-reading-packet";

/** Fixed "now" for deterministic deadline / completion math in tests. */
export const DENSE_FIXTURE_NOW = Date.parse("2026-06-14T12:00:00.000Z");

function pursuit(
  id: string,
  title: string,
  status: string,
  significance: number,
  extra: Partial<FormattedMapPursuit> = {},
): FormattedMapPursuit {
  return {
    id,
    title,
    description: "",
    status,
    significance,
    milestones: [],
    ...extra,
  };
}

/** Alex Carter — 6 themes, 12 pursuits, mixed status, deadlines, completions. */
export const DENSE_MAP_CONTEXT: FormattedMapContext = {
  themes: [
    {
      id: "work",
      label: "Work & Career",
      marks: [],
      hubs: [
        {
          id: "cat-job",
          label: "Job",
          section: "Job",
          marks: [],
          pursuits: [
            pursuit("p-cemap", "CeMAP qualification", "ACTIVE", 5, {
              deadline: "2026-06-20",
              milestones: [
                { id: "m1", title: "Unit 1", completed: false },
                { id: "m2", title: "Unit 2", completed: false },
              ],
            }),
            pursuit("p-lead", "Product Lead search", "ACTIVE", 5, {
              deadline: "2026-06-25",
              milestones: [
                {
                  id: "m3",
                  title: "First interview",
                  completed: true,
                  completedAt: "2026-05-01",
                },
              ],
            }),
            pursuit("p-senior", "Senior Engineer at Acme", "COMPLETE", 4, {
              completedAt: "2026-04-15",
              milestones: [
                {
                  id: "m4",
                  title: "Handover complete",
                  completed: true,
                  completedAt: "2026-04-10",
                },
              ],
            }),
          ],
        },
        {
          id: "cat-skills",
          label: "Skills",
          section: "Skills",
          marks: [],
          pursuits: [
            pursuit("p-speaking", "Public speaking", "MAINTAINING", 3, {
              milestones: [
                {
                  id: "m5",
                  title: "Toastmasters speech",
                  completed: true,
                  completedAt: "2026-03-01",
                },
              ],
            }),
          ],
        },
      ],
    },
    {
      id: "finance",
      label: "Money & Finance",
      marks: [],
      hubs: [
        {
          id: "cat-savings",
          label: "Savings",
          section: "Savings",
          marks: [],
          pursuits: [
            pursuit("p-isa", "£500,000 ISA", "ACTIVE", 5, {
              deadline: "2028-12-31",
              targetAmount: 500000,
              currentAmount: 120000,
              unit: "GBP",
            }),
            pursuit("p-debt", "Clear £10,000 credit card debt", "ACTIVE", 4, {
              deadline: "2026-07-01",
              targetAmount: 10000,
              currentAmount: 4200,
              unit: "GBP",
            }),
            pursuit("p-pension", "Max out pension contributions", "MAINTAINING", 4, {
              deadline: "2027-04-05",
            }),
          ],
        },
      ],
    },
    {
      id: "health",
      label: "Health & Body",
      marks: [],
      hubs: [
        {
          id: "cat-fitness",
          label: "Fitness",
          section: "Fitness",
          marks: [],
          pursuits: [
            pursuit("p-marathon", "London Marathon 2027", "ACTIVE", 4, {
              deadline: "2027-04-26",
              milestones: [
                {
                  id: "m6",
                  title: "Half marathon PB",
                  completed: true,
                  completedAt: "2026-05-20",
                },
              ],
            }),
          ],
        },
      ],
    },
    {
      id: "people",
      label: "People & Relationships",
      marks: [],
      hubs: [
        {
          id: "cat-family",
          label: "Family",
          section: "Family",
          marks: [],
          pursuits: [
            pursuit("p-wedding", "Plan wedding", "ACTIVE", 5, {
              deadline: "2026-09-15",
            }),
            pursuit("p-parents", "Visit parents monthly", "MAINTAINING", 3),
          ],
        },
      ],
    },
    {
      id: "becoming",
      label: "Self & Mind",
      marks: [],
      hubs: [
        {
          id: "cat-mind",
          label: "Mind",
          section: "Mind",
          marks: [],
          pursuits: [
            pursuit("p-meditation", "Daily meditation", "MAINTAINING", 3),
          ],
        },
      ],
    },
    {
      id: "pleasures",
      label: "Play & Leisure",
      marks: [],
      hubs: [
        {
          id: "cat-hobby",
          label: "Hobbies",
          section: "Hobbies",
          marks: [],
          pursuits: [
            pursuit("p-guitar", "Learn guitar", "ACTIVE", 3, {
              deadline: "2026-12-01",
            }),
          ],
        },
      ],
    },
  ],
};

/** All pursuit IDs on the dense map. */
export const DENSE_ALL_PURSUIT_IDS = DENSE_MAP_CONTEXT.themes.flatMap((theme) =>
  theme.hubs.flatMap((hub) => hub.pursuits.map((p) => p.id)),
);

/**
 * Worst-case reflect sync: all 12 pursuits dirty (force / full refresh).
 * Completeness + output-size guards must use this set — not a 2–3 pursuit map.
 */
export const DENSE_DIRTY_PURSUIT_IDS = [...DENSE_ALL_PURSUIT_IDS];

/** Minimal reading packet stub for reflect tests. */
export const DENSE_READING_PACKET: ReadingPacket = {
  changeEvents: ['"CeMAP qualification": status NOT_STARTED → ACTIVE'],
  categorySignals: [
    {
      themeLabel: "Work & Career",
      categoryLabel: "Job",
      byStatus: { ACTIVE: 2, COMPLETE: 1 },
      pursuits: [
        {
          title: "Senior Engineer at Acme",
          status: "COMPLETE",
          significance: 4,
          signal: "arrival",
        },
        {
          title: "CeMAP qualification",
          status: "ACTIVE",
          deadline: "2026-06-20",
          significance: 5,
          signal: "gap",
        },
        {
          title: "Product Lead search",
          status: "ACTIVE",
          deadline: "2026-06-25",
          significance: 5,
        },
      ],
      facts: [
        "Work & Career · Job: 1 complete and 2 in progress",
        "Active with deadlines: CeMAP qualification (deadline Jun 2026); Product Lead search (deadline Jun 2026)",
        "Significant but stalled: CeMAP qualification (sig 5, deadline 6d, 0 of 2 milestones completed)",
      ],
    },
  ],
  recentEvents: {
    past: [
      {
        kind: "milestone_complete" as const,
        date: "2026-05-20",
        placement: "past" as const,
        title: "Half marathon PB",
        pursuitTitle: "London Marathon 2027",
        themeId: "health",
        themeLabel: "Health & Body",
        significance: 4,
      },
    ],
    upcoming: [
      {
        kind: "pursuit_deadline" as const,
        date: "2026-06-20",
        placement: "future" as const,
        title: "CeMAP qualification",
        pursuitTitle: "CeMAP qualification",
        themeId: "work",
        themeLabel: "Work & Career",
        significance: 5,
      },
    ],
  },
  mapAggregates: {
    totalPursuits: DENSE_ALL_PURSUIT_IDS.length,
    upcomingDeadlines14d: 2,
    upcomingDeadlines30d: 4,
    recentCompletions90d: 3,
    highSignificanceActive: [
      "CeMAP qualification",
      "Product Lead search",
      "£500,000 ISA",
      "Plan wedding",
    ],
  },
  gapFacts: [
    "Significant but stalled: CeMAP qualification (sig 5, deadline 6d, 0 of 2 milestones completed)",
  ],
  milestonePaceFacts: [
    "Product Lead search: 1/1 milestones complete; last milestone 44d ago",
    "Senior Engineer at Acme: 1/1 milestones complete; last milestone 65d ago",
  ],
};

export const DENSE_USER_CONTEXT = "Name: Alex Carter\nAge: 34\nLocation: London, UK";

/** Build a valid reflect response covering every dirty pursuit ID. */
export function buildDenseReflectResponse(dirtyIds: string[]): {
  reading: string;
  themes: Record<
    string,
    {
      tone: "encouraging";
      oneLiner: string;
      reflective: string;
      contextual: string;
      combined: string;
    }
  >;
  pursuits: Record<
    string,
    {
      tone: "informational";
      headline: string;
      body: string;
      clarifiers: [];
      suggestedMilestones: null;
    }
  >;
} {
  const pursuits: Record<
    string,
    {
      tone: "informational";
      headline: string;
      body: string;
      clarifiers: [];
      suggestedMilestones: null;
    }
  > = {};

  for (const id of dirtyIds) {
    const pursuitRow = DENSE_MAP_CONTEXT.themes
      .flatMap((t) => t.hubs.flatMap((h) => h.pursuits))
      .find((p) => p.id === id);
    const title = pursuitRow?.title ?? id;
    pursuits[id] = {
      tone: "informational",
      headline: `${title} — next step`,
      body: `${title} is on the map. One concrete move would clarify progress.`,
      clarifiers: [],
      suggestedMilestones: null,
    };
  }

  return {
    reading:
      "CeMAP qualification and Product Lead search sit in Work & Career with near deadlines. " +
      "£500,000 ISA and Clear £10,000 credit card debt carry weight in Money & Finance. " +
      "Plan wedding is active in People & Relationships. What is the smallest next action on CeMAP qualification?",
    themes: {
      work: {
        tone: "encouraging",
        oneLiner: "Work & Career is carrying the most weight",
        reflective: "CeMAP and Product Lead search are both active with deadlines in view.",
        contextual: "",
        combined: "Finishing CeMAP would unlock clearer options on the job search.",
      },
      finance: {
        tone: "encouraging",
        oneLiner: "Money goals are live alongside career pressure",
        reflective: "ISA and debt-clearing pursuits both sit in Money & Finance.",
        contextual: "",
        combined: "",
      },
    },
    pursuits,
  };
}

import { REFLECT_MAX_OUTPUT_TOKENS } from "@/lib/ai/reflect-call";

const LEGACY_REFLECT_MAX_OUTPUT_TOKENS = 2048;
const LEGACY_REFLECT_OUTPUT_CHAR_SAFE_LIMIT = 6000;

/** Max safe output chars (~75% of reflect token budget estimate). */
export const REFLECT_OUTPUT_CHAR_SAFE_LIMIT = Math.floor(
  LEGACY_REFLECT_OUTPUT_CHAR_SAFE_LIMIT *
    (REFLECT_MAX_OUTPUT_TOKENS / LEGACY_REFLECT_MAX_OUTPUT_TOKENS),
);

/**
 * Schema-max per pursuit (~600–900 chars): headline 100, body 500, 3 clarifiers, 6 milestones.
 * Used to measure whether a dense dirty run approaches the reflect truncation ceiling.
 */
export function buildMaxLoadedDenseReflectResponse(dirtyIds: string[]): {
  reading: string;
  pursuits: Record<
    string,
    {
      tone: "informational";
      headline: string;
      body: string;
      clarifiers: Array<{ id: string; prompt: string; options: string[] }>;
      suggestedMilestones: Array<{ title: string; description: string }>;
    }
  >;
} {
  const pursuits: Record<
    string,
    {
      tone: "informational";
      headline: string;
      body: string;
      clarifiers: Array<{ id: string; prompt: string; options: string[] }>;
      suggestedMilestones: Array<{ title: string; description: string }>;
    }
  > = {};

  for (const id of dirtyIds) {
    pursuits[id] = {
      tone: "informational",
      headline: "H".repeat(100),
      body: "B".repeat(500),
      clarifiers: [
        { id: "scope", prompt: "Which scope fits this pursuit?", options: ["Narrow", "Broad", "Unrelated"] },
        { id: "timeline", prompt: "What timeline are you on?", options: ["This month", "This quarter", "Not sure"] },
        { id: "priority", prompt: "How urgent is this?", options: ["High", "Medium", "Low"] },
      ],
      suggestedMilestones: Array.from({ length: 6 }, (_, i) => ({
        title: `Milestone step ${i + 1}`,
        description: "D".repeat(80),
      })),
    };
  }

  return {
    reading: "R".repeat(900),
    pursuits,
  };
}
