/**
 * Stream extraction dogfood — stress-tests POST /api/stream/extract (no commit).
 *
 * Run: npm run dogfood:stream
 * Flags: --json | --slow | --only <category>
 * Requires: dev server (port 3001), GEMINI_API_KEY, E2E_EMAIL + E2E_PASSWORD
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

import {
  buildQueue,
  streamCardVariant,
  type ConfirmationKind,
} from "./lib/stream-dogfood-queue";
import type { LifeAreaId } from "../src/lib/types";
import { validHubLabelKeysForTheme } from "../src/lib/taxonomy";
import { systemHubKey } from "../src/lib/system-categories";
import type {
  ExtractedMilestone,
  ExtractedPursuit,
  StreamBloomStatus,
  StreamExtractResponse,
} from "../src/types/stream";
import {
  apiFetch,
  defaultScriptCredentials,
  getApiBaseUrl,
  loginWithCredentials,
  type ScriptSession,
} from "./lib/script-http";

const prisma = new PrismaClient();

const DEV_EMAIL = process.env.E2E_EMAIL ?? "jzhen648@gmail.com";
const BASE_URL = getApiBaseUrl();
const DEFAULT_EXTRACT_DELAY_MS = 7000;
const SLOW_EXTRACT_DELAY_MS = 12000;
const EXTRACT_DELAY_MS = Number(
  process.env.EXTRACT_DELAY_MS ??
    (process.argv.includes("--slow") ? SLOW_EXTRACT_DELAY_MS : DEFAULT_EXTRACT_DELAY_MS),
);
const EXTRACT_TIMEOUT_MS = Number(process.env.EXTRACT_TIMEOUT_MS ?? "90000");
const creds = defaultScriptCredentials();
const E2E_EMAIL = process.env.E2E_EMAIL ?? creds.email;
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? creds.password;

type AnomalySeverity = "critical" | "warning";

type Anomaly = {
  code: string;
  severity: AnomalySeverity;
  message: string;
};

type ScenarioCategory =
  | "multi-session"
  | "mixed-theme-dumps"
  | "cross-theme-events"
  | "emotional-reflective"
  | "vague-uncertain"
  | "uk-london-specifics"
  | "long-brain-dumps"
  | "milestone-status"
  | "contradictory-pivots"
  | "people-connection-framing";

const SCENARIO_CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  "multi-session": "Multi-session sequences",
  "mixed-theme-dumps": "Mixed theme dumps",
  "cross-theme-events": "Cross-theme life events",
  "emotional-reflective": "Emotional and reflective",
  "vague-uncertain": "Vague and uncertain",
  "uk-london-specifics": "UK/London cultural specifics",
  "long-brain-dumps": "Very long brain dumps",
  "milestone-status": "Milestone completions and status updates",
  "contradictory-pivots": "Contradictory and pivot inputs",
  "people-connection-framing": "People hub connection title framing",
};

type CategorySummary = {
  total: number;
  passCount: number;
  passRate: number;
  extractionRate: number;
  misplacementCount: number;
  errorCount: number;
};

type DogfoodExpect = {
  minStructured?: number;
  maxStructured?: number;
  kinds?: ConfirmationKind[];
  hubSlug?: string;
  hubSlugs?: string[];
  continuation?: boolean;
  continuationOfGoalId?: string;
  milestone?: boolean;
  milestoneOnGoalId?: string;
  existingGoalId?: string;
  bloomStatus?: StreamBloomStatus;
  forbidNewPursuit?: boolean;
  preferAmbiguous?: boolean;
  /** At least one new pursuit title must include one of these (case-insensitive). */
  pursuitTitleOneOfSubstrings?: string[];
  /** New pursuit titles must not include any of these (case-insensitive). */
  pursuitTitleForbiddenSubstrings?: string[];
  /** At least one mark or milestone title must include one of these (case-insensitive). */
  markOrMilestoneTitleOneOfSubstrings?: string[];
  /** Theme extract: no item may use these hub slugs. */
  forbidHubSlugs?: string[];
};

type DogfoodCase = {
  id: string;
  category: ScenarioCategory;
  label: string;
  mode: "theme" | "hub";
  themeId?: LifeAreaId;
  hubBranchId?: string;
  hubSlug?: string;
  input: string;
  expect: DogfoodExpect;
};

type ExtractedLogRow = {
  cardType: string;
  hubPlacement: string;
  confidence: "ok" | "low";
  title: string;
  parentRef: string | null;
};

type CaseResult = {
  id: string;
  category: ScenarioCategory;
  label: string;
  pass: boolean;
  input: string;
  mode: "theme" | "hub";
  status: number | null;
  error: string | null;
  extracted: ExtractedLogRow[];
  ambiguousCount: number;
  committedAmbiguousCount: number;
  structuredCount: number;
  anomalies: Anomaly[];
  durationMs: number;
};

type DogfoodReport = {
  runAt: string;
  userEmail: string;
  baseUrl: string;
  mapSnapshot: {
    goalCount: number;
    markCount: number;
    branchCount: number;
  };
  fixturesUsed: string[];
  summary: {
    total: number;
    extractionRate: number;
    misplacementCount: number;
    errorCount: number;
    passCount: number;
    passRate: number;
    byCategory: Record<ScenarioCategory, CategorySummary>;
  };
  results: CaseResult[];
};

// ——— Phase 1: load map ———

type MapGoal = {
  id: string;
  title: string;
  categoryId: string | null;
  themeId: string;
  status: string;
  parentGoalId: string | null;
  hubSlug: string | null;
};

type MapSnapshot = {
  userEmail: string;
  userId: string;
  branches: Array<{
    id: string;
    themeId: string;
    label: string;
    hubSlug: string;
  }>;
  goals: MapGoal[];
  marks: Array<{ id: string; title: string; categoryId: string | null; limbId: string }>;
  titleByRef: Map<string, string>;
  branchByThemeHub: Map<string, string>;
};

