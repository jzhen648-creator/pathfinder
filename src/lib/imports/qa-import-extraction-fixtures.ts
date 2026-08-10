import type { ImportProviderContext } from "./ai-import-provider";
import type {
  ImportExtractionCandidate,
  ImportInformationType,
  ImportMemoryDestination,
  ImportSubjectType,
  ImportTemporalState,
} from "./qa-import-extraction-types";

export type ImportExtractionExpectation = {
  id: string;
  description: string;
  /** Every group must contribute at least one term to the matched candidate. */
  termGroups: string[][];
  destinations?: ImportMemoryDestination[];
  informationTypes?: ImportInformationType[];
  subjectTypes?: ImportSubjectType[];
  temporalStates?: ImportTemporalState[];
  classifications?: ImportExtractionCandidate["classification"][];
  targetGoalId?: string;
};

export type ImportExtractionForbiddenRule = {
  id: string;
  description: string;
  termGroups: string[][];
  when: (candidate: ImportExtractionCandidate) => boolean;
};

export type ImportExtractionQaFixture = {
  id: string;
  label: string;
  sourceText: string;
  context: ImportProviderContext;
  expectations: ImportExtractionExpectation[];
  forbidden: ImportExtractionForbiddenRule[];
  /** A tighter review-load gate for fixtures that should be nearly silent. */
  maxPrimary?: number;
};

const context: ImportProviderContext = {
  goals: [
    {
      id: "goal-career",
      title: "Secure a London mortgage-adviser role",
      background: "Qualified and applying for PAYE adviser roles after returning to Britain.",
    },
    {
      id: "goal-health",
      title: "Rebuild consistent strength and martial-arts training",
      background: "A sustainable weekly routine matters more than rapid weight loss.",
    },
    {
      id: "goal-property",
      title: "Resolve the Riverside flat transfer",
      background: "Jointly owned with a parent; transfer price and refinancing remain unresolved.",
    },
  ],
  observations: [
    {
      id: "obs-return-date-old",
      kind: "PLAN",
      canonicalText: "Maya expected to return to Manchester around October 2026.",
    },
    {
      id: "obs-flat-transfer",
      kind: "OPEN_QUESTION",
      canonicalText: "The Riverside flat transfer may pay Maya about £18,000, but the calculation is unresolved.",
    },
  ],
};

const commonExpectations: ImportExtractionExpectation[] = [
  {
    id: "identity-background",
    description: "Durable British-Indian identity context belongs in background, not a chapter.",
    termGroups: [["british-indian", "british indian"]],
    destinations: ["background"],
    informationTypes: ["fact", "context"],
    subjectTypes: ["user"],
  },
  {
    id: "return-date-update",
    description: "The latest exact return date should supersede the older approximate plan.",
    termGroups: [["16 august", "2026-08-16"], ["manchester", "return", "move"]],
    destinations: ["background", "chapter"],
    informationTypes: ["decision", "commitment", "event", "fact"],
    subjectTypes: ["user"],
    temporalStates: ["planned"],
  },
  {
    id: "career-target",
    description: "The active adviser-job work should update the existing career chapter.",
    termGroups: [["mortgage", "adviser"], ["application", "interview", "role", "job"]],
    destinations: ["chapter"],
    informationTypes: ["commitment", "event", "fact", "decision"],
    subjectTypes: ["user"],
    targetGoalId: "goal-career",
  },
  {
    id: "property-unresolved",
    description: "Competing flat-transfer values should remain an unresolved property tension.",
    termGroups: [["riverside", "flat", "property"], ["18,000", "36,000", "transfer", "equity"]],
    destinations: ["chapter"],
    informationTypes: ["tension", "open_question", "fact"],
    subjectTypes: ["user", "shared"],
    temporalStates: ["unresolved", "current", "unknown"],
    targetGoalId: "goal-property",
  },
];