async function loadMap(): Promise<MapSnapshot> {
  const user = await prisma.user.findUnique({
    where: { email: DEV_EMAIL },
    select: { id: true, email: true },
  });
  if (!user?.email) {
    throw new Error(`Dev user not found: ${DEV_EMAIL}`);
  }

  const branches = await prisma.themeCategory.findMany({
    where: { userId: user.id, parentCategoryId: null },
    select: { id: true, themeId: true, label: true, name: true, isActive: true },
    orderBy: { order: "asc" },
  });

  const branchRows = branches.map((b) => ({
    id: b.id,
    themeId: b.themeId,
    label: b.label ?? b.name ?? "",
    hubSlug: systemHubKey(b.themeId, b.label ?? b.name).split("::")[1] ?? "",
  }));

  const branchByThemeHub = new Map<string, string>();
  for (const b of branchRows) {
    branchByThemeHub.set(`${b.themeId}::${b.hubSlug}`, b.id);
  }

  const goalsRaw = await prisma.goal.findMany({
    where: {
      userId: user.id,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: {
      id: true,
      title: true,
      categoryId: true,
      status: true,
      parentGoalId: true,
      themeCategory: { select: { themeId: true, label: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const goals: MapGoal[] = goalsRaw.map((g) => {
    const limbId = g.themeCategory?. ?? "work";
    const hubSlug = g.branch
      ? systemHubKey(limbId, g.themeCategory. ?? g.themeCategory.).split("::")[1] ?? null
      : null;
    return {
      id: g.id,
      title: g.title,
      categoryId: g.categoryId,
      limbId,
      status: g.status,
      parentGoalId: g.parentGoalId,
      hubSlug,
    };
  });

  const marks = await prisma.mark.findMany({
    where: { userId: user.id, archived: false },
    select: { id: true, title: true, categoryId: true, themeId: true },
    orderBy: { date: "desc" },
    take: 200,
  });

  const titleByRef = new Map<string, string>();
  for (const g of goals) titleByRef.set(g.id, g.title);

  return {
    userEmail: user.email,
    userId: user.id,
    branches: branchRows,
    goals,
    marks,
    titleByRef,
    branchByThemeHub,
  };
}

function findGoal(
  map: MapSnapshot,
  predicate: (g: MapGoal) => boolean,
): MapGoal | undefined {
  return map.goals.find(predicate);
}

// ——— Phase 2: test cases ———

function themeCase(
  category: ScenarioCategory,
  id: string,
  label: string,
  themeId: LifeAreaId,
  input: string,
  expect: DogfoodExpect,
): DogfoodCase {
  return { id, category, label, mode: "theme", themeId, input, expect };
}

function hubCase(
  category: ScenarioCategory,
  id: string,
  label: string,
  map: MapSnapshot,
  themeId: LifeAreaId,
  hubSlug: string,
  input: string,
  expect: DogfoodExpect,
): DogfoodCase | null {
  const branchId = map.branchByThemeHub.get(`${themeId}::${hubSlug}`);
  if (!branchId) return null;
  return {
    id,
    category,
    label,
    mode: "hub",
    themeId,
    hubBranchId: branchId,
    hubSlug,
    input,
    expect,
  };
}

const GOAL_FRAMED_TITLE_SUBSTRINGS = [
  "improve relationship",
  "invest in relationship",
  "invest in family",
  "advance relationship",
  "work on relationship",
  "strengthen relationship",
  "build relationship",
];

function buildPeopleConnectionCases(map: MapSnapshot): DogfoodCase[] {
  const cases: Array<DogfoodCase | null> = [
    hubCase(
      "people-connection-framing",
      "people-james-friendships",
      "Friendships — James reconnect and Manchester visit",
      map,
      "people",
      "friendships",
      "James has been one of my closest friends since uni. We haven't spoken much lately and I want to change that. Planning to visit him in Manchester next month.",
      {
        minStructured: 2,
        maxStructured: 6,
        kinds: ["pursuit"],
        pursuitTitleOneOfSubstrings: ["james", "friendship with james"],
        pursuitTitleForbiddenSubstrings: GOAL_FRAMED_TITLE_SUBSTRINGS,
        markOrMilestoneTitleOneOfSubstrings: ["manchester", "visit"],
        milestone: true,
      },
    ),
    hubCase(
      "people-connection-framing",
      "people-mum-family",
      "Family — call Mum more often",
      map,
      "people",
      "family",
      "I need to be better at calling my mum. She's getting older and I don't want to regret not spending more time with her.",
      {
        minStructured: 2,
        maxStructured: 6,
        kinds: ["pursuit", "milestone"],
        pursuitTitleOneOfSubstrings: ["mum", "mother", "mom"],
        pursuitTitleForbiddenSubstrings: GOAL_FRAMED_TITLE_SUBSTRINGS,
        markOrMilestoneTitleOneOfSubstrings: ["call", "weekly", "phone", "ring"],
        milestone: true,
      },
    ),
    hubCase(
      "people-connection-framing",
      "people-sarah-romance",
      "Romance — Sarah and moving in together",
      map,
      "people",
      "romance",
      "Sarah and I have been together three years. We've been talking about moving in together and I want to make that happen this year.",
      {
        minStructured: 2,
        maxStructured: 6,
        kinds: ["pursuit", "milestone"],
        pursuitTitleOneOfSubstrings: ["sarah", "our relationship", "our marriage", "partner"],
        pursuitTitleForbiddenSubstrings: GOAL_FRAMED_TITLE_SUBSTRINGS,
        markOrMilestoneTitleOneOfSubstrings: ["mov", "together", "cohabit", "flat", "house"],
        milestone: true,
      },
    ),
    themeCase(
      "people-connection-framing",
      "people-community-friendships",
      "Community (Friendships hub) — local London involvement",
      "people",
      "I want to get more involved in my local area in London. Maybe join a running club or volunteer somewhere.",
      {
        minStructured: 2,
        maxStructured: 6,
        kinds: ["pursuit", "milestone"],
        hubSlug: "friendships",
        hubSlugs: ["friendships"],
        forbidHubSlugs: ["family", "romance"],
        pursuitTitleForbiddenSubstrings: [
          ...GOAL_FRAMED_TITLE_SUBSTRINGS,
          "get more involved in",
          "improve social",
        ],
        markOrMilestoneTitleOneOfSubstrings: [
          "running",
          "volunteer",
          "club",
          "local",
          "london",
          "community",
        ],
        milestone: true,
      },
    ),
  ];
  return cases.filter((c): c is DogfoodCase => c !== null);
}

const richDogfoodCases: DogfoodCase[] = [
  themeCase(
    "multi-session",
    "rich-multi-work-adviser-youtube",
    "Rich multi-session — adviser path, CEMAP and YouTube",
    "work",
    "Right, work update in one go rather than three tiny ones. I passed a CEMAP mock on 15 March with 82%, booked Module 1 for the 28th, and I want the actual adviser move to be more than pub chat now. Short term it is finish CEMAP, shadow two mortgage calls with Sam, and ask about a trainee adviser title by September. Longer term, if that works, I want to continue towards IFA rather than stay only in mortgages. Also I filmed a YouTube video about ISA basics on Sunday and felt weirdly proud, so that should probably sit as a build thing, not a career promotion.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["career", "skills", "builds & launches"],
      milestone: true,
      continuation: true,
    },
  ),
  themeCase(
    "multi-session",
    "rich-multi-finance-isa-debt-buffer",
    "Rich multi-session — ISA, credit card and safety buffer",
    "finance",
    "Money check-in: I hit £5k in the stocks and shares ISA on 5 April, which feels like the first adult thing I have done in ages. I still want to carry that to £10k by Christmas and £15k by next tax year, but I cannot pretend the Barclaycard is fine; it is £2,590 after the flight and laptop bits, and I want it gone by August. I also need a proper visa and rent buffer, maybe £3k in easy-access cash, because if the solicitor bill lands at the same time as a rent rise I will panic. So this is assets, liabilities and safety net all tangled together.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["assets", "liabilities", "safety net"],
      continuation: true,
    },
  ),
  themeCase(
    "multi-session",
    "rich-multi-health-5k-10k-reset",
    "Rich multi-session — 5k, 10k, meal prep and sleep",
    "health",
    "Health update, and it is a bit embarrassingly linked to everything else. I ran my first 5k round Victoria Park on 5 April in 31 minutes, which should be a proper mark because I genuinely did it. Next chapter is a 10k by the end of August, but not if my knees start moaning. I also meal prepped chicken rice bowls on Sunday and only bought Pret twice, so the food thing is finally moving. Sleep is still the weak spot; I keep revising or editing YouTube until 1am, so I want a 10:45 lights-out rule Sunday to Thursday as the foundation, not another heroic fitness goal.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["movement", "nutrition", "rest"],
      milestone: true,
      continuation: true,
    },
  ),
  themeCase(
    "mixed-theme-dumps",
    "rich-mixed-work-client-skills-build",
    "Rich mixed dump — client win, qualification and portfolio",
    "work",
    "Work has been messy but good. On 11 April I handled most of the Henderson remortgage case myself and the adviser said the client feedback was excellent, so that feels like a career mark rather than a vague mood. At the same time, I booked CEMAP Module 1 and need a revision plan because winging it is not a strategy. I also want to rebuild my LinkedIn and put the first two YouTube finance videos somewhere sensible, almost like a portfolio. I am not sure if LinkedIn is career or skills, but the qualification is definitely skills and the videos feel like builds.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["career", "skills", "builds & launches"],
      milestone: true,
    },
  ),
  themeCase(
    "mixed-theme-dumps",
    "rich-mixed-finance-visa-rent-isa",
    "Rich mixed dump — visa money, rent pressure and ISA",
    "finance",
    "Scattered money dump: the ISA is £6,250 as of 1 June, which is good, but the spousal visa numbers are starting to look brutal. I need roughly £3k for solicitor, NHS surcharge and translations, and the landlord has put Zone 2 rent up by £85 from July. I paid £500 off the Barclaycard after payday, but I do not want to call that progress if I immediately reload it with visa bits. The sensible extraction is probably an assets mark, a liabilities mark, and a safety-net pursuit for the visa and rent shock pot.",
    {
      minStructured: 4,
      maxStructured: 8,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["assets", "liabilities", "safety net"],
    },
  ),
  themeCase(
    "mixed-theme-dumps",
    "rich-mixed-people-romance-family-friends",
    "Rich mixed dump — girlfriend visit, parents and friends",
    "people",
    "People update: my girlfriend has her Bangkok visa appointment on 18 June, and I am excited but quietly terrified. Mum keeps asking when she will meet her, Dad has gone a bit silent, and I want to arrange a Kent Sunday lunch while she is here rather than making it a huge performance. I also realised I have barely seen Tom or Aisha since February because every weekend is CEMAP, visa documents or WhatsApp calls. So there is a romance milestone, a family pursuit, and probably a friendships pursuit about seeing people monthly again before the relationship becomes my whole social life.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["pursuit", "milestone"],
      hubSlugs: ["romance", "family", "friendships"],
      milestone: true,
    },
  ),
  themeCase(
    "cross-theme-events",
    "rich-event-redundancy-work",
    "Rich cross-theme event — redundancy and direction",
    "work",
    "I got made redundant on 17 April, which is a proper shock and I am still a bit numb. For the map, the actual work bit is that it has forced the mortgage adviser question into the open: do I rush into another admin role, or use the gap to finish CEMAP and aim straight for trainee adviser roles? I spoke to Sam and he thinks the client-facing route is realistic if I can show the qualification is moving. It also obviously hits money and confidence, but in this theme I want a career mark for the redundancy, a skills milestone for CEMAP, and a new pursuit for getting back into advice work.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["career", "skills"],
      milestone: true,
    },
  ),
  themeCase(
    "cross-theme-events",
    "rich-event-engagement-people",
    "Rich cross-theme event — engagement, family and visa",
    "people",
    "We got engaged last Saturday on the South Bank near Waterloo, 9 August, and I am honestly over the moon. But within about twelve hours my brain went straight to visa evidence, families meeting properly, where we would live, and whether we are being romantic or reckless. The engagement itself is clearly a romance mark. The next pursuit is preparing the spousal visa without losing the joy of it, with milestones for a solicitor call and gathering screenshots, flights and payslips. I also need a family step: tell Dad properly and plan a normal lunch, not a dramatic announcement.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["romance", "family"],
      milestone: true,
    },
  ),
  themeCase(
    "cross-theme-events",
    "rich-event-bonus-finance",
    "Rich cross-theme event — bonus allocation",
    "finance",
    "Bonus landed on 25 March, £4,800 after tax, and I am trying not to do the classic London thing of feeling rich for two weeks then wondering where it went. I want £2k to clear most of the Barclaycard, £1,500 into the ISA before tax year end, and £1k ring-fenced for Thailand flights or visa costs. There is also a little bit of emotion here, because past me would have spent it on gadgets and weekends away. But extract the money bits: income mark for the bonus, liabilities milestone, assets mark or pursuit, and safety-net buffer.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "milestone"],
      hubSlugs: ["income", "liabilities", "assets", "safety net"],
      milestone: true,
    },
  ),
  themeCase(
    "emotional-reflective",
    "rich-reflective-purpose-inner-life",
    "Rich reflective — proving myself versus purpose",
    "becoming",
    "Therapy on 17 March was one of those annoying sessions where nothing dramatic happened but I left feeling exposed. I realised I keep turning every goal into proof that I am not behind: CEMAP means I am serious, ISA means I am responsible, the visa means I am committed, gym means I am disciplined. It is exhausting. The mark is probably that realisation, not a new productivity project. But I do want a pursuit to write a one-page life direction note by 30 April, because I need to know what all this effort is actually serving. It sits between inner life and purpose, so please do not shove everything into career.",
    {
      minStructured: 2,
      maxStructured: 6,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["inner life", "purpose"],
    },
  ),
  themeCase(
    "emotional-reflective",
    "rich-reflective-body-confidence",
    "Rich reflective — appearance, confidence and movement",
    "health",
    "This sounds vain, but I hated the photos from 1 May. Not in a crisis way, more that familiar little flinch where I avoid mirrors and say I will sort myself out next Monday. I booked a decent haircut in Shoreditch, bought SPF and cleanser, and want to feel less awkward in YouTube thumbnails before my girlfriend visits. There is also a real health bit: keep running twice a week and stop using takeaways as comfort after long days. I think the photo feeling is an appearance mark, the haircut and skincare are milestones, and the running should stay movement rather than becoming another body-image spiral.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["appearance", "movement", "nutrition"],
      milestone: true,
    },
  ),
  themeCase(
    "emotional-reflective",
    "rich-reflective-joy-london-lonely",
    "Rich reflective — loneliness, joy and friendship",
    "becoming",
    "London has felt lonely in that daft way where you are surrounded by people but still feel separate. On 16 May I walked over London Bridge after work and thought, I am building quite a sensible life, but I am not sure I am enjoying much of it. I want to protect one proper joy thing a week: Thai food, a walk, a film, anything that is not CEMAP, ISA, visa or gym. I also need to see friends, but in this theme the main thing is the realisation and a joy pursuit, not a calendar admin task.",
    {
      minStructured: 2,
      maxStructured: 6,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["inner life", "joy"],
    },
  ),
  themeCase(
    "vague-uncertain",
    "rich-vague-work-skills-career-boundary",
    "Rich vague — Skills/Career boundary",
    "work",
    "I keep saying I need to sort work out, but I cannot tell if that means a better role, more confidence, or actually learning the technical stuff properly. Some days it feels like career because I want the adviser title and more money. Other days it is clearly skills because the fear is that I do not know enough and should do CEMAP, shadow calls and practise client conversations. I have not decided on a target or date, and I do not want the map inventing a shiny plan just because I am anxious after a rough Tuesday. This is exactly the Skills versus Career grey area.",
    {
      preferAmbiguous: true,
      kinds: ["ambiguous"],
      hubSlugs: ["career", "skills"],
      forbidNewPursuit: true,
    },
  ),
  themeCase(
    "vague-uncertain",
    "rich-vague-finance-assets-safety-boundary",
    "Rich vague — Safety net/Assets boundary",
    "finance",
    "I need to do something sensible with money, but I am not sure what the actual goal is yet. Part of me wants to put more into the ISA because seeing investments grow makes me feel like I am finally catching up. Another part thinks that is ridiculous while visa costs, rent rises and possible job wobble are sitting there, so maybe it should be emergency cash instead. I have no number, no deadline, and no real decision between growth and protection. Please do not guess and create a fake ISA target if this is really a safety-net worry in disguise.",
    {
      preferAmbiguous: true,
      kinds: ["ambiguous"],
      hubSlugs: ["assets", "safety net"],
      forbidNewPursuit: true,
    },
  ),
  themeCase(
    "vague-uncertain",
    "rich-vague-becoming-purpose-inner-life-boundary",
    "Rich vague — Purpose/Inner life boundary",
    "becoming",
    "I keep trying to work out whether this is a values thing or an inner-life thing. Part of me wants a clearer purpose and a reason for the London grind, but part of me thinks I am just anxious and should process the patterns in therapy first. I have no concrete practice, no deadline, and no decision between meaning and healing. Please leave this as a Purpose versus Inner life question instead of inventing a polished life mission.",
    {
      preferAmbiguous: true,
      kinds: ["ambiguous"],
      hubSlugs: ["purpose", "inner life"],
      forbidNewPursuit: true,
    },
  ),
  themeCase(
    "vague-uncertain",
    "rich-vague-health-appearance-inner-life-boundary",
    "Rich vague — Appearance/Inner life boundary",
    "health",
    "I keep flinching at photos and mirrors lately, and I cannot tell if this is an appearance thing like haircut, skin and clothes, or actually an inner-life/body-image thing I should not turn into another makeover project. There is no specific treatment or plan yet. Please surface it as a question rather than confidently making a grooming goal.",
    {
      preferAmbiguous: true,
      kinds: ["ambiguous"],
      hubSlugs: ["appearance"],
      forbidNewPursuit: true,
    },
  ),
  themeCase(
    "uk-london-specifics",
    "rich-uk-finance-isa-premium-bonds-bupa",
    "Rich UK/London — ISA, Premium Bonds and BUPA",
    "finance",
    "Very UK money admin dump: I used the last bit of the 2025/26 ISA allowance on 4 April and got the stocks and shares ISA to £20k, which should be a mark under assets. I also moved £2,500 into Premium Bonds because I want the emergency pot away from my current account, even if the returns are not guaranteed. Through work I signed up for BUPA at £42 a month by salary sacrifice, mostly because my back scared me and I do not want one health thing to wreck the budget. So assets, safety net and maybe income/payroll all in one boring but useful update.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["assets", "safety net", "income"],
    },
  ),
  themeCase(
    "uk-london-specifics",
    "rich-uk-work-cemap-london-adviser",
    "Rich UK/London — CEMAP and London adviser path",
    "work",
    "Passed CEMAP Module 1 on 18 March with 82%, which feels like a proper UK-specific milestone rather than just another study note. I have still got Modules 2 and 3 to do by 30 June, and I want to use that to move from client admin near Bank into a trainee mortgage adviser role. Sam said I can shadow two calls next month, and I need to update LinkedIn so it does not look like I am still only doing back-office bits. Please separate the qualification from the role move: skills for CEMAP, career for adviser title, and maybe a small mark for passing.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["skills", "career"],
      milestone: true,
    },
  ),
  themeCase(
    "uk-london-specifics",
    "rich-uk-people-spousal-visa-family",
    "Rich UK/London — spousal visa and family prep",
    "people",
    "Spousal visa admin is becoming very real. We are aiming to apply around February, and I have started gathering screenshots, flight receipts, payslips, tenancy agreement and the boring evidence that proves the relationship exists outside WhatsApp. I want a Holborn solicitor consultation by 15 November, budget about £250 for the first call and maybe £3k all in if we use them. Emotionally I also need to tell Dad the plan properly before Christmas, because it feels wrong for family to learn it after the paperwork is already moving. Romance is the main hub, but there is a family milestone too.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["pursuit", "milestone"],
      hubSlugs: ["romance", "family"],
      milestone: true,
    },
  ),
  themeCase(
    "long-brain-dumps",
    "rich-long-work-direction",
    "Rich long dump — work direction and build track",
    "work",
    "Long work ramble, sorry. Since January I have been saying mortgage adviser because it is the clearest next step from my financial-services admin job, but the more I study CEMAP the more I think mortgages are chapter one, not the destination. I passed a mock, booked Module 1, and Priya said the IFA diploma is hard but doable if I treat it like a two-year path. I also filmed two YouTube videos, one on ISA basics and one on what a UK-Thailand relationship costs, and I want five live before July. The extractor needs to keep the tracks separate: skills for exams, career for adviser or IFA direction, builds for YouTube. There is a continuation from mortgage adviser to broader financial planning, plus milestones for exams and uploads.",
    {
      minStructured: 5,
      maxStructured: 10,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["skills", "career", "builds & launches"],
      milestone: true,
      continuation: true,
    },
  ),
  themeCase(
    "long-brain-dumps",
    "rich-long-finance-life-admin",
    "Rich long dump — finance, visa and rent pressure",
    "finance",
    "Money is where everything is colliding. The ISA hit £5k in April, and I want £10k by December because investing makes me feel like I am finally building something. But the Barclaycard is still annoying me: £2,590 after paying off £650, and I want it gone before interest properly bites in August. Then there is visa reality, which is not glamorous but matters: solicitor, NHS surcharge, translations, flights, probably three grand. Rent also went from £1,150 to £1,235, and if my flatmate leaves I could be exposed. So please do not make this one generic money goal. I need assets for ISA continuation, liabilities for card clearance, safety net for visa and rent buffer, and a mark for the April ISA milestone.",
    {
      minStructured: 5,
      maxStructured: 10,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["assets", "liabilities", "safety net"],
      continuation: true,
    },
  ),
  themeCase(
    "long-brain-dumps",
    "rich-long-becoming-therapy-purpose-joy",
    "Rich long dump — therapy, purpose and joy",
    "becoming",
    "This one is not neat. I started therapy on 20 February in Islington, £65 a session, because I felt like I was building a very sensible London life without really choosing it. On 17 March I had a realisation that I use goals as evidence: CEMAP proves I am serious, ISA proves I am responsible, visa proves I am committed, gym proves I am disciplined. No wonder I am tired. I do want a concrete pursuit, though: write a one-page life direction note by 30 April about what work, money, marriage and London are actually serving. I also want joy protected, not optimised: Thai food, walks, seeing friends, filming because I enjoy explaining things. Mark the therapy breakthrough, create the purpose note, and keep joy separate from inner-life processing.",
    {
      minStructured: 4,
      maxStructured: 9,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["inner life", "purpose", "joy"],
    },
  ),
  themeCase(
    "milestone-status",
    "rich-status-cemap-finished",
    "Rich status — CEMAP modules finished",
    "work",
    "Finished the CEMAP modules on 30 June, finally. I do not want this to become a brand-new qualification goal because the goal already exists in my head as getting adviser-ready; this is the study milestone being done. I also booked the exam date and need one final mock above 80% before I sit it, so there is a next milestone rather than a whole new pursuit. Emotionally I am relieved but also slightly scared because passing the modules removes the excuse. Route the completed study bit to skills, and if anything career-related appears it should be about readiness for trainee adviser roles, not a duplicate mortgage-broker dream.",
    {
      minStructured: 2,
      maxStructured: 6,
      kinds: ["mark", "milestone"],
      hubSlugs: ["skills", "career"],
      milestone: true,
      forbidNewPursuit: true,
    },
  ),
  themeCase(
    "milestone-status",
    "rich-status-health-10k-strength",
    "Rich status — 10k complete and strength continuation",
    "health",
    "I completed the Battersea Park 10k on 31 August in 1 hour 4 minutes, and I did not stop, which is honestly huge for me. That should close the running milestone or at least mark it properly, not create another random 'run more' pursuit. The continuation is different: I want to move into two strength sessions a week through autumn so my knees and back do not complain every time I increase distance. I also noticed I slept terribly the night before because I was scrolling, so there may be a rest mark, but the main extraction is movement milestone complete plus a sensible strength continuation.",
    {
      minStructured: 3,
      maxStructured: 7,
      kinds: ["mark", "pursuit", "milestone"],
      hubSlugs: ["movement", "rest"],
      milestone: true,
      continuation: true,
    },
  ),
  themeCase(
    "milestone-status",
    "rich-status-visa-approved",
    "Rich status — visitor visa approved",
    "people",
    "Her visitor visa was approved on 2 July, and I genuinely nearly cried in the office toilet because I had convinced myself one missing document would ruin everything. That approval is a romance mark and probably completes the visa paperwork milestone under the London visit plan. Next, I need to book the Kent Sunday lunch with my parents, choose a date that is not too intense, and make sure I still see Tom while she is here rather than disappearing completely. So: romance status/milestone, family milestone, and maybe friendships as a small pursuit if the model can separate it cleanly.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "milestone"],
      hubSlugs: ["romance", "family", "friendships"],
      milestone: true,
    },
  ),
  themeCase(
    "contradictory-pivots",
    "rich-pivot-work-mortgage-to-planning",
    "Rich pivot — mortgage broking to planning",
    "work",
    "I think I need to pause the pure mortgage-broker plan. It was useful because it got me studying CEMAP, but after talking to Priya on 16 May I am more interested in broader financial planning and eventually IFA work. I do not want the map to duplicate three versions of the same career anxiety. Put the mortgage adviser pursuit on hold if it exists, keep CEMAP as skills because finishing it still matters, and create or continue a planning-route pursuit only if it is clearly the next chapter. There is emotion here too: I am relieved admitting the first plan was maybe too narrow, not a failure.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["career", "skills"],
      status: "PAUSED",
      continuation: true,
    },
  ),
  themeCase(
    "contradictory-pivots",
    "rich-pivot-finance-flat-to-flexibility",
    "Rich pivot — flat deposit to flexibility",
    "finance",
    "I might pause the London flat deposit idea, honestly. With my girlfriend, visa costs and the possibility that work could take me abroad one day, locking every spare pound into a Zone 2 buying plan by 2029 feels less right. I still care about wealth-building, so the ISA should continue, but the deposit pursuit should go on hold rather than sit there making me feel guilty. I also want a stronger emergency fund because flexibility is the actual need now: three months of bare-bones expenses, plus visa cash, before I obsess over property. So this is a pivot from assets-as-property to assets-plus-safety-net.",
    {
      minStructured: 3,
      maxStructured: 8,
      kinds: ["mark", "pursuit"],
      hubSlugs: ["assets", "safety net"],
      status: "PAUSED",
      continuation: true,
    },
  ),
];

type MultiSessionSeed = {
  slug: string;
  themeId: LifeAreaId;
  hubSlugs: string[];
  title: string;
  inputs: [string, string, string];
  expects: [DogfoodExpect, DogfoodExpect, DogfoodExpect];
};

const multiSessionSeeds: MultiSessionSeed[] = [
  {
    slug: "mortgage-ifa-international",
    themeId: "work",
    hubSlugs: ["career", "skills"],
    title: "Mortgage broker to IFA to international roles",
    inputs: [
      "Right, first proper dump then. Since 8 January 2026 I've been thinking I should stop drifting in financial services and properly aim at becoming a mortgage broker in London. I'm still doing the client admin bits at the firm near Bank, but I want to get the CEMAP done by October 2026 and move into advising, ideally earning at least £55k by next April.",
      "Bit of an update on the job situation from what I said before. I booked the CEMAP 1 exam for 14 March 2026, paid £185 for the materials, and I've done four evenings of revision after work. Also had a coffee with Sam from the mortgage desk on 29 January and he said I could shadow two client calls next month, so that feels like a real mark rather than just me chatting nonsense.",
      "Following on from the mortgage broker thing, I'm realising the bigger path might be independent financial advice rather than only mortgages. So after CEMAP I want to look at the Diploma in Regulated Financial Planning, maybe start in September 2026, and longer term I'd love an international advisory role in Dubai or Singapore by 2028.",
    ],
    expects: [
      { minStructured: 2, kinds: ["pursuit", "mark"], hubSlugs: ["career", "skills"] },
      { minStructured: 1, kinds: ["mark"], hubSlugs: ["career", "skills"], forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlugs: ["career", "skills"], continuation: true },
    ],
  },
  {
    slug: "isa-5-10-15",
    themeId: "finance",
    hubSlugs: ["assets"],
    title: "ISA saving from £5k to £15k",
    inputs: [
      "So, money wise, I want to stop being vague about it. By 5 April 2026 I want £5k in my stocks and shares ISA, mainly Vanguard global tracker, because the spousal visa and London rent make me feel like I need something solid behind me.",
      "Following on from what I said before about the ISA, I moved £1,250 across on 31 January 2026 after payday and the balance is now about £3,800. Not at the £5k yet, but it's the first time I've actually done it instead of leaving cash sitting in Monzo.",
      "Quick ISA update: I hit the £5k mark on 28 March 2026, which honestly felt brilliant. Rather than stopping there, I want to carry it on to £10k by December 2026 and then £15k by the end of the 2027 tax year if the visa costs don't eat everything.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "assets" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "assets", forbidNewPursuit: true },
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "assets", continuation: true },
    ],
  },
  {
    slug: "gym-5k-10k",
    themeId: "health",
    hubSlugs: ["movement"],
    title: "Gym consistency to 5k and 10k",
    inputs: [
      "I need to get my body sorted, basically. I joined PureGym in Aldgate on 6 February 2026, £34.99 a month, and I want to go three times a week until Easter because sitting at the desk all day is making me feel about 50.",
      "Gym update, because I said I was starting properly. I managed 11 sessions in February and on 2 March I ran 3k on the treadmill without feeling like I was dying. My weight's still 86kg but I feel a bit less sluggish already.",
      "Following on from the gym thing, I did my first 5k round Victoria Park on 5 April 2026 in 31 minutes. I want to build that into a 10k by 31 August 2026, maybe the Battersea Park one if I can keep my knees intact.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "movement" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "movement", forbidNewPursuit: true },
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "movement", continuation: true },
    ],
  },
  {
    slug: "thai-girlfriend-visit-visa",
    themeId: "people",
    hubSlugs: ["romance"],
    title: "Thai girlfriend visit to visa application",
    inputs: [
      "Relationship wise, I'm with my girlfriend in Thailand and it's been long distance since November 2025. I want to make the London visit happen in July 2026, probably for three weeks, and I need to stop putting off the visitor visa paperwork.",
      "Update on my girlfriend situation: we booked her Bangkok to Heathrow flights for 12 July 2026, £742 return, and I paid the visitor visa fee on 18 April. I'm nervous but also really excited because it makes the whole thing feel real.",
      "Following on from her visit, we've started talking seriously about the spousal visa. If the July trip goes well, I want us to prepare the application by February 2027, with about £3k set aside for solicitor fees, NHS surcharge and all the documents.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "romance" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "romance", milestone: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "romance", continuation: true },
    ],
  },
  {
    slug: "lost-therapy-breakthrough",
    themeId: "becoming",
    hubSlugs: ["inner life", "purpose"],
    title: "Feeling lost to therapy breakthrough",
    inputs: [
      "Honestly, I feel a bit lost at the moment. Since New Year 2026 I've had this weird feeling that I'm building a life in London but not really choosing it, if that makes sense. I want to understand what I'm actually aiming for, not just salary, visa, flat, all the usual boxes.",
      "A small update on feeling lost: I started therapy on 20 February 2026, £65 a session with a counsellor in Islington. Only had two sessions, but we talked about why I keep tying my worth to work and money, which hit harder than expected.",
      "Following on from therapy, I had a proper breakthrough on 17 March 2026. I realised I don't actually want some flashy finance career for its own sake; I want freedom, a stable marriage, and work that lets me help people make decisions calmly.",
    ],
    expects: [
      { minStructured: 1, kinds: ["mark"], hubSlugs: ["inner life", "purpose"], forbidNewPursuit: true },
      { minStructured: 1, kinds: ["mark"], hubSlug: "inner life", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["mark"], hubSlugs: ["inner life", "purpose"], forbidNewPursuit: true },
    ],
  },
  {
    slug: "youtube-launch-consistency",
    themeId: "work",
    hubSlugs: ["builds & launches"],
    title: "YouTube channel launch and consistency",
    inputs: [
      "I keep mentioning the YouTube channel, so here's the actual goal: launch it properly by 30 April 2026. It'll be about personal finance, London life and the Thai relationship stuff, and I want the first five videos filmed before my girlfriend visits.",
      "YouTube update: I filmed the first two videos on 9 March 2026, one about ISA basics and one about what long distance actually costs. They're a bit awkward, but I edited the first one in CapCut and made a thumbnail, so that's progress.",
      "Following on from the channel, I published video number five on 28 May 2026 and hit 312 subscribers. I want the next continuation to be 1,000 subscribers by 31 December 2026, with one upload every Sunday night.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "builds & launches" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "builds & launches", forbidNewPursuit: true },
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "builds & launches", continuation: true },
    ],
  },
  {
    slug: "cemap-study-pass",
    themeId: "work",
    hubSlugs: ["skills"],
    title: "CEMAP study and pass",
    inputs: [
      "I need to add the CEMAP properly. I started Module 1 on 3 February 2026, doing 45 minutes before work, and I want all three modules finished by 30 June so the mortgage broker move isn't just a fantasy.",
      "CEMAP update: I finished the regulation section on 22 February and got 78% on the mock. I also paid £210 to book the Module 1 exam for 18 March 2026, which has made me slightly terrified but in a useful way.",
      "Following on from the CEMAP study, I passed Module 1 on 18 March 2026 with 82%. Next milestone is Modules 2 and 3 by 30 June, then I can actually start applying for trainee mortgage adviser roles in London.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "skills" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "skills", forbidNewPursuit: true },
      { minStructured: 2, kinds: ["mark", "milestone"], hubSlug: "skills", milestone: true },
    ],
  },
  {
    slug: "flat-deposit",
    themeId: "finance",
    hubSlugs: ["assets"],
    title: "London flat deposit savings",
    inputs: [
      "Longer term, I want a London flat deposit, even if it sounds mad. Starting 1 April 2026 I'm aiming for £25k by April 2029, separate from the ISA if possible, because renting in Zone 2 forever feels bleak.",
      "Deposit update: I moved £900 into the separate savings pot on 30 April 2026 and renamed it 'London flat, don't touch'. Tiny thing, but the balance is £1,850 now and it makes the plan feel less imaginary.",
      "Following on from the flat deposit, I've decided the next step is £5k by 31 December 2026, then I'll review whether buying in London is realistic or whether we look at commuter towns once the visa is sorted.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "assets" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "assets", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "assets", continuation: true },
    ],
  },
  {
    slug: "credit-card-clearance",
    themeId: "finance",
    hubSlugs: ["liabilities"],
    title: "Credit card debt clearance",
    inputs: [
      "I've got to be honest about the credit card. As of 12 February 2026 it's £3,240 on Barclaycard, mostly flights and visa stuff, and I want it cleared by 31 August before interest starts biting properly.",
      "Credit card update: paid £650 off on 28 February after my bonus, so the balance is down to £2,590. Still annoying, but at least it's moving in the right direction rather than quietly sitting there.",
      "Following on from clearing the Barclaycard, once it gets to zero I want a hard rule that visa and travel costs go into a sinking fund first, not back onto the card. Target is £200 a month from September 2026.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "liabilities" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "liabilities", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "liabilities", continuation: true },
    ],
  },
  {
    slug: "salary-client-win",
    themeId: "work",
    hubSlugs: ["career"],
    title: "Salary negotiation and client win",
    inputs: [
      "Work's been weirdly intense. I want to ask for a proper pay rise at the June 2026 review, from £48k to at least £55k, because I'm doing advisory prep and half the client chasing already.",
      "Bit of an update on the pay rise plan: on 11 April 2026 I handled the Henderson case almost entirely myself and the senior adviser said the client feedback was excellent. I'm saving that for the review notes.",
      "Following on from that client win, I had the review on 19 June and got moved to £53k, not quite £55k but still good. Next continuation is getting the adviser title formally by March 2027.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "career" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "career", forbidNewPursuit: true },
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "career", continuation: true },
    ],
  },
  {
    slug: "nutrition-takeaway-reset",
    themeId: "health",
    hubSlugs: ["nutrition"],
    title: "Takeaway reset and nutrition",
    inputs: [
      "Food has got stupid lately. In January 2026 I spent £286 on Deliveroo and Pret, which is embarrassing, so I want to cook at home four nights a week through March and keep takeaways under £80.",
      "Nutrition update: I meal prepped on Sunday 9 March, chicken rice bowls and overnight oats, and I only bought lunch twice that week. Spent £42 on groceries and £18 on Pret, which is a massive improvement for me.",
      "Following on from the meal prep thing, I want to turn it into a proper 12-week cut from 1 April to 24 June 2026, aiming to get from 86kg to 80kg without doing anything extreme or miserable.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "nutrition" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "nutrition", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "nutrition", continuation: true },
    ],
  },
  {
    slug: "sleep-burnout-reset",
    themeId: "health",
    hubSlugs: ["rest"],
    title: "Sleep and burnout reset",
    inputs: [
      "Sleep is honestly wrecked. Since 15 January 2026 I've been scrolling until 1am and then dragging myself to the City half dead, so I want a 10:45pm lights-out rule Sunday to Thursday for the next month.",
      "Sleep update: I managed nine nights before 11pm between 1 and 14 February, and my Garmin sleep score got back into the 70s. Still not perfect, but I didn't feel like a zombie on the Jubilee line this week.",
      "Following on from the sleep reset, I want to protect one proper recovery evening every Wednesday, no YouTube editing, no CEMAP, just dinner, call my girlfriend and be in bed by 10:30.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "rest" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "rest", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "rest", continuation: true },
    ],
  },
  {
    slug: "back-physio-strength",
    themeId: "health",
    hubSlugs: ["movement"],
    title: "Back pain physio and strength",
    inputs: [
      "My lower back has been playing up since 7 February 2026, probably too much sitting and no stretching. I want to see a physio privately in London because the NHS waiting list is ages, and keep doing the exercises three times a week.",
      "Back update: saw the physio in Clapham on 21 February, £78 for the session, and she gave me hip hinges, dead bugs and glute bridges. I've done the exercises five times so far and the pain is down from a 6 to a 3.",
      "Following on from the physio work, I want to rebuild strength properly: two gym strength sessions a week from April 2026, with a sensible deadlift again by July without aggravating the back.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "movement" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "movement", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "movement", continuation: true },
    ],
  },
  {
    slug: "family-girlfriend-introduction",
    themeId: "people",
    hubSlugs: ["family", "romance"],
    title: "Family and girlfriend introduction",
    inputs: [
      "I want to handle the family side better. Mum knows about my Thai girlfriend but Dad hasn't really asked much, so by May 2026 I want to have an honest conversation with them before she comes to London.",
      "Family update: I told Dad properly on 4 May 2026 that we're serious and that the visa route might happen next year. It was awkward for about ten minutes, then he asked what Thai food she likes, which was actually sweet.",
      "Following on from that, when she's here in July I want to organise a Sunday lunch with my parents in Kent, not make it a massive performance, just let everyone meet like normal people.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlugs: ["family", "romance"] },
      { minStructured: 1, kinds: ["mark"], hubSlug: "family", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["milestone"], hubSlugs: ["family", "romance"], milestone: true },
    ],
  },
  {
    slug: "journal-purpose",
    themeId: "becoming",
    hubSlugs: ["inner life", "purpose"],
    title: "Journalling into purpose",
    inputs: [
      "I want a small reflection habit, nothing too cringe. From 1 March 2026 I'm going to journal for ten minutes on Sunday evenings about work, money, my girlfriend and what kind of life I'm actually building.",
      "Journalling update: I've done four Sundays in a row by 29 March, and the theme that keeps coming up is that I'm scared of disappointing people more than I'm excited by my own plans. Bit uncomfortable, but useful.",
      "Following on from the journalling, I want to write a one-page life direction note by 30 April 2026: what I want London, marriage, money and career to actually serve, rather than treating them as separate projects.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "inner life" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "inner life", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlugs: ["inner life", "purpose"], continuation: true },
    ],
  },
  {
    slug: "emergency-fund",
    themeId: "finance",
    hubSlugs: ["safety net"],
    title: "Emergency fund build",
    inputs: [
      "I need a boring safety net. Starting February 2026 I want a £3k emergency fund in easy access savings, because if the job wobbles or the visa costs jump I don't want to panic immediately.",
      "Emergency fund update: on 26 February I moved £600 into the Chase saver and the pot is now £1,400. Not life changing, but I slept better knowing rent wouldn't instantly destroy me.",
      "Following on from the £3k emergency fund, once I hit it I want to continue to £6k by March 2027, basically three months of bare bones London expenses.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "safety net" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "safety net", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "safety net", continuation: true },
    ],
  },
  {
    slug: "ifa-diploma-cfp",
    themeId: "work",
    hubSlugs: ["skills", "career"],
    title: "IFA diploma to CFP pathway",
    inputs: [
      "After CEMAP, I think I should map the IFA qualification path properly. I want to start the Diploma in Regulated Financial Planning in September 2026 and finish it by December 2027, even if it's a slog alongside work.",
      "IFA diploma update: I spoke to Priya on 16 May 2026 and she said the R0 exams are doable if I treat them like a 15-month project. I priced it up at roughly £1,200 for study materials and exams.",
      "Following on from the IFA route, the longer continuation might be CFP by 2029 if I actually enjoy planning. That feels more aligned than just selling mortgages forever.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlugs: ["skills", "career"] },
      { minStructured: 1, kinds: ["mark"], hubSlug: "skills", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlugs: ["skills", "career"], continuation: true },
    ],
  },
  {
    slug: "youtube-finance-thai-series",
    themeId: "work",
    hubSlugs: ["builds & launches"],
    title: "YouTube finance and Thailand series",
    inputs: [
      "I want to make a YouTube mini-series before my girlfriend arrives: six videos by 30 June 2026 about London money, ISA saving, and the honest cost of a UK-Thailand relationship.",
      "Mini-series update: filmed the visa-cost video on 12 May and it ended up being 18 minutes because I rambled about flights, hotels, solicitor fees and the NHS surcharge. Need to edit it down to about 9 minutes.",
      "Following on from the series, if those six videos are live by July I want the next target to be a simple newsletter or downloadable budget sheet by September 2026.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "builds & launches" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "builds & launches", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "builds & launches", continuation: true },
    ],
  },
  {
    slug: "spousal-visa-documents",
    themeId: "people",
    hubSlugs: ["romance"],
    title: "Spousal visa documents",
    inputs: [
      "For the spousal visa, I want to start collecting evidence from August 2026 rather than leaving it to chaos. Screenshots, flights, hotel receipts, payslips, tenancy agreement, all that boring but important stuff.",
      "Visa docs update: on 17 September 2026 I made a shared Google Drive folder and uploaded 42 screenshots, three flight receipts and my last six payslips. It was tedious but weirdly calming.",
      "Following on from the visa evidence folder, the next milestone is booking a solicitor consultation by 15 November 2026, budget about £250 for the first call and £3k all in if we use them.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "romance" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "romance", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["milestone"], hubSlug: "romance", milestone: true },
    ],
  },
  {
    slug: "international-career",
    themeId: "work",
    hubSlugs: ["career"],
    title: "International financial services roles",
    inputs: [
      "This might be a bit future-looking, but by 2028 I want to be eligible for international financial services roles, maybe Singapore, Dubai or Bangkok if that ever made sense with my girlfriend. For now it means building UK advice experience and a stronger CV.",
      "International role update: I spoke to a recruiter on 6 June 2026 who covers Dubai wealth firms, and he basically said get the UK qualifications first and show at least two years client-facing advice. Useful reality check.",
      "Following on from the international plan, I want a milestone for December 2026: update LinkedIn, write a proper adviser CV, and speak to at least three people who have moved from London finance into overseas roles.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "career" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "career", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["milestone"], hubSlug: "career", milestone: true },
    ],
  },
  {
    slug: "appearance-confidence",
    themeId: "health",
    hubSlugs: ["appearance"],
    title: "Appearance and confidence",
    inputs: [
      "This sounds vain but I want to feel better in photos before my girlfriend visits in July 2026. Starting 1 May, haircut every four weeks, basic skincare, and lose enough weight that shirts fit properly again.",
      "Appearance update: got a decent haircut in Shoreditch on 11 May, bought SPF and cleanser for £27, and took new photos for the YouTube thumbnails. I still feel awkward, but less like I'm hiding.",
      "Following on from feeling better in photos, I want to book a proper couple photoshoot in London when she's here, maybe around Tower Bridge, budget £180 max.",
    ],
    expects: [
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "appearance" },
      { minStructured: 1, kinds: ["mark"], hubSlug: "appearance", forbidNewPursuit: true },
      { minStructured: 1, kinds: ["milestone"], hubSlug: "appearance", milestone: true },
    ],
  },
];