const commonForbidden: ImportExtractionForbiddenRule[] = [
  {
    id: "assistant-car-advice",
    description: "Assistant advice to buy a car must not become user memory or a chapter.",
    termGroups: [["electric suv", "car", "vehicle"], ["buy", "purchase"]],
    when: (candidate) =>
      candidate.subjectType === "user" &&
      candidate.memoryDestination !== "source_only" &&
      !/\b(?:not|never|reject(?:ed|ing)?|refus(?:e|ed|ing))\b.{0,45}\b(?:buy(?:ing)?|purchas(?:e|ing)|leas(?:e|ing))\b|\b(?:buy(?:ing)?|purchas(?:e|ing)|leas(?:e|ing))\b.{0,45}\b(?:not|never|reject(?:ed|ing)?|refus(?:e|ed|ing))\b/i.test(
        candidate.proposedText,
      ),
  },
  {
    id: "brother-apprenticeship-as-user",
    description: "A sibling's apprenticeship must not be classified as the user's fact or chapter.",
    termGroups: [["brother", "sibling"], ["apprentice", "apprenticeship"]],
    when: (candidate) =>
      candidate.subjectType === "user" || candidate.classification === "new_chapter",
  },
  {
    id: "hypothetical-cafe-chapter",
    description: "A hypothetical café idea must not create an active chapter.",
    termGroups: [["café", "cafe"], ["open", "launch", "start"]],
    when: (candidate) => candidate.classification === "new_chapter",
  },
];

export const IMPORT_EXTRACTION_QA_FIXTURES: ImportExtractionQaFixture[] = [
  {
    id: "first-import-prompt-output",
    label: "First-import prompt output",
    context: { goals: [], observations: [] },
    sourceText: `Almanac Snapshot — generated 10 August 2026

0. My active areas
- Mortgage adviser career — securing the first role and building experience will still matter in six months.
- Riverside flat decision — resolving ownership and refinancing will still matter in six months.
- Sustainable training — establishing a repeatable routine will still matter in six months.

1. Snapshot scope and limitations
This summary uses only the current project conversation and saved memory exposed here. Dates or facts may be incomplete.

2. The short version
Maya is preparing to return to Manchester on 16 August 2026 and consolidate her work, home and health plans.

3. Stable background and identity
[User-stated | current | date unknown] Maya is British-Indian, Manchester is home, and her ties to India are an enduring part of her identity.

4. Important people and relationships
[User-stated | current | date unknown] Maya expects to stay with her mother for several months after returning.
[Unresolved] Maya's partner may later move to Britain, but the legal route and timing are not confirmed.

5. Current life chapters

### Mortgage adviser career
[User-stated | current | 1 August 2026] Maya completed her mortgage-advice qualification, submitted twelve applications for PAYE adviser roles, and has two interviews booked after she returns.

### Riverside flat decision
[Unresolved] Maya jointly owns the Riverside flat with her father. A proposed transfer payment is £18,000, while a rough half share of gross equity appears closer to £36,000 before legal, tax and refinancing costs. No amount is settled.

### Sustainable training
[User-stated | current | 1 August 2026] Maya has completed two strength sessions each week for three weeks. Adding boxing after the move is planned, not completed.

6. Goals, possibilities, and ideas not yet committed
[User-stated | possible | date unknown] Maya has wondered about opening a café, but has done no research and is not pursuing it.

7. Confirmed decisions and commitments
[User-stated | current | 1 August 2026] Maya will not buy or lease a vehicle before customer demand is validated.

8. Unresolved questions and contradictions
[Unresolved] The Riverside transfer value and Maya's partner's immigration timing remain unresolved.

9. AI analysis and advice — not my facts or commitments
[AI advice | not my commitment] An assistant suggested buying an electric SUV for a possible tour business.`,
    expectations: [
      {
        id: "first-import-identity",
        description: "The prompt's durable identity material becomes background.",
        termGroups: [["british-indian", "british indian"]],
        destinations: ["background"],
        informationTypes: ["fact", "context"],
        subjectTypes: ["user"],
      },
      {
        id: "first-import-career-chapter",
        description: "The named active career situation becomes an editable new chapter.",
        termGroups: [["mortgage", "adviser"], ["applications", "interviews"]],
        destinations: ["chapter"],
        classifications: ["new_chapter"],
        subjectTypes: ["user"],
      },
      {
        id: "first-import-property-chapter",
        description: "The unresolved property situation becomes one new chapter, not two balances.",
        termGroups: [["riverside", "flat"], ["18,000", "36,000", "transfer"]],
        destinations: ["chapter"],
        classifications: ["new_chapter"],
        informationTypes: ["tension", "open_question", "fact"],
        temporalStates: ["unresolved", "current", "unknown"],
      },
      {
        id: "first-import-health-chapter",
        description: "Observed training consistency becomes a new chapter while planned boxing stays planned.",
        termGroups: [["strength", "training"], ["three weeks", "two"]],
        destinations: ["chapter"],
        classifications: ["new_chapter"],
        subjectTypes: ["user"],
      },
      {
        id: "first-import-partner-unresolved",
        description: "The partner move remains shared or other-person context and unresolved.",
        termGroups: [["partner"], ["britain", "legal", "timing"]],
        destinations: ["background", "source_only", "possibility"],
        subjectTypes: ["shared", "other_person"],
        temporalStates: ["unresolved", "possible", "unknown"],
      },
    ],
    forbidden: [
      ...commonForbidden,
      {
        id: "first-import-area-heading-only",
        description: "An area heading alone must not become a content-free chapter.",
        termGroups: [["six months"], ["active areas", "area"]],
        when: (candidate) => candidate.classification === "new_chapter",
      },
    ],
  },
  {
    id: "structured-snapshot",
    label: "Structured life Snapshot",
    context,
    sourceText: `Maya's life — as of 1 August 2026

Background
Maya is a British-Indian woman whose family life spans Britain and India. Manchester is home, while her Indian heritage remains an important part of her identity. Her younger brother is an engineering apprentice; that apprenticeship is his situation, not Maya's career.

Current transition
Older notes said Maya might return to Manchester in October 2026. Her latest confirmed plan is to return on 16 August 2026, and she has booked the flight.

Career
Maya has completed her mortgage-advice qualification. She has submitted twelve applications for PAYE mortgage-adviser roles and has two interviews booked for the week after she returns. This is progress on her existing career chapter, not a new career.

Property
Maya jointly owns the Riverside flat with her father. They have discussed paying her £18,000 for a transfer, while a simple half share of the estimated gross equity looks closer to £36,000. Legal costs, tax and refinancing are not settled, so the amount remains unresolved.

Health
She has restarted two strength sessions each week and intends to add one boxing class after the move. She is not promising rapid weight loss; the commitment is to rebuild consistency.

Possibilities
Maya has wondered whether she might someday open a café, but she has not researched it and is not pursuing it. An assistant suggested buying an electric SUV for a possible tour business. Maya explicitly said she will not buy a vehicle before validating customer demand.`,
    expectations: [
      ...commonExpectations,
      {
        id: "health-progress",
        description: "Restarted training should update the existing health chapter.",
        termGroups: [["strength", "boxing", "training"], ["two", "restart", "consistency"]],
        destinations: ["chapter"],
        informationTypes: ["event", "commitment", "fact"],
        subjectTypes: ["user"],
        targetGoalId: "goal-health",
      },
    ],
    forbidden: commonForbidden,
  },
  {
    id: "ordinary-conversation",
    label: "Ordinary AI conversation",
    context,
    sourceText: `User: I used to say October, but I've now booked my flight back to Manchester for 16 August 2026.

Assistant: Great. You should probably buy an electric SUV immediately so you can start premium tours as soon as you land.

User: No, that is exactly what I do not want to do. I am not buying a vehicle before I prove demand. I have started customer discovery, though: I booked five interviews with Mandarin-speaking visitors for late August. Treat the interviews as a real experiment, not the tour business as proven.

Assistant: Then the café you mentioned could be your backup business.

User: The café was idle speculation. Please do not turn it into a project. My serious priority is the mortgage-adviser job. I sent twelve applications and have two interviews after I return.

Assistant: Is the Riverside transfer paying you £18,000 settled?

User: No. My father mentioned £18,000, but a rough half share of equity looks closer to £36,000 before costs. The legal, tax and refinance position still needs checking.

User: Health update: I have actually completed two strength sessions per week for the last three weeks. I may add boxing after the move, but that part is only planned.

User: For context, I'm British-Indian and the India–Britain connection matters to me. My brother is an engineering apprentice; that fact is about him, not me.`,
    expectations: [
      ...commonExpectations,
      {
        id: "tour-discovery-new-chapter",
        description: "A started, evidenced customer-discovery experiment may become a new chapter.",
        termGroups: [["customer discovery", "interviews"], ["mandarin", "visitors", "tour"]],
        destinations: ["chapter"],
        informationTypes: ["event", "commitment"],
        subjectTypes: ["user"],
      },
      {
        id: "health-current-and-planned",
        description: "Completed strength sessions are current evidence while boxing remains planned.",
        termGroups: [["strength"], ["three weeks", "completed", "two"]],
        destinations: ["chapter"],
        informationTypes: ["event", "fact"],
        subjectTypes: ["user"],
        temporalStates: ["current", "ongoing", "past"],
        targetGoalId: "goal-health",
      },
    ],
    forbidden: commonForbidden,
  },
  {
    id: "large-multi-chapter-summary",
    label: "Large multi-chapter summary",
    context,
    sourceText: `Maya Patel — consolidated life summary as of 1 August 2026

OVERVIEW
Maya is a British-Indian woman entering a deliberate transition back to Manchester. She previously discussed returning in October 2026, but the latest confirmed date is 16 August 2026 and the flight is booked. Manchester is home; her ties to India remain a durable part of her identity rather than a project to complete.

FAMILY AND RELATIONSHIPS
Maya expects to stay with her mother for several months after returning. Her younger brother is an engineering apprentice. His job and income are his information. They matter only where a shared housing decision explicitly involves him. Maya's partner may later move to Britain, but the legal route and timing are unresolved. It would be inaccurate to describe the move as approved or scheduled.

CAREER
Maya completed her mortgage-advice qualification earlier in 2026. Her existing career chapter is to secure a PAYE mortgage-adviser role in Manchester. She has now submitted twelve applications and booked two first-round interviews for the week after 16 August. Higher future earnings remain aspirations, not current income. She is not simultaneously launching a financial-advice firm.

PROPERTY
Maya jointly owns the Riverside flat with her father. The working transfer conversation mentioned a payment of £18,000. A rough half share of current gross equity appears closer to £36,000 before legal, refinancing and tax costs. Neither number is a confirmed settlement. Her father's refinancing capacity and the final ownership sequence remain unresolved. This belongs with the existing Riverside property chapter and should not be duplicated as separate finance and family projects.

HEALTH
Maya has completed two strength sessions each week for three consecutive weeks. She plans to add one boxing class after returning, but has not started it. Her aim is sustainable consistency; rapid weight-loss language from older chats should not be treated as a current commitment. This updates the existing health chapter.

CREATOR AND BUSINESS IDEAS
Maya has discussed several ideas: a café, video editing, a property calculator and premium tours. The café was idle speculation and should not become an active chapter. Video editing is not currently being pursued. The property calculator has no committed next action. Premium tours have moved one step further: Maya has booked five customer-discovery interviews with Mandarin-speaking visitors for late August. That experiment is active and may justify a small emerging chapter, but there are no customers or validated revenue yet.

An AI assistant recommended buying an electric SUV immediately for the tour idea. Maya rejected that advice. She decided she will not buy or lease a vehicle before customer demand is validated. The assistant's recommendation is source material, not Maya's plan.

FINANCES
Maya has approximately £24,000 invested. An older note estimated £20,000, so the newer amount is an approximate update rather than two balances to add together. She also has student debt. A previously mentioned credit-card balance is now unknown and should remain unresolved rather than assumed to be zero. Long-term investment targets are aspirations, not present assets.

PRIORITIES FOR THE NEXT 90 DAYS
1. Return to Manchester on 16 August 2026.
2. Continue the mortgage-adviser application and interview pipeline.
3. Maintain two weekly strength sessions and add boxing only after the move settles.
4. Resolve the Riverside transfer using lender, legal and tax figures rather than the informal £18,000 number.
5. Complete five tour customer interviews without purchasing a vehicle.

WHAT IS NOT DECIDED
Maya has not decided to open a café. She has not decided to buy an electric SUV. Her partner's immigration date is not confirmed. The Riverside transfer payment is not settled. Potential future earnings are not current income.

REPEATED CONTEXT
For clarity, the latest return date is 16 August 2026, not October. The mortgage-adviser applications and two interviews are the same career progress described above, not a second job search. The five Mandarin-tour interviews repeat the same customer-discovery experiment, not five separate projects. Maya is British-Indian; that identity supports the whole Almanac and should not become a Map chapter.`,
    expectations: [
      ...commonExpectations,
      {
        id: "health-large",
        description: "Observed strength consistency should update the health chapter without treating boxing as completed.",
        termGroups: [["strength"], ["three", "consecutive", "weekly"]],
        destinations: ["chapter"],
        informationTypes: ["event", "fact", "commitment"],
        subjectTypes: ["user"],
        targetGoalId: "goal-health",
      },
      {
        id: "tour-large",
        description: "The bounded tour-discovery experiment may be an emerging chapter, not a proven business.",
        termGroups: [["customer", "interviews"], ["mandarin", "tour", "visitors"]],
        destinations: ["chapter"],
        informationTypes: ["event", "commitment"],
        subjectTypes: ["user"],
      },
      {
        id: "investment-update",
        description: "The newer approximate investment amount should be an update, not added to the old amount.",
        termGroups: [["24,000", "£24,000"], ["invested", "investment"]],
        destinations: ["background"],
        informationTypes: ["fact"],
        subjectTypes: ["user"],
        temporalStates: ["current"],
      },
      {
        id: "partner-unresolved",
        description: "A partner's possible move must remain shared and unresolved.",
        termGroups: [["partner"], ["immigration", "move", "britain"]],
        destinations: ["background", "source_only", "possibility"],
        informationTypes: ["open_question", "possibility", "context", "fact"],
        subjectTypes: ["shared", "other_person"],
        temporalStates: ["unresolved", "possible", "unknown"],
      },
    ],
    forbidden: commonForbidden,
  },
  {
    id: "repeat-update-quietness",
    label: "Repeat update quietness",
    context: {
      goals: context.goals,
      observations: [
        {
          id: "obs-return-date-current",
          kind: "PLAN",
          canonicalText: "Maya is returning to Manchester on 16 August 2026 and the flight is booked.",
        },
        {
          id: "obs-career-pipeline",
          kind: "EVENT",
          canonicalText: "Maya submitted twelve mortgage-adviser applications and booked two interviews.",
        },
        {
          id: "obs-health-routine",
          kind: "EVENT",
          canonicalText: "Maya completed two strength sessions per week for three consecutive weeks.",
        },
        {
          id: "obs-property-unresolved-current",
          kind: "OPEN_QUESTION",
          canonicalText: "The Riverside transfer is unresolved between an informal £18,000 figure and roughly £36,000 gross equity before costs.",
        },
        {
          id: "obs-identity-current",
          kind: "FACT",
          canonicalText: "Maya is British-Indian and Manchester is home.",
        },
      ],
    },
    sourceText: `Update from 10 August 2026.

The flight back to Manchester is still booked for 16 August 2026. I am still British-Indian and Manchester is still home. The Riverside transfer is still unresolved between the informal £18,000 figure and roughly £36,000 gross equity before costs. I am still completing two strength sessions per week.

The actual change is in my mortgage-adviser search: I completed the first of the two booked interviews on 9 August 2026. The second interview is still scheduled. I have not received an offer and I have not accepted a job.`,
    expectations: [
      {
        id: "repeat-career-interview-update",
        description: "Only the newly completed interview should require a material review decision.",
        termGroups: [["mortgage", "adviser"], ["completed", "first"], ["interview"]],
        destinations: ["chapter"],
        classifications: ["update"],
        informationTypes: ["event", "fact"],
        subjectTypes: ["user"],
        targetGoalId: "goal-career",
      },
    ],
    forbidden: [
      {
        id: "repeat-no-job-offer",
        description: "The absence of an offer must not become an accepted role or commitment.",
        termGroups: [["offer", "job"], ["received", "accepted"]],
        when: (candidate) =>
          candidate.memoryDestination !== "source_only" &&
          !/\b(?:not|no)\b/i.test(candidate.proposedText),
      },
      {
        id: "repeat-no-new-chapter",
        description: "Repeated facts and one interview update must not create a new chapter.",
        termGroups: [["manchester", "riverside", "strength", "interview"]],
        when: (candidate) => candidate.classification === "new_chapter",
      },
    ],
    maxPrimary: 1,
  },
];