function _buildMultiSessionCases(): DogfoodCase[] {
  return multiSessionSeeds.flatMap((seed) =>
    seed.inputs.map((input, index) =>
      themeCase(
        "multi-session",
        `multi-${seed.slug}-s${index + 1}`,
        `${seed.title} — session ${index + 1}`,
        seed.themeId,
        input,
        {
          hubSlugs: seed.hubSlugs,
          ...seed.expects[index],
        },
      ),
    ),
  );
}

function buildStaticCases(map: MapSnapshot): DogfoodCase[] {
  return [...richDogfoodCases, ...buildPeopleConnectionCases(map)];
}

function _buildMixedThemeDumpCases(): DogfoodCase[] {
  return [
    themeCase(
      "mixed-theme-dumps",
      "mixed-work-client-girlfriend-isa-food",
      "Mixed dump — work win, girlfriend visit, ISA and eating badly",
      "work",
      "So work's been absolutely manic this month, like proper City hours, but on 23 May 2026 I had a big client win on a £420k remortgage case which was great. Relationship wise things are going really well with my Thai girlfriend and we're planning her London visit in July. Also I've been eating terribly, mainly Pret and Deliveroo, and I finally moved £1,000 into the ISA so it's about £3k now.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "career" },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-finance-isa-visa-youtube-gym",
      "Mixed dump — ISA, visa costs, YouTube and gym",
      "finance",
      "I've got a bit of a scattered update. The ISA is now £6,250 as of 1 June 2026, which I'm pleased about, but I've also realised the spousal visa could be nearly £3k all in. I'm trying to keep the YouTube uploads going every Sunday, and I did three gym sessions last week for once.",
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlugs: ["assets", "safety net"] },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-people-girlfriend-parents-money-sleep",
      "Mixed dump — girlfriend, parents, money and sleep",
      "people",
      "Little life update really. My girlfriend's got her visitor visa appointment in Bangkok on 18 June, and Mum's asking when she'll meet her, which is sweet but a bit pressure-y. Money feels tight because flights were £742, and I'm sleeping badly because I keep checking visa forums at midnight.",
      { minStructured: 2, kinds: ["mark", "milestone"], hubSlugs: ["romance", "family"], milestone: true },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-health-gym-takeaway-work-stress",
      "Mixed dump — gym, takeaway, work stress and relationship",
      "health",
      "Honestly the body stuff is all tangled with work. I did a 5k on 8 June 2026 in 29:40, then celebrated with two takeaways like an idiot. Work's been 60-hour weeks, my girlfriend keeps telling me to sleep earlier on our calls, and I think I need a proper food plan for July.",
      { minStructured: 3, kinds: ["mark", "pursuit"], hubSlugs: ["movement", "nutrition", "rest"] },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-becoming-therapy-career-visa-money",
      "Mixed dump — therapy, career, visa and money",
      "becoming",
      "Therapy on 12 June got quite deep, actually. We talked about how I'm treating the mortgage broker move, the ISA target and the spousal visa like one massive test of whether I'm a proper adult. I left feeling sad but clearer, like maybe I need a life that isn't just proving myself in London.",
      { minStructured: 1, kinds: ["mark"], hubSlugs: ["inner life", "purpose"], forbidNewPursuit: true },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-work-cemap-youtube-dubai-relationship",
      "Mixed dump — CEMAP, YouTube, Dubai and relationship",
      "work",
      "Work update is messy but good. I passed another CEMAP mock on 15 June with 84%, uploaded a YouTube video about ISA mistakes, and had a recruiter message me about Dubai adviser roles for 2028. Also my girlfriend said she'd consider moving if the visa route here got ridiculous.",
      { minStructured: 3, kinds: ["mark", "pursuit"], hubSlugs: ["skills", "builds & launches", "career"] },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-finance-credit-card-isa-rent-visa",
      "Mixed dump — credit card, ISA, rent and visa pressure",
      "finance",
      "Money check-in: paid £500 off the Barclaycard on 28 June, ISA is still at £6,250, rent went up by £85 a month from July, and I need to hold back at least £3k for visa solicitor costs. It all feels a bit tight but not hopeless.",
      { minStructured: 4, kinds: ["mark", "pursuit"], hubSlugs: ["liabilities", "assets", "safety net"] },
    ),
    themeCase(
      "mixed-theme-dumps",
      "mixed-people-friends-girlfriend-youtube",
      "Mixed dump — friends, girlfriend and YouTube loneliness",
      "people",
      "I realised on 30 June that I've barely seen friends this year. Everything's been girlfriend calls, CEMAP, YouTube and money planning. I want to see Tom and Aisha once a month again, and also make sure my relationship doesn't become my entire social life when she moves here.",
      { minStructured: 2, kinds: ["pursuit", "mark"], hubSlugs: ["friendships", "romance"] },
    ),
  ];
}

function _buildCrossThemeEventCases(): DogfoodCase[] {
  return [
    themeCase(
      "cross-theme-events",
      "event-redundancy",
      "Cross-theme event — redundancy",
      "work",
      "Got made redundant on 17 April 2026, which was a proper shock. Obviously it affects the finances because I've had to dip £1,100 into savings already, but weirdly it's made me think about whether I actually want mortgage broking or a broader IFA path next.",
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "career" },
    ),
    themeCase(
      "cross-theme-events",
      "event-engagement",
      "Cross-theme event — engagement",
      "people",
      "We got engaged last weekend, 9 August 2026, on the South Bank near Waterloo. I'm over the moon, honestly, but now the finances for a wedding and the whole spousal visa situation feel much more urgent and real.",
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "romance" },
    ),
    themeCase(
      "cross-theme-events",
      "event-father-health-scare",
      "Cross-theme event — dad health scare",
      "people",
      "Dad had a health scare on 3 September 2026 and I had to get the train down to Kent after work. He's okay, thank God, but it's made me think I need to be more present with family, not just obsess over London money and visa admin.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "family", forbidNewPursuit: true },
    ),
    themeCase(
      "cross-theme-events",
      "event-girlfriend-visa-refusal",
      "Cross-theme event — visitor visa refusal",
      "people",
      "Her visitor visa got refused on 21 June 2026, and I feel gutted. It affects us emotionally, obviously, but also financially because we've already spent £742 on flights and now I need to decide whether we reapply, appeal, or I fly to Bangkok in August instead.",
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlug: "romance" },
    ),
    themeCase(
      "cross-theme-events",
      "event-bonus",
      "Cross-theme event — bonus payment",
      "finance",
      "My bonus landed on 25 March 2026, £4,800 after tax. It changes a few things: I can clear £2k of the Barclaycard, put £1,500 into the ISA, and keep £1,000 aside for Thailand flights without feeling completely reckless.",
      { minStructured: 3, kinds: ["mark"], hubSlugs: ["income", "liabilities", "assets"] },
    ),
    themeCase(
      "cross-theme-events",
      "event-move-flatmate-leaves",
      "Cross-theme event — flatmate leaving",
      "finance",
      "My flatmate said on 2 July 2026 he's moving out in September, so rent could jump by about £650 a month if I don't find someone. That's a money issue, but it also makes the girlfriend visa and where we live next feel suddenly very immediate.",
      { minStructured: 2, kinds: ["mark", "pursuit"], hubSlugs: ["safety net", "liabilities"] },
    ),
  ];
}

function _buildEmotionalReflectiveCases(): DogfoodCase[] {
  return [
    themeCase(
      "emotional-reflective",
      "reflective-burnt-out",
      "Reflective — burnt out from work",
      "becoming",
      "I've been feeling really burnt out lately, not sure if it's the job or just life in general. Since the start of May 2026 I've been working 60-hour weeks and it's catching up with me, especially when I still try to revise CEMAP at night.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "inner life", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-good-week",
      "Reflective — good week",
      "becoming",
      "Had a really good week actually, everything just clicked for once. Work felt manageable, I called my girlfriend without feeling guilty about the time difference, and on 16 May 2026 I remember walking over London Bridge thinking, yeah, maybe I'm doing alright.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "inner life", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-lonely-london",
      "Reflective — lonely in London",
      "becoming",
      "London's felt lonely this month, especially on Sundays. I can be surrounded by people in Shoreditch or Bank and still feel weirdly separate, and I miss having my girlfriend physically here rather than just WhatsApp calls at 11pm.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "inner life", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-proud-isa",
      "Reflective — proud of ISA discipline",
      "finance",
      "I know it's only money, but I felt genuinely proud on 5 April 2026 seeing the ISA hit £5,000. Past me would have spent half of that on flights, gadgets and random London weekends without thinking.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "assets", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-anxious-visa",
      "Reflective — visa anxiety",
      "people",
      "The visa stuff is making me anxious in a way I didn't expect. I keep imagining one missing document ruining everything, and on 7 June 2026 I woke up at 4am thinking about payslips and tenancy agreements.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "romance", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-body-shame",
      "Reflective — body confidence",
      "health",
      "I've felt weird about my body lately, especially after seeing photos from 1 May 2026. Not a crisis or anything, just that familiar feeling of avoiding mirrors and telling myself I'll sort it out next Monday.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "appearance", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-career-doubt",
      "Reflective — career doubt",
      "work",
      "I'm doubting the career plan a bit. On paper mortgage advice, IFA, international roles all sound sensible, but on 19 May 2026 I sat at my desk near Bank thinking, is this mine or am I just following the obvious finance path?",
      { minStructured: 1, kinds: ["mark"], hubSlug: "career", forbidNewPursuit: true },
    ),
    themeCase(
      "emotional-reflective",
      "reflective-calm-after-therapy",
      "Reflective — calm after therapy",
      "becoming",
      "Therapy left me strangely calm on 24 May 2026. Nothing got solved, but I stopped feeling like every decision about work, money and my girlfriend had to be made immediately or I'd ruin my life.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "inner life", forbidNewPursuit: true },
    ),
  ];
}

function _buildVagueUncertainCases(): DogfoodCase[] {
  return [
    themeCase(
      "vague-uncertain",
      "vague-fitness-maybe",
      "Vague — maybe fitness",
      "health",
      "I don't know, I've been thinking about maybe doing something about my fitness, like I keep saying I will but I never do. Maybe June 2026? Not sure, just feel a bit rubbish in my body.",
      { preferAmbiguous: true, hubSlug: "movement", forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-hard-lately",
      "Vague — things hard lately",
      "becoming",
      "Things have been really hard lately. I can't quite explain it, but since April 2026 everything's felt heavier than it should, even normal stuff like emails and Tube delays.",
      { preferAmbiguous: true, hubSlug: "inner life", forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-not-sure-direction",
      "Vague — not sure direction",
      "becoming",
      "Not sure where I'm going with any of this right now. The London job, the girlfriend, the visa, the money, all of it feels like a lot and I don't know what the actual point is today.",
      { preferAmbiguous: true, hubSlug: "purpose", forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-money-sort-out",
      "Vague — sort money out",
      "finance",
      "I probably need to sort money out at some point, maybe the ISA, maybe the credit card, maybe both. I don't have a number in mind, just feel a bit behind for someone living in London at 30.",
      { preferAmbiguous: true, hubSlugs: ["assets", "liabilities"], forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-girlfriend-complicated",
      "Vague — girlfriend complicated",
      "people",
      "Things with my girlfriend feel a bit complicated, not bad exactly, just complicated. The distance, Thailand, London, all the admin, and I don't really know what I'm asking the map to do with that.",
      { preferAmbiguous: true, hubSlug: "romance", forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-work-change",
      "Vague — work change",
      "work",
      "I keep thinking I should change something about work, but then I don't know if that means a new role, a qualification, YouTube, or just being less dramatic after a bad Tuesday.",
      { preferAmbiguous: true, hubSlugs: ["career", "skills", "builds & launches"], forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-friends-should",
      "Vague — should see friends",
      "people",
      "I should probably see people more, I suppose. Friends, family, whatever. I noticed on 2 June 2026 that I'd gone three weekends without proper plans, but I don't know what I actually want to change.",
      { preferAmbiguous: true, hubSlugs: ["friendships", "family"], forbidNewPursuit: true },
    ),
    themeCase(
      "vague-uncertain",
      "vague-youtube-maybe",
      "Vague — maybe YouTube",
      "work",
      "The YouTube thing is still floating around in my head. Maybe I should do more with it in 2026, maybe it's a distraction, I don't know. I just keep thinking about it on the commute.",
      { preferAmbiguous: true, hubSlug: "builds & launches", forbidNewPursuit: true },
    ),
  ];
}

function _buildUkLondonSpecificCases(): DogfoodCase[] {
  return [
    themeCase(
      "uk-london-specifics",
      "uk-isa-full-allowance",
      "UK specific — full ISA allowance",
      "finance",
      "Finally opened my stocks and shares ISA properly and put in the full £20k allowance for the 2025/26 tax year on 4 April 2026. Feels very adult, even if I did it at the last possible minute.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "assets", forbidNewPursuit: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-cemap-passed",
      "UK specific — passed CEMAP",
      "work",
      "Passed my CEMAP qualification last week, 18 March 2026, and I got 82% on Module 1. I know it's only the start, but it makes the mortgage adviser route feel real.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "skills", milestone: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-spousal-visa-solicitor",
      "UK specific — spousal visa solicitor",
      "people",
      "Applied for the spousal visa for my Thai girlfriend on 12 November 2026, got a solicitor involved in Holborn, and it's going to cost about £3k all in with the NHS surcharge and translations.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "romance", milestone: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-bupa-work",
      "UK specific — BUPA through work",
      "finance",
      "Signed up for BUPA through work on 1 May 2026, £42 a month through salary sacrifice. Not thrilling, but it makes me feel less exposed if my back goes again.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "safety net", forbidNewPursuit: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-private-physio",
      "UK specific — private physio",
      "health",
      "Started seeing a physio for my back on 21 February 2026; NHS waiting list was too long so I went private in Clapham, £78 a session. She thinks it's mostly desk posture and weak glutes.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "movement", forbidNewPursuit: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-premium-bonds",
      "UK specific — premium bonds safety pot",
      "finance",
      "Moved £2,500 into Premium Bonds on 6 May 2026 as part of the emergency fund. I know the returns aren't guaranteed, but I like that it's not sitting in my current account tempting me.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "safety net", forbidNewPursuit: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-london-zone-two-rent",
      "UK specific — Zone 2 rent rise",
      "finance",
      "The landlord put the Zone 2 rent up from £1,150 to £1,235 starting 1 July 2026. Annoying, but still cheaper than moving, so I need to adjust the visa and ISA budget.",
      { minStructured: 1, kinds: ["mark"], hubSlugs: ["liabilities", "safety net"], forbidNewPursuit: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-parkrun",
      "UK specific — first parkrun",
      "health",
      "Did my first parkrun at Victoria Dock on Saturday 6 June 2026, 29 minutes 12 seconds. It was windy as anything but I didn't stop, which felt weirdly massive.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "movement", forbidNewPursuit: true },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-student-loan",
      "UK specific — student loan deduction",
      "finance",
      "Checked my payslip on 28 April 2026 and realised the student loan deduction is still £186 a month. Not urgent, but I want to understand whether overpaying ever makes sense once the ISA is healthier.",
      { minStructured: 1, kinds: ["pursuit"], hubSlug: "liabilities" },
    ),
    themeCase(
      "uk-london-specifics",
      "uk-national-insurance-gap",
      "UK specific — National Insurance record",
      "finance",
      "Logged into the HMRC app on 3 May 2026 and checked my National Insurance record. No gaps, thankfully, but it reminded me I should keep pensions and long-term security on the radar, not just the ISA.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "safety net", forbidNewPursuit: true },
    ),
  ];
}

function _buildLongBrainDumpCases(): DogfoodCase[] {
  return [
    themeCase(
      "long-brain-dumps",
      "long-work-life-map",
      "Long dump — work direction, CEMAP, YouTube and international options",
      "work",
      `Okay, this is probably going to be a ramble, but I want to get the work stuff out properly. Since January 2026 I've been saying I want to become a mortgage broker, and the honest reason is that I'm already in financial services in London, I'm close enough to the work to understand it, and I can see a route from admin and client support into actual advice. But the more I sit with it, the more I think mortgages might be the first step rather than the whole destination. I passed a CEMAP mock on 15 March with 79%, which was encouraging, and I've booked the real Module 1 exam for 18 March, so that's one concrete thing.

At the same time, I keep thinking about becoming an IFA eventually, because helping people make sense of money feels more interesting than only doing remortgages. I had a chat with Priya at work on 16 May and she said the regulated planning diploma is hard but doable if I treat it like a proper two-year path. Then there's the YouTube channel, which is partly career and partly just me wanting to build something. I've filmed two videos now, one about ISA basics and one about what a long-distance UK-Thailand relationship actually costs, and I want five up before my girlfriend comes to London in July.

The international thing is further out, but it keeps coming back. Dubai, Singapore, maybe even Bangkok if life goes that way. I don't want to pretend it's a plan yet, but by 2028 I'd like to be credible for overseas financial advice or wealth roles. So, distilled version: CEMAP this year, adviser role next year, YouTube consistency in the background, and keep the international option alive without letting it distract me from the next exam.`,
      { minStructured: 4, maxStructured: 8, kinds: ["mark", "pursuit"], hubSlugs: ["career", "skills", "builds & launches"] },
    ),
    themeCase(
      "long-brain-dumps",
      "long-finance-visa-isa-debt",
      "Long dump — ISA, visa costs, debt and safety net",
      "finance",
      `Money update, and it's a bit all over the place, sorry. As of 5 April 2026 my stocks and shares ISA is finally at £5,000, which feels like the first genuinely solid thing I've done financially in ages. I want to keep going to £10k by December 2026 and £15k by the end of the next tax year, but the spousal visa costs are making me nervous. Between solicitor fees, translations, the NHS surcharge and application fees, I'm assuming about £3k, maybe a bit more if anything goes wrong. That means I can't just chuck every spare pound into Vanguard and call myself disciplined.

The annoying bit is the Barclaycard. It was £3,240 in February after flights, a laptop for YouTube editing, and a couple of London weekends where I didn't pay attention. I paid £650 off on 28 February and another £500 on 28 June, so it's moving, but I still hate seeing it. I want it gone by 31 August before interest kicks in properly. Rent is the other thing. From 1 July the flat goes from £1,150 to £1,235 a month, and if my flatmate leaves in September I might need a bigger emergency buffer.

So the map should probably show three tracks, not one. Assets: ISA from £5k to £10k. Liabilities: clear the credit card by August. Safety net: hold £3k aside for visa and rent shocks. It's not glamorous, but I think that would make me feel less like one random bill could knock the whole life plan over.`,
      { minStructured: 4, maxStructured: 8, kinds: ["mark", "pursuit"], hubSlugs: ["assets", "liabilities", "safety net"] },
    ),
    themeCase(
      "long-brain-dumps",
      "long-people-romance-family",
      "Long dump — Thai girlfriend, visit, family and visa",
      "people",
      `The relationship update is probably the biggest emotional thing, even though I keep trying to make it an admin project. My girlfriend is in Thailand and we've been long-distance since November 2025. We booked her flight to Heathrow for 12 July 2026, £742 return, and I paid the visitor visa fee in April. I keep acting like it's just documents, payslips, tenancy agreement, invitation letter, screenshots and all that, but really I'm nervous because her coming to London makes the relationship visible to everyone here.

Mum knows quite a lot and keeps asking sweet questions, but Dad has been a bit quieter. I told him properly on 4 May that we're serious and that a spousal visa might happen next year, and to be fair he handled it better than I expected. I want to arrange a Sunday lunch in Kent while she's here, maybe 21 July, so they can meet without it becoming a huge dramatic thing. I also need to not disappear from my friends while all this is happening. I haven't seen Tom since February, which is ridiculous.

Longer term, if the visit goes well, I think the next pursuit is preparing for the spousal visa by February 2027. That means evidence, money, solicitor consultation, and also being emotionally ready for the fact that marriage would change the shape of my London life completely. I'm excited, but also scared of getting one bit wrong and letting her down.`,
      { minStructured: 4, maxStructured: 8, kinds: ["mark", "pursuit", "milestone"], hubSlugs: ["romance", "family", "friendships"], milestone: true },
    ),
    themeCase(
      "long-brain-dumps",
      "long-health-body-reset",
      "Long dump — gym, running, nutrition, sleep and back",
      "health",
      `Health has become the thing I only notice when it goes wrong. In February 2026 my lower back started hurting after a brutal week at the desk, so I saw a private physio in Clapham on 21 February because the NHS waiting list was miles away. £78 a session, which annoyed me, but she gave me exercises and said I wasn't broken, just weak and stiff from sitting. I did the dead bugs and glute bridges for a couple of weeks and the pain dropped from a 6 to a 3.

Movement-wise, I joined PureGym in Aldgate for £34.99 a month and managed 11 sessions in February. Then on 5 April I ran 5k round Victoria Park in 31 minutes, which genuinely surprised me. I'd like to build that to a 10k by 31 August, but not in a stupid way where I wreck my knees. Nutrition is the less heroic bit. I spent £286 on Deliveroo and Pret in January, which is just silly, so I've started meal prepping chicken rice bowls and overnight oats. When I do it, the week is better. When I don't, I end up buying £9 sandwiches and feeling sluggish.

Sleep might be the foundation under all of it. I keep saying I'll go to bed at 10:45, then I edit YouTube or check visa forums until 1am. So the actual health map should probably have movement, nutrition and rest, with simple marks: first physio session, first 5k, first proper meal prep week, and a pursuit for the 10k by August.`,
      { minStructured: 4, maxStructured: 8, kinds: ["mark", "pursuit"], hubSlugs: ["movement", "nutrition", "rest"] },
    ),
    themeCase(
      "long-brain-dumps",
      "long-becoming-purpose",
      "Long dump — therapy, purpose, identity and life direction",
      "becoming",
      `This is more reflective and probably harder for the extractor, but it matters. I've been in London long enough now that the default path is very clear: earn more, get qualified, save into the ISA, sort the visa, maybe buy somewhere eventually. None of that is bad. I want those things. But around February 2026 I started feeling like I was collecting sensible goals without asking what kind of person I was becoming. That's why I started therapy on 20 February, £65 a session in Islington. At first I felt a bit self-indulgent, like who am I to complain when life is basically fine, but it helped.

The big realisation came on 17 March. I was talking about work and money and suddenly saw that I keep treating every goal as evidence that I'm not behind. CEMAP means I'm serious, ISA means I'm responsible, spousal visa means I'm committed, YouTube means I'm creative, gym means I'm disciplined. Exhausting, honestly. What I actually want is calmer than that: freedom, a stable marriage, work that helps people, enough money not to panic, and a life in London that still has joy in it.

So I want to keep journalling on Sundays, maybe write a one-page life direction note by 30 April, and protect some joy that isn't optimised. Walks, Thai food, seeing friends, filming videos because I enjoy explaining things, not because every hobby needs to become a brand.`,
      { minStructured: 3, maxStructured: 8, kinds: ["mark", "pursuit"], hubSlugs: ["inner life", "purpose", "joy"] },
    ),
  ];
}

function _buildMilestoneStatusCases(): DogfoodCase[] {
  return [
    themeCase(
      "milestone-status",
      "status-cemap-modules-finished",
      "Status — CEMAP modules finished",
      "work",
      "Finished the CEMAP modules finally on 30 June 2026, just waiting on the exam date now. Please don't make this a new goal; it's a milestone on the CEMAP qualification thing.",
      { minStructured: 1, kinds: ["milestone"], hubSlug: "skills", milestone: true, forbidNewPursuit: true },
    ),
    themeCase(
      "milestone-status",
      "status-credit-card-cleared",
      "Status — credit card paid off",
      "finance",
      "Paid off the credit card on 31 August 2026, cleared the full £3k balance and it feels amazing. That's the Barclaycard debt goal done, not a brand new money project.",
      { minStructured: 1, kinds: ["mark"], hubSlug: "liabilities", forbidNewPursuit: true, status: "COMPLETE" },
    ),
    themeCase(
      "milestone-status",
      "status-couch-to-5k-complete",
      "Status — couch to 5k complete",
      "health",
      "Completed couch to 5k, ran the whole thing without stopping on Sunday 7 June 2026 at Victoria Dock parkrun. That should complete the 5k milestone, not create another running goal.",
      { minStructured: 1, kinds: ["milestone"], hubSlug: "movement", milestone: true, forbidNewPursuit: true },
    ),
    themeCase(
      "milestone-status",
      "status-isa-10k-hit",
      "Status — ISA £10k hit",
      "finance",
      "Hit the £10k ISA target on 20 December 2026. Following on from the £5k and £10k chain, this is a milestone completion before I think about the £15k continuation.",
      { minStructured: 1, kinds: ["milestone", "mark"], hubSlug: "assets", milestone: true, forbidNewPursuit: true },
    ),
    themeCase(
      "milestone-status",
      "status-visitor-visa-approved",
      "Status — visitor visa approved",
      "people",
      "Her visitor visa was approved on 2 July 2026, honestly such a relief. That's the visit paperwork milestone done under the girlfriend London visit plan.",
      { minStructured: 1, kinds: ["milestone"], hubSlug: "romance", milestone: true, forbidNewPursuit: true },
    ),
    themeCase(
      "milestone-status",
      "status-youtube-five-videos",
      "Status — five YouTube videos live",
      "work",
      "Got the first five YouTube videos live by 30 June 2026. That completes the launch milestone for the channel, not a separate new channel idea.",
      { minStructured: 1, kinds: ["milestone"], hubSlug: "builds & launches", milestone: true, forbidNewPursuit: true },
    ),
    themeCase(
      "milestone-status",
      "status-therapy-started",
      "Status — therapy started",
      "becoming",
      "Started therapy on 20 February 2026 and had the first session. That's a milestone on the feeling-lost inner life work, not a new pursuit by itself.",
      { minStructured: 1, kinds: ["milestone"], hubSlug: "inner life", milestone: true, forbidNewPursuit: true },
    ),
    themeCase(
      "milestone-status",
      "status-10k-run-complete",
      "Status — 10k run completed",
      "health",
      "Completed the 10k on 31 August 2026 in Battersea Park, 1 hour 4 minutes, and I didn't stop. That's the running continuation milestone complete.",
      { minStructured: 1, kinds: ["milestone"], hubSlug: "movement", milestone: true, forbidNewPursuit: true },
    ),
  ];
}

function _buildContradictoryPivotCases(): DogfoodCase[] {
  return [
    themeCase(
      "contradictory-pivots",
      "pivot-mortgage-to-cfp",
      "Pivot — mortgage broking to CFP",
      "work",
      "Actually I've been thinking and I don't think mortgage broking is right for me anymore. Since 14 July 2026 I'm more interested in financial planning, maybe the CFP qualification instead, so the mortgage broker pursuit should probably go on hold rather than duplicate.",
      { minStructured: 2, kinds: ["pursuit"], hubSlugs: ["career", "skills"], continuation: true, status: "PAUSED" },
    ),
    themeCase(
      "contradictory-pivots",
      "pivot-london-flat-to-flexibility",
      "Pivot — London flat deposit to flexibility",
      "finance",
      "I might pause the London flat deposit idea, honestly. With my girlfriend, the visa and possible international roles, locking everything into a Zone 2 flat by 2029 feels less right. I'd rather keep the ISA and emergency fund flexible for now.",
      { minStructured: 2, kinds: ["pursuit"], hubSlugs: ["assets", "safety net"], status: "PAUSED" },
    ),
    themeCase(
      "contradictory-pivots",
      "pivot-10k-run-to-strength",
      "Pivot — 10k run to strength",
      "health",
      "I'm putting the 10k idea on hold after my knee twinged on 12 July 2026. I still want to be fit, but the next thing should be strength training twice a week and sorting my back properly, not forcing another running target.",
      { minStructured: 2, kinds: ["pursuit"], hubSlug: "movement", status: "PAUSED" },
    ),
    themeCase(
      "contradictory-pivots",
      "pivot-youtube-schedule",
      "Pivot — weekly YouTube to seasons",
      "work",
      "The weekly YouTube schedule is too much with CEMAP and visa stuff. I don't want to quit the channel, but from August 2026 I want to pause weekly uploads and do eight-video seasons instead.",
      { minStructured: 2, kinds: ["pursuit"], hubSlug: "builds & launches", status: "PAUSED" },
    ),
    themeCase(
      "contradictory-pivots",
      "pivot-spousal-visa-timing",
      "Pivot — spousal visa timing",
      "people",
      "We've decided not to rush the spousal visa for February 2027. After her July visit, it feels wiser to pause that timeline and plan another three-month visit first, probably April 2027, before we commit to marriage paperwork.",
      { minStructured: 2, kinds: ["pursuit"], hubSlug: "romance", status: "PAUSED" },
    ),
  ];
}

function _buildDynamicCases(map: MapSnapshot): { cases: DogfoodCase[]; fixturesUsed: string[] } {
  const cases: DogfoodCase[] = [];
  const fixturesUsed: string[] = [];

  const youtubeGoal = findGoal(map, (g) =>
    /\b(youtube|subscriber|subscribers|subs)\b/i.test(g.title),
  );
  if (youtubeGoal) {
    fixturesUsed.push(`continuation: ${youtubeGoal.title} (${youtubeGoal.id})`);
    cases.push({
      id: "dynamic-youtube-continuation",
      category: "multi-session",
      label: "Dynamic continuation — YouTube subs",
      mode: "theme",
      themeId: (youtubeGoal.themeId as LifeAreaId) ?? "work",
      input: "I want to hit 25k YouTube subs by 2028.",
      expect: {
        minStructured: 1,
        continuationOfGoalId: youtubeGoal.id,
      },
    });
  }

  const teethGoal = findGoal(
    map,
    (g) =>
      /\b(teeth|dental|invisalign|orthodont|appearance|smile)\b/i.test(g.title) &&
      (g.hubSlug === "appearance" || g.themeId === "health"),
  );
  if (teethGoal) {
    fixturesUsed.push(`milestone: ${teethGoal.title} (${teethGoal.id})`);
    cases.push({
      id: "dynamic-invisalign-milestone",
      category: "milestone-status",
      label: "Dynamic milestone — Invisalign on existing pursuit",
      mode: "theme",
      themeId: "health",
      input: "Get Invisalign.",
      expect: {
        milestoneOnGoalId: teethGoal.id,
        forbidNewPursuit: true,
      },
    });
  }

  const isaGoal = findGoal(map, (g) =>
    /\b(isa|stocks and shares|savings target|£\d|k isa)\b/i.test(g.title),
  );
  if (isaGoal) {
    fixturesUsed.push(`continuation: ${isaGoal.title} (${isaGoal.id})`);
    cases.push({
      id: "dynamic-isa-continuation",
      category: "multi-session",
      label: "Dynamic continuation — ISA target",
      mode: "theme",
      themeId: "finance",
      input: "Grow my ISA to £1M by 2030.",
      expect: {
        minStructured: 1,
        continuationOfGoalId: isaGoal.id,
      },
    });
  }

  const marathonGoal = findGoal(map, (g) => /\bmarathon\b/i.test(g.title));
  if (marathonGoal) {
    fixturesUsed.push(`continuation: ${marathonGoal.title} (${marathonGoal.id})`);
    cases.push({
      id: "dynamic-marathon-continuation",
      category: "multi-session",
      label: "Dynamic continuation — marathon target",
      mode: "theme",
      themeId: "health",
      input: "Run a sub-3:30 marathon in 2027.",
      expect: {
        minStructured: 1,
        continuationOfGoalId: marathonGoal.id,
      },
    });
  }

  const activeGoal = findGoal(
    map,
    (g) => g.status === "ACTIVE" && g.title.length > 8,
  );
  if (activeGoal) {
    fixturesUsed.push(`status-complete: ${activeGoal.title} (${activeGoal.id})`);
    cases.push({
      id: "dynamic-status-complete",
      category: "milestone-status",
      label: "Dynamic embellishment — mark pursuit complete",
      mode: "theme",
      themeId: activeGoal.themeId as LifeAreaId,
      input: `Finished "${activeGoal.title}" — done and dusted.`,
      expect: {
        existingGoalId: activeGoal.id,
        status: "COMPLETE",
      },
    });
  }

  const onHoldCandidate = findGoal(
    map,
    (g) => g.status === "ACTIVE" && g.id !== activeGoal?.id,
  );
  if (onHoldCandidate) {
    fixturesUsed.push(`status-hold: ${onHoldCandidate.title} (${onHoldCandidate.id})`);
    cases.push({
      id: "dynamic-status-on-hold",
      category: "contradictory-pivots",
      label: "Dynamic status — pause pursuit",
      mode: "theme",
      themeId: onHoldCandidate.themeId as LifeAreaId,
      input: `Pausing "${onHoldCandidate.title}" for now — taking a break.`,
      expect: {
        existingGoalId: onHoldCandidate.id,
        status: "PAUSED",
      },
    });
  }

  return { cases, fixturesUsed };
}

function buildAllCases(map: MapSnapshot): { cases: DogfoodCase[]; fixturesUsed: string[] } {
  const staticCases = buildStaticCases(map);
  return { cases: staticCases, fixturesUsed: [] };
}

// ——— Phase 3: extract HTTP ———

async function postExtract(
  session: ScriptSession,
  testCase: DogfoodCase,
): Promise<{ status: number; body: StreamExtractResponse | { error: string } }> {
  const payload =
    testCase.mode === "theme"
      ? { themeId: testCase.themeId, input: testCase.input, inputMode: "text" as const }
      : {
          hubId: testCase.hubBranchId,
          input: testCase.input,
          inputMode: "text" as const,
        };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  try {
    const res = await apiFetch(session, "/api/stream/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await res.json()) as StreamExtractResponse | { error: string };
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function formatParentRef(
  pursuit: ExtractedPursuit | ExtractedMilestone,
  field: "parentRef" | "pursuitRef",
): string | null {
  const ref =
    field === "parentRef"
      ? "parentRef" in pursuit
        ? pursuit.parentRef
        : undefined
      : "pursuitRef" in pursuit
        ? pursuit.pursuitRef
        : undefined;
  if (!ref) return null;
  if (ref.kind === "existing") return `existing:${ref.goalId}`;
  return `new:${ref.clientKey}`;
}

function normalizeExtraction(
  extraction: StreamExtractResponse,
  titleByRef: Map<string, string>,
  testCase: DogfoodCase,
): ExtractedLogRow[] {
  for (const p of extraction.pursuits) {
    if (p.clientKey) titleByRef.set(p.clientKey, p.title);
    if (p.existingGoalId) titleByRef.set(p.existingGoalId, p.title);
  }

  const queue = buildQueue(extraction, titleByRef);
  const rows: ExtractedLogRow[] = [];

  for (const item of queue) {
    const variant = streamCardVariant(item);
    const hubPlacement =
      testCase.mode === "hub"
        ? (testCase.hubSlug ?? "hub")
        : (item.kind === "mark"
            ? item.item.hubId
            : item.kind === "pursuit"
              ? item.item.hubId
              : item.kind === "milestone"
                ? item.item.hubId
                : item.item.hubId) ?? "(missing)";

    const confidence: "ok" | "low" =
      item.kind === "ambiguous" ||
      (testCase.mode === "theme" && hubPlacement === "(missing)")
        ? "low"
        : "ok";

    const title =
      item.kind === "ambiguous" ? item.item.label : item.item.title;

    const parentRef =
      item.kind === "pursuit"
        ? formatParentRef(item.item, "parentRef")
        : item.kind === "milestone"
          ? formatParentRef(item.item, "pursuitRef")
          : null;

    rows.push({
      cardType: variant,
      hubPlacement: String(hubPlacement),
      confidence,
      title,
      parentRef,
    });
  }

  if (extraction.ambiguous.length > 0) {
    for (const amb of extraction.ambiguous) {
      rows.push({
        cardType: "ambiguous",
        hubPlacement: amb.hubId ?? "(ambiguous)",
        confidence: "low",
        title: amb.label,
        parentRef: null,
      });
    }
  }

  return rows;
}

// ——— Phase 4: score ———

function structuredCount(extraction: StreamExtractResponse): number {
  return extraction.marks.length + extraction.pursuits.length + extraction.milestones.length;
}

function scoreCase(
  testCase: DogfoodCase,
  status: number,
  body: StreamExtractResponse | { error: string },
  extracted: ExtractedLogRow[],
  map: MapSnapshot,
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const expect = testCase.expect;

  if (status !== 200) {
    const err = "error" in body ? body.error : `HTTP ${status}`;
    anomalies.push({
      code: status === 400 || status === 502 ? "validation_error" : "http_error",
      severity: "critical",
      message: err,
    });
    return anomalies;
  }

  const extraction = body as StreamExtractResponse;
  const structured = structuredCount(extraction);
  const themeId = testCase.themeId;

  if (expect.minStructured !== undefined && structured < expect.minStructured) {
    anomalies.push({
      code: "empty_extraction",
      severity: "critical",
      message: `Expected ≥${expect.minStructured} structured items, got ${structured}`,
    });
  }

  if (expect.maxStructured !== undefined && structured > expect.maxStructured) {
    anomalies.push({
      code: "over_extracted",
      severity: "warning",
      message: `Expected ≤${expect.maxStructured} structured items, got ${structured}`,
    });
  }

  if (expect.preferAmbiguous) {
    if (structured > 0) {
      anomalies.push({
        code: "unexpected_structured",
        severity: "critical",
        message: `Expected ambiguous-only routing, got ${structured} structured item(s)`,
      });
    }
    if (extraction.ambiguous.length === 0) {
      anomalies.push({
        code: "missing_ambiguous",
        severity: "critical",
        message: "Expected ambiguous[] entries for unclear input",
      });
    }
    if (testCase.mode === "theme") {
      const missingHubIdCount = extraction.ambiguous.filter((a) => !a.hubId?.trim()).length;
      if (missingHubIdCount > 0) {
        anomalies.push({
          code: "missing_ambiguous_hub",
          severity: "critical",
          message: `Expected theme ambiguous[] entries to include hubId, ${missingHubIdCount} missing`,
        });
      }
    }
    if (extraction.ambiguous.length > 0 && (extraction.committedAmbiguousCount ?? 0) < 1) {
      anomalies.push({
        code: "missing_needs_resolution_commit",
        severity: "critical",
        message: "Expected ambiguous items to commit as needsResolution nodes",
      });
    }
  }

  if (expect.kinds?.length) {
    const queueKinds = new Set<ConfirmationKind>();
    for (const row of extracted) {
      if (row.cardType === "mark") queueKinds.add("mark");
      else if (row.cardType.startsWith("pursuit")) queueKinds.add("pursuit");
      else if (row.cardType === "milestone") queueKinds.add("milestone");
      else if (row.cardType === "ambiguous") queueKinds.add("ambiguous");
    }
    for (const kind of expect.kinds) {
      if (!queueKinds.has(kind)) {
        anomalies.push({
          code: "missing_kind",
          severity: "warning",
          message: `Expected kind "${kind}" in extraction`,
        });
      }
    }
  }

  const expectedHubSlugs = [
    ...(expect.hubSlug ? [expect.hubSlug] : []),
    ...(expect.hubSlugs ?? []),
  ];

  if (expectedHubSlugs.length > 0 && themeId) {
    const validSlugs = validHubLabelKeysForTheme(themeId);
    const hubIds = [
      ...extraction.marks.map((m) => m.hubId),
      ...extraction.pursuits.map((p) => p.hubId),
      ...extraction.milestones.map((m) => m.hubId),
    ].filter(Boolean) as string[];
    const expectedValidSlugs = expectedHubSlugs.filter((h) => validSlugs.has(h));
    const missing = expectedValidSlugs.filter((expected) => !hubIds.includes(expected));
    if (missing.length > 0 && structured > 0) {
      anomalies.push({
        code: "wrong_hub",
        severity: "warning",
        message: `Expected hub slug(s) ${missing.map((h) => `"${h}"`).join(", ")}, got: ${hubIds.join(", ") || "(none)"}`,
      });
    }
    for (const h of hubIds) {
      if (!validSlugs.has(h)) {
        anomalies.push({
          code: "wrong_hub",
          severity: "critical",
          message: `Invalid hub slug "${h}" for theme ${themeId}`,
        });
      }
    }
  }

  if (themeId && testCase.mode === "theme" && structured > 0) {
    const missingHub = [
      ...extraction.marks,
      ...extraction.pursuits,
      ...extraction.milestones,
    ].some((item) => !item.hubId);
    if (missingHub) {
      anomalies.push({
        code: "low_confidence_placement",
        severity: "warning",
        message: "Theme extract item missing hubId",
      });
    }
  }

  if (expect.continuation) {
    const parentMatch = extraction.pursuits.some((p) => p.parentRef);
    if (!parentMatch) {
      anomalies.push({
        code: "missing_continuation",
        severity: "critical",
        message: "Expected at least one continuation pursuit with parentRef",
      });
    }
  }

  if (expect.continuationOfGoalId) {
    const parentMatch = extraction.pursuits.some(
      (p) =>
        p.parentRef?.kind === "existing" &&
        p.parentRef.goalId === expect.continuationOfGoalId,
    );
    if (!parentMatch) {
      anomalies.push({
        code: "missing_continuation",
        severity: "critical",
        message: `Expected parentRef → existing:${expect.continuationOfGoalId}`,
      });
    }
  }

  if (expect.milestone && extraction.milestones.length === 0) {
    anomalies.push({
      code: "missing_milestone",
      severity: "critical",
      message: "Expected at least one milestone card",
    });
  }

  if (expect.milestoneOnGoalId) {
    const msMatch = extraction.milestones.some(
      (m) =>
        m.pursuitRef.kind === "existing" && m.pursuitRef.goalId === expect.milestoneOnGoalId,
    );
    if (!msMatch) {
      anomalies.push({
        code: "pursuit_not_milestone",
        severity: "critical",
        message: `Expected milestone on goal ${expect.milestoneOnGoalId}, milestones: ${extraction.milestones.length}, new pursuits: ${extraction.pursuits.filter((p) => !p.existingGoalId).length}`,
      });
    }
    const newPeers = extraction.pursuits.filter((p) => !p.existingGoalId && !p.parentRef);
    if (newPeers.length > 0) {
      anomalies.push({
        code: "pursuit_not_milestone",
        severity: "critical",
        message: `Expected no new peer pursuits, got: ${newPeers.map((p) => p.title).join("; ")}`,
      });
    }
  }

  if (expect.forbidNewPursuit) {
    const newPursuits = extraction.pursuits.filter((p) => !p.existingGoalId);
    if (newPursuits.length > 0 && !expect.milestoneOnGoalId && !expect.milestone) {
      anomalies.push({
        code: "pursuit_not_milestone",
        severity: "critical",
        message: `forbidNewPursuit: ${newPursuits.map((p) => p.title).join("; ")}`,
      });
    }
  }

  if (expect.status && !expect.existingGoalId) {
    const match = extraction.pursuits.some((p) => p.status === expect.status);
    if (!match) {
      anomalies.push({
        code: "wrong_bloom_status",
        severity: "critical",
        message: `Expected at least one pursuit with bloomStatus ${expect.status}`,
      });
    }
  }

  if (expect.existingGoalId) {
    const match = extraction.pursuits.some((p) => p.existingGoalId === expect.existingGoalId);
    if (!match) {
      anomalies.push({
        code: "missing_existing_goal",
        severity: "critical",
        message: `Expected existingGoalId ${expect.existingGoalId}`,
      });
    } else if (expect.status) {
      const row = extraction.pursuits.find((p) => p.existingGoalId === expect.existingGoalId);
      if (row && row.status !== expect.status) {
        anomalies.push({
          code: "wrong_bloom_status",
          severity: "critical",
          message: `Expected bloomStatus ${expect.status}, got ${row.status}`,
        });
      }
    }
  }

  const newPursuitTitles = extraction.pursuits
    .filter((p) => !p.existingGoalId)
    .map((p) => p.title.trim());

  if (expect.pursuitTitleOneOfSubstrings?.length) {
    if (newPursuitTitles.length === 0) {
      anomalies.push({
        code: "missing_new_pursuit",
        severity: "critical",
        message: "Expected at least one new pursuit for title framing check",
      });
    } else {
      const needles = expect.pursuitTitleOneOfSubstrings.map((s) => s.toLowerCase());
      const ok = newPursuitTitles.some((title) =>
        needles.some((needle) => title.toLowerCase().includes(needle)),
      );
      if (!ok) {
        anomalies.push({
          code: "connection_title_mismatch",
          severity: "critical",
          message: `Expected new pursuit title to match one of [${expect.pursuitTitleOneOfSubstrings.join(", ")}], got: ${newPursuitTitles.join("; ") || "(none)"}`,
        });
      }
    }
  }

  if (expect.pursuitTitleForbiddenSubstrings?.length && newPursuitTitles.length > 0) {
    const forbidden = expect.pursuitTitleForbiddenSubstrings.map((s) => s.toLowerCase());
    for (const title of newPursuitTitles) {
      const lower = title.toLowerCase();
      const hit = forbidden.find((f) => lower.includes(f));
      if (hit) {
        anomalies.push({
          code: "goal_framed_title",
          severity: "critical",
          message: `Goal-framed pursuit title "${title}" (matched "${hit}")`,
        });
      }
    }
  }

  if (expect.markOrMilestoneTitleOneOfSubstrings?.length) {
    const secondaryTitles = [
      ...extraction.marks.map((m) => m.title),
      ...extraction.milestones.map((m) => m.title),
    ];
    const needles = expect.markOrMilestoneTitleOneOfSubstrings.map((s) => s.toLowerCase());
    const ok = secondaryTitles.some((title) =>
      needles.some((needle) => title.toLowerCase().includes(needle)),
    );
    if (!ok) {
      anomalies.push({
        code: "missing_plan_or_moment",
        severity: "warning",
        message: `Expected mark/milestone title to include one of [${expect.markOrMilestoneTitleOneOfSubstrings.join(", ")}], got marks: ${extraction.marks.map((m) => m.title).join("; ") || "(none)"}; milestones: ${extraction.milestones.map((m) => m.title).join("; ") || "(none)"}`,
      });
    }
  }

  if (expect.forbidHubSlugs?.length && themeId && testCase.mode === "theme") {
    const forbidden = new Set(expect.forbidHubSlugs);
    const hubIds = [
      ...extraction.marks.map((m) => m.hubId),
      ...extraction.pursuits.map((p) => p.hubId),
      ...extraction.milestones.map((m) => m.hubId),
      ...extraction.ambiguous.map((a) => a.hubId),
    ].filter(Boolean) as string[];
    for (const hubId of hubIds) {
      if (forbidden.has(hubId)) {
        anomalies.push({
          code: "wrong_hub",
          severity: "critical",
          message: `Item routed to forbidden hub "${hubId}"`,
        });
      }
    }
  }

  void map;
  return anomalies;
}

function isPass(anomalies: Anomaly[]): boolean {
  return !anomalies.some((a) => a.severity === "critical");
}

function categorySummary(results: CaseResult[]): Record<ScenarioCategory, CategorySummary> {
  const entries = Object.keys(SCENARIO_CATEGORY_LABELS).map((category) => {
    const categoryResults = results.filter((r) => r.category === category);
    const total = categoryResults.length;
    const passCount = categoryResults.filter((r) => r.pass).length;
    const extractedOk = categoryResults.filter((r) => r.status === 200 && r.structuredCount > 0).length;
    const misplacementCount = categoryResults.reduce(
      (n, r) =>
        n +
        r.anomalies.filter((a) =>
          ["wrong_hub", "low_confidence_placement"].includes(a.code),
        ).length,
      0,
    );
    const errorCount = categoryResults.filter(
      (r) => r.anomalies.some((a) => a.code === "http_error" || a.code === "validation_error"),
    ).length;

    return [
      category,
      {
        total,
        passCount,
        passRate: total > 0 ? passCount / total : 0,
        extractionRate: total > 0 ? extractedOk / total : 0,
        misplacementCount,
        errorCount,
      },
    ] as const;
  });

  return Object.fromEntries(entries) as Record<ScenarioCategory, CategorySummary>;
}

function logCaseBlock(result: CaseResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(`\n[${result.id}] ${status}`);
  console.log(`  ${SCENARIO_CATEGORY_LABELS[result.category]} / ${result.label}`);
  console.log(`  input: ${JSON.stringify(result.input.slice(0, 120))}${result.input.length > 120 ? "…" : ""}`);
  if (result.error) console.log(`  error: ${result.error}`);
  console.log(`  items (${result.extracted.length}):`);
  for (const row of result.extracted) {
    const parent = row.parentRef ? ` | parentRef→${row.parentRef}` : "";
    console.log(
      `    - ${row.cardType} | ${row.hubPlacement} | ${row.confidence} | ${JSON.stringify(row.title)}${parent}`,
    );
  }
  if (result.anomalies.length > 0) {
    console.log("  anomalies:");
    for (const a of result.anomalies) {
      console.log(`    [${a.severity}] ${a.code}: ${a.message}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ——— Phase 5: main ———

async function main(): Promise<void> {
  const writeJson = process.argv.includes("--json");

  console.log("=== Stream dogfood ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Dev user (map): ${DEV_EMAIL}`);
  console.log(`Delay between API calls: ${EXTRACT_DELAY_MS}ms`);

  const map = await loadMap();
  console.log(
    `Map: ${map.goals.length} goals, ${map.marks.length} marks, ${map.branches.length} active branches`,
  );

  let { cases, fixturesUsed } = buildAllCases(map);
  const onlyIdx = process.argv.indexOf("--only");
  if (onlyIdx >= 0) {
    const onlyCategory = process.argv[onlyIdx + 1] as ScenarioCategory | undefined;
    if (!onlyCategory || !SCENARIO_CATEGORY_LABELS[onlyCategory]) {
      throw new Error(
        `Unknown --only category "${onlyCategory ?? ""}". Use one of: ${Object.keys(SCENARIO_CATEGORY_LABELS).join(", ")}`,
      );
    }
    cases = cases.filter((c) => c.category === onlyCategory);
  }
  console.log(`Cases: ${cases.length} (${cases.filter((c) => c.mode === "theme").length} theme, ${cases.filter((c) => c.mode === "hub").length} hub)`);
  if (fixturesUsed.length > 0) {
    console.log("DB fixtures:");
    for (const f of fixturesUsed) console.log(`  - ${f}`);
  } else {
    console.log("DB fixtures: (none — add pursuits for dynamic continuation/milestone tests)");
  }

  const session = await loginWithCredentials(E2E_EMAIL, E2E_PASSWORD);
  console.log(`Session OK (login as ${E2E_EMAIL}, session as ${session.email}, map as ${map.userEmail})`);
  if (session.email !== map.userEmail) {
    throw new Error(
      `Dogfood session/map user mismatch: session is ${session.email}, map is ${map.userEmail}. Set E2E_EMAIL so they match.`,
    );
  }

  const results: CaseResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]!;
    const started = Date.now();
    let status: number | null = null;
    let error: string | null = null;
    let extracted: ExtractedLogRow[] = [];
    let anomalies: Anomaly[] = [];
    let structured = 0;
    let ambiguousCount = 0;
    let committedAmbiguousCount = 0;

    try {
      const { status: st, body } = await postExtract(session, testCase);
      status = st;
      if (st === 200) {
        const extraction = body as StreamExtractResponse;
        structured = structuredCount(extraction);
        ambiguousCount = extraction.ambiguous.length;
        committedAmbiguousCount = extraction.committedAmbiguousCount ?? 0;
        const titleByRef = new Map(map.titleByRef);
        extracted = normalizeExtraction(extraction, titleByRef, testCase);
        anomalies = scoreCase(testCase, st, body, extracted, map);
      } else {
        error = "error" in body ? body.error : `HTTP ${st}`;
        extracted = [];
        anomalies = scoreCase(testCase, st, body, extracted, map);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      anomalies = [
        {
          code: "http_error",
          severity: "critical",
          message: error,
        },
      ];
    }

    const result: CaseResult = {
      id: testCase.id,
      category: testCase.category,
      label: testCase.label,
      pass: isPass(anomalies),
      input: testCase.input,
      mode: testCase.mode,
      status,
      error,
      extracted,
      ambiguousCount,
      committedAmbiguousCount,
      structuredCount: structured,
      anomalies,
      durationMs: Date.now() - started,
    };
    results.push(result);
    logCaseBlock(result);

    if (i < cases.length - 1) await sleep(EXTRACT_DELAY_MS);
  }

  const total = results.length;
  const extractedOk = results.filter((r) => r.status === 200 && r.structuredCount > 0).length;
  const extractionRate = total > 0 ? extractedOk / total : 0;
  const misplacementCount = results.reduce(
    (n, r) =>
      n +
      r.anomalies.filter((a) =>
        ["wrong_hub", "low_confidence_placement"].includes(a.code),
      ).length,
    0,
  );
  const errorCount = results.filter(
    (r) => r.anomalies.some((a) => a.code === "http_error" || a.code === "validation_error"),
  ).length;
  const passCount = results.filter((r) => r.pass).length;
  const passRate = total > 0 ? passCount / total : 0;
  const byCategory = categorySummary(results);

  console.log("\n=== Stream dogfood summary ===");
  console.log(`Total inputs:     ${total}`);
  console.log(
    `Extraction rate:  ${extractedOk}/${total} (${(extractionRate * 100).toFixed(1)}%)`,
  );
  console.log(`Misplacements:    ${misplacementCount}`);
  console.log(`Errors:           ${errorCount}`);
  console.log(`Passed:           ${passCount}/${total} (${(passRate * 100).toFixed(1)}%)`);
  console.log("\nBy scenario category:");
  for (const [category, summary] of Object.entries(byCategory) as Array<[ScenarioCategory, CategorySummary]>) {
    console.log(
      `  ${SCENARIO_CATEGORY_LABELS[category]}: ${summary.passCount}/${summary.total} passed (${(summary.passRate * 100).toFixed(1)}%), extraction ${(summary.extractionRate * 100).toFixed(1)}%, misplacements ${summary.misplacementCount}, errors ${summary.errorCount}`,
    );
  }

  const report: DogfoodReport = {
    runAt: new Date().toISOString(),
    userEmail: map.userEmail,
    baseUrl: BASE_URL,
    mapSnapshot: {
      goalCount: map.goals.length,
      markCount: map.marks.length,
      branchCount: map.branches.length,
    },
    fixturesUsed,
    summary: {
      total,
      extractionRate,
      misplacementCount,
      errorCount,
      passCount,
      passRate,
      byCategory,
    },
    results,
  };

  if (writeJson) {
    const outPath = join(process.cwd(), "scripts", "dogfood-results.json");
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nWrote ${outPath}`);
  }

  if (passCount < total) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Dogfood failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
