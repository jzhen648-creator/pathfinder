import { PrismaClient, type BloomStatus, type BranchStatus, type MarkSentiment, type MarkType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type BranchSeed = {
  limbId: string;
  threadType: string;
  name: string;
  parentThreadType?: string;
  goal: string | null;
  goalValue: number | null;
  currentValue: number | null;
  unit: string | null;
  status: BranchStatus;
  bloomStatus: BloomStatus;
  createdAt: Date;
};

type MarkSeed = {
  branchThreadType: string;
  limbId: string;
  title: string;
  description: string;
  date: Date;
  year: number;
  type: MarkType;
  significance: number;
  sentiment: MarkSentiment;
  value: number | null;
  isTurningPoint: boolean;
  future: boolean;
  bloomStatus: "BLOOMED" | "GROWING" | "ENDED" | "BRANCHED" | "BUD";
};

type UserTreeSeed = {
  email: string;
  name: string;
  branchSeeds: BranchSeed[];
  markSeeds: MarkSeed[];
};

const branchSeeds: BranchSeed[] = [
  { limbId: "finance", threadType: "Income", name: "Income", goal: "Reach £100k salary", goalValue: 100000, currentValue: 60000, unit: "£", status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-06-01") },
  { limbId: "finance", threadType: "Investing", name: "Investing", goal: "ISA £40k", goalValue: 40000, currentValue: 20000, unit: "£", status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-03-01") },
  { limbId: "work", threadType: "Career", name: "Career", goal: "Build something independent", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2017-07-01") },
  { limbId: "work", threadType: "Skills", name: "Skills", goal: "Master full-stack AI development", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-01-01") },
  { limbId: "work", threadType: "Projects", name: "Projects", goal: "Ship Pathfinder", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-06-01") },
  { limbId: "becoming", threadType: "Identity", name: "Identity", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-03-01") },
  { limbId: "becoming", threadType: "Habits", name: "Habits", goal: "Four core habits stable", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-01-01") },
  { limbId: "people", threadType: "Family", name: "Family", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2000-01-01") },
  { limbId: "people", threadType: "Romance", name: "Romance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-03-01") },
  { limbId: "people", threadType: "Friendships", name: "Friendships", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-01-01") },
  { limbId: "health", threadType: "Fitness", name: "Fitness", goal: "Run a marathon", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-01-01") },
  { limbId: "health", threadType: "Mental health", name: "Mental health", goal: "Sustained care plan", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-04-01") },
];

const markSeeds: MarkSeed[] = [
  { branchThreadType: "Income", limbId: "finance", title: "First salary", description: "First full-time income. Felt unreal.", date: new Date("2018-06-15"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: 20000, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Income", limbId: "finance", title: "Promotion", description: "First recognition the work was worth more.", date: new Date("2020-04-01"), year: 2020, type: "achievement", significance: 1, sentiment: "positive", value: 25000, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Income", limbId: "finance", title: "Senior role", description: "Finally compensated at the right level.", date: new Date("2022-03-01"), year: 2022, type: "achievement", significance: 2, sentiment: "positive", value: 40000, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Income", limbId: "finance", title: "Lead compensation", description: "Negotiated hard. Still growing.", date: new Date("2024-01-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: 60000, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Investing", limbId: "finance", title: "ISA opened", description: "Started with nothing. The point was to start.", date: new Date("2020-03-15"), year: 2020, type: "milestone", significance: 1, sentiment: "positive", value: 0, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "£10k milestone", description: "First real number. Compounding clicked.", date: new Date("2021-06-01"), year: 2021, type: "achievement", significance: 2, sentiment: "positive", value: 10000, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "£20k reached", description: "Halfway. This one felt significant.", date: new Date("2023-02-01"), year: 2023, type: "achievement", significance: 3, sentiment: "positive", value: 20000, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "Target: £40k", description: "The goal is in sight.", date: new Date("2025-01-01"), year: 2025, type: "milestone", significance: 3, sentiment: "positive", value: 40000, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Career", limbId: "work", title: "Graduated", description: "Computer Science. No idea what came next.", date: new Date("2017-07-01"), year: 2017, type: "milestone", significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Career", limbId: "work", title: "Agency role", description: "Learned fast. Burned out faster.", date: new Date("2019-03-01"), year: 2019, type: "milestone", significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Career", limbId: "work", title: "Building Pathfinder", description: "Left the agency path. Building something real.", date: new Date("2024-01-01"), year: 2024, type: "decision", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Skills", limbId: "work", title: "React deep dive", description: "Went from using it to understanding it.", date: new Date("2020-06-01"), year: 2020, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Skills", limbId: "work", title: "SVG & canvas", description: "Unlocked a whole new level of what I can build.", date: new Date("2023-03-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Skills", limbId: "work", title: "AI integration", description: "Still figuring out the edges.", date: new Date("2024-06-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Projects", limbId: "work", title: "First side project", description: "Shipped something small. Mattered more than it looked.", date: new Date("2021-09-01"), year: 2021, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Projects", limbId: "work", title: "Pathfinder v1", description: "Wrong direction, right instinct.", date: new Date("2023-06-01"), year: 2023, type: "milestone", significance: 3, sentiment: "neutral", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Projects", limbId: "work", title: "Pathfinder tree", description: "This version. The one that feels honest.", date: new Date("2024-06-01"), year: 2024, type: "achievement", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Therapy starts", description: "Finally asked for help.", date: new Date("2020-03-01"), year: 2020, type: "decision", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Identity shift", description: "Stopped performing. Started being.", date: new Date("2022-08-01"), year: 2022, type: "realisation", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Calm under pressure", description: "Something that used to be loud got quiet.", date: new Date("2024-03-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Morning routine", description: "Small and imperfect. Still counts.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Four habits stable", description: "First time they stuck past 90 days.", date: new Date("2023-04-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Weekly review", description: "Building the habit of looking at the whole picture.", date: new Date("2024-06-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Family", limbId: "people", title: "Family of origin", description: "Where it all started. Still shapes everything.", date: new Date("2000-01-01"), year: 2000, type: "milestone", significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Family", limbId: "people", title: "Dad's diagnosis", description: "Everything shifted. Still processing.", date: new Date("2023-09-01"), year: 2023, type: "setback", significance: 3, sentiment: "negative", value: null, isTurningPoint: false, future: false, bloomStatus: "ENDED" },
  { branchThreadType: "Romance", limbId: "people", title: "Met Sam", description: "Changed what home meant to me. Still does.", date: new Date("2021-03-01"), year: 2021, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Romance", limbId: "people", title: "Moved in together", description: "The ordinary becoming the permanent.", date: new Date("2022-06-01"), year: 2022, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Romance", limbId: "people", title: "Engaged", description: "Still can't fully believe it.", date: new Date("2024-02-01"), year: 2024, type: "achievement", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Friendships", limbId: "people", title: "Met Jamie", description: "The friend who shows up.", date: new Date("2019-06-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Friendships", limbId: "people", title: "Weekly support ritual", description: "Built deliberately. One of the better decisions.", date: new Date("2022-01-01"), year: 2022, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Friendships", limbId: "people", title: "Smaller, deeper circle", description: "Quality over breadth.", date: new Date("2024-01-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Fitness", limbId: "health", title: "First 5k", description: "28:42. Couldn't believe I finished.", date: new Date("2022-03-01"), year: 2022, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Fitness", limbId: "health", title: "Half marathon", description: "Ran 21k. Cried at the finish line.", date: new Date("2023-05-01"), year: 2023, type: "achievement", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Fitness", limbId: "health", title: "Marathon 3:58", description: "Training. Target: sub 4 hours.", date: new Date("2024-10-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Mental health", limbId: "health", title: "Better therapist fit", description: "Third attempt. This one worked.", date: new Date("2022-05-01"), year: 2022, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Mental health", limbId: "health", title: "Anxiety baseline drops", description: "First extended period of genuine quiet.", date: new Date("2023-08-01"), year: 2023, type: "realisation", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Mental health", limbId: "health", title: "Sustained care plan", description: "Treating it like maintenance, not crisis management.", date: new Date("2024-04-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
];

const branchSeedsJordanVale: BranchSeed[] = [
  { limbId: "finance", threadType: "Debt", name: "Debt", goal: "Clear remaining debt", goalValue: 0, currentValue: 6000, unit: "£", status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-01-01") },
  { limbId: "finance", threadType: "Savings", name: "Savings", goal: "Emergency fund £12k", goalValue: 12000, currentValue: 3500, unit: "£", status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-02-01") },
  { limbId: "work", threadType: "Career", name: "Career", goal: "Transition into product design", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-03-01") },
  { limbId: "work", threadType: "Study", name: "Study", goal: "Finish UX diploma", goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2023-09-01") },
  { limbId: "work", threadType: "Freelance", name: "Freelance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ENDED", createdAt: new Date("2019-04-01") },
  { limbId: "becoming", threadType: "Identity", name: "Identity", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-01-01") },
  { limbId: "becoming", threadType: "Boundaries", name: "Boundaries", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-05-01") },
  { limbId: "people", threadType: "Family", name: "Family", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ENDED", createdAt: new Date("2018-06-01") },
  { limbId: "people", threadType: "Parenting", name: "Parenting", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-10-01") },
  { limbId: "people", threadType: "Community", name: "Community", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2023-01-01") },
  { limbId: "health", threadType: "Recovery", name: "Recovery", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2017-02-01") },
  { limbId: "health", threadType: "Sleep", name: "Sleep", goal: "7h average", goalValue: 7, currentValue: 6, unit: "hours", status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-02-01") },
];

/**
 * Four root branches per limb (20 threads total), aligned with fork geometry — see AREA_FORKS_BASE &
 * THREAD_SLOTS.
 */
const branchSeedsFullTreeShowcase: BranchSeed[] = [
  { limbId: "finance", threadType: "Income", name: "Income", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-01-01") },
  { limbId: "finance", threadType: "Investing", name: "Investing", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2017-06-01") },
  { limbId: "finance", threadType: "Cash buffer", name: "Cash buffer", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-03-01") },
  { limbId: "finance", threadType: "Giving", name: "Giving", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-05-01") },
  { limbId: "work", threadType: "Career", name: "Career", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2015-01-01") },
  { limbId: "work", threadType: "Skills", name: "Skills", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-03-01") },
  { limbId: "work", threadType: "Projects", name: "Projects", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-09-01") },
  { limbId: "work", threadType: "Leadership", name: "Leadership", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Vision", name: "Vision", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-01-01") },
  { limbId: "becoming", threadType: "Growth path", name: "Growth path", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-04-01") },
  { limbId: "becoming", threadType: "Identity", name: "Identity", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Habits", name: "Habits", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-08-01") },
  { limbId: "people", threadType: "Family", name: "Family", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2005-01-01") },
  { limbId: "people", threadType: "Romance", name: "Romance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2012-05-01") },
  { limbId: "people", threadType: "Friendships", name: "Friendships", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2014-02-01") },
  { limbId: "people", threadType: "Community", name: "Community", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-06-01") },
  { limbId: "health", threadType: "Fitness", name: "Fitness", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-01-01") },
  { limbId: "health", threadType: "Mental health", name: "Mental health", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-07-01") },
  { limbId: "health", threadType: "Sleep", name: "Sleep", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-03-01") },
  { limbId: "health", threadType: "Nutrition", name: "Nutrition", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-04-01") },
];

const markSeedsFullTreeShowcase: MarkSeed[] = [
  { branchThreadType: "Income", limbId: "finance", title: "First paycheque", description: "Demo mark on finance thread 0.", date: new Date("2016-06-01"), year: 2016, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Income", limbId: "finance", title: "Raise cycle", description: "Second demo mark.", date: new Date("2020-01-01"), year: 2020, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "ISA opened", description: "Finance thread 1.", date: new Date("2018-03-01"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "First index fund", description: "Growing allocation.", date: new Date("2022-04-01"), year: 2022, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Cash buffer", limbId: "finance", title: "Three-month runway", description: "Finance thread 2.", date: new Date("2019-01-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Cash buffer", limbId: "finance", title: "Stress drops", description: "Finance thread 2 continued.", date: new Date("2024-06-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Giving", limbId: "finance", title: "First recurring gift", description: "Finance thread 3.", date: new Date("2020-03-01"), year: 2020, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Giving", limbId: "finance", title: "Annual pledge up", description: "Finance thread 3 continued.", date: new Date("2024-01-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Career", limbId: "work", title: "First role", description: "Work thread 0.", date: new Date("2015-09-01"), year: 2015, type: "milestone", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Career", limbId: "work", title: "Leadership scope", description: "Work thread 0 continued.", date: new Date("2023-01-01"), year: 2023, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Skills", limbId: "work", title: "Deep technical focus", description: "Work thread 1.", date: new Date("2017-01-01"), year: 2017, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Skills", limbId: "work", title: "Teaching others", description: "Work thread 1 continued.", date: new Date("2024-06-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Projects", limbId: "work", title: "Side project shipped", description: "Work thread 2.", date: new Date("2019-01-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Projects", limbId: "work", title: "Flagship build", description: "Work thread 2 continued.", date: new Date("2024-11-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Leadership", limbId: "work", title: "First mentee", description: "Work thread 3.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Leadership", limbId: "work", title: "Team charter", description: "Work thread 3 continued.", date: new Date("2024-08-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Vision", limbId: "becoming", title: "North star written", description: "Becoming thread 0.", date: new Date("2019-03-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Vision", limbId: "becoming", title: "Vision refined", description: "Becoming thread 0 continued.", date: new Date("2024-01-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Growth path", limbId: "becoming", title: "Mentor season", description: "Becoming thread 1.", date: new Date("2019-08-01"), year: 2019, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Growth path", limbId: "becoming", title: "Course sprint", description: "Becoming thread 1 continued.", date: new Date("2023-05-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Values clarified", description: "Becoming thread 2.", date: new Date("2020-04-01"), year: 2020, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Identity in practice", description: "Becoming thread 2 continued.", date: new Date("2024-08-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Morning block", description: "Becoming thread 3.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Review ritual", description: "Becoming thread 3 continued.", date: new Date("2024-03-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Family", limbId: "people", title: "Childhood anchor", description: "People thread 0.", date: new Date("2005-06-01"), year: 2005, type: "milestone", significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Family", limbId: "people", title: "Family today", description: "People thread 0 continued.", date: new Date("2024-02-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Romance", limbId: "people", title: "First serious partner", description: "People thread 1.", date: new Date("2013-01-01"), year: 2013, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Romance", limbId: "people", title: "Partnership chapter", description: "People thread 1 continued.", date: new Date("2024-09-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Friendships", limbId: "people", title: "Core friend group", description: "People thread 2.", date: new Date("2015-01-01"), year: 2015, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Friendships", limbId: "people", title: "Deeper circle", description: "People thread 2 continued.", date: new Date("2023-11-01"), year: 2023, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Community", limbId: "people", title: "Local chapter", description: "People thread 3.", date: new Date("2018-02-01"), year: 2018, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Community", limbId: "people", title: "Hosting rhythm", description: "People thread 3 continued.", date: new Date("2024-04-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Fitness", limbId: "health", title: "Baseline fitness", description: "Health thread 0.", date: new Date("2018-04-01"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Fitness", limbId: "health", title: "Event training", description: "Health thread 0 continued.", date: new Date("2024-05-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Mental health", limbId: "health", title: "Therapy intake", description: "Health thread 1.", date: new Date("2019-09-01"), year: 2019, type: "decision", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Mental health", limbId: "health", title: "Stable cadence", description: "Health thread 1 continued.", date: new Date("2024-07-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Sleep", limbId: "health", title: "Sleep tracking", description: "Health thread 2.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Sleep", limbId: "health", title: "Seven-hour streak", description: "Health thread 2 continued.", date: new Date("2024-09-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Nutrition", limbId: "health", title: "Meal prep Sundays", description: "Health thread 3.", date: new Date("2022-06-01"), year: 2022, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Nutrition", limbId: "health", title: "Fuel for training", description: "Health thread 3 continued.", date: new Date("2025-01-01"), year: 2025, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
];

/**
 * Add two extra template moments per thread so the demo tree renders denser trajectories
 * without hand-authoring dozens of additional records.
 */
const extraTemplateMomentsFullTree: MarkSeed[] = branchSeedsFullTreeShowcase.flatMap((branch, idx) => {
  const startYear = branch.createdAt.getFullYear();
  const checkpointYear = startYear + 3 + (idx % 2);
  const reflectionYear = checkpointYear + 3;
  return [
    {
      branchThreadType: branch.threadType,
      limbId: branch.limbId,
      title: `${branch.threadType} checkpoint`,
      description: `Template milestone for ${branch.threadType}.`,
      date: new Date(`${checkpointYear}-06-01`),
      year: checkpointYear,
      type: "milestone",
      significance: 1,
      sentiment: "positive",
      value: null,
      isTurningPoint: false,
      future: false,
      bloomStatus: "BLOOMED",
    },
    {
      branchThreadType: branch.threadType,
      limbId: branch.limbId,
      title: `${branch.threadType} reflection`,
      description: `Template reflection for ${branch.threadType}.`,
      date: new Date(`${reflectionYear}-10-01`),
      year: reflectionYear,
      type: "realisation",
      significance: 2,
      sentiment: "positive",
      value: null,
      isTurningPoint: false,
      future: reflectionYear >= 2025,
      bloomStatus: reflectionYear >= 2025 ? "GROWING" : "BLOOMED",
    },
  ];
});

const markSeedsFullTreeShowcaseRich: MarkSeed[] = [
  ...markSeedsFullTreeShowcase,
  ...extraTemplateMomentsFullTree,
];

const markSeedsJordanVale: MarkSeed[] = [
  { branchThreadType: "Debt", limbId: "finance", title: "Debt peaks", description: "Hit a high-water mark after unstable years.", date: new Date("2018-11-01"), year: 2018, type: "setback", significance: 3, sentiment: "negative", value: 18000, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Debt", limbId: "finance", title: "Consolidation plan", description: "First time there was a real plan.", date: new Date("2021-04-01"), year: 2021, type: "decision", significance: 2, sentiment: "positive", value: 12000, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Debt", limbId: "finance", title: "Below £6k", description: "Momentum finally feels real.", date: new Date("2024-11-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: 6000, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Savings", limbId: "finance", title: "First £1k saved", description: "Tiny buffer, huge relief.", date: new Date("2021-09-01"), year: 2021, type: "milestone", significance: 1, sentiment: "positive", value: 1000, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Savings", limbId: "finance", title: "Emergency fund started", description: "Now building consistency.", date: new Date("2024-02-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: 3500, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Career", limbId: "work", title: "Retail exit", description: "Left shift work to retrain.", date: new Date("2022-03-01"), year: 2022, type: "decision", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Career", limbId: "work", title: "Junior design role", description: "First role in the new path.", date: new Date("2024-05-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Study", limbId: "work", title: "UX diploma starts", description: "Evening classes after bedtime routine.", date: new Date("2023-09-01"), year: 2023, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Study", limbId: "work", title: "Capstone in progress", description: "Final project now underway.", date: new Date("2025-01-01"), year: 2025, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Freelance", limbId: "work", title: "Freelance launch", description: "Started with optimism and no structure.", date: new Date("2019-04-01"), year: 2019, type: "milestone", significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Freelance", limbId: "work", title: "Freelance ended", description: "Closed this chapter to stabilize income.", date: new Date("2021-01-01"), year: 2021, type: "decision", significance: 3, sentiment: "negative", value: null, isTurningPoint: true, future: false, bloomStatus: "ENDED" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Post-divorce reset", description: "Redefined who I am on my own terms.", date: new Date("2021-01-01"), year: 2021, type: "realisation", significance: 3, sentiment: "neutral", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Confidence returns", description: "Decision-making feels clearer now.", date: new Date("2024-03-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Boundaries", limbId: "becoming", title: "No-contact line", description: "Set a hard boundary and kept it.", date: new Date("2022-07-01"), year: 2022, type: "decision", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Boundaries", limbId: "becoming", title: "Protecting time", description: "Weekly planning became non-negotiable.", date: new Date("2024-06-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Family", limbId: "people", title: "Relationship rupture", description: "Distance from siblings after conflict.", date: new Date("2018-06-01"), year: 2018, type: "setback", significance: 3, sentiment: "negative", value: null, isTurningPoint: true, future: false, bloomStatus: "ENDED" },
  { branchThreadType: "Parenting", limbId: "people", title: "Child starts school", description: "A new season of responsibility.", date: new Date("2020-10-01"), year: 2020, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Parenting", limbId: "people", title: "Co-parenting rhythm", description: "Finally found a stable routine.", date: new Date("2023-11-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Community", limbId: "people", title: "Neighborhood circle", description: "Joined a local support group.", date: new Date("2023-01-01"), year: 2023, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Community", limbId: "people", title: "Weekend volunteering", description: "Built belonging through contribution.", date: new Date("2024-09-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Recovery", limbId: "health", title: "Back injury", description: "Pain changed everything for a while.", date: new Date("2017-02-01"), year: 2017, type: "setback", significance: 3, sentiment: "negative", value: null, isTurningPoint: true, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Recovery", limbId: "health", title: "Physio consistency", description: "Steady progress after years of stops.", date: new Date("2022-02-01"), year: 2022, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Recovery", limbId: "health", title: "Pain-managed phase", description: "Not perfect, but functional and hopeful.", date: new Date("2024-08-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Sleep", limbId: "health", title: "Sleep tracking starts", description: "Started measuring instead of guessing.", date: new Date("2022-02-01"), year: 2022, type: "milestone", significance: 1, sentiment: "neutral", value: 5, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Sleep", limbId: "health", title: "6h average reached", description: "Still noisy, but trending better.", date: new Date("2024-12-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: 6, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
];

async function seedUserTree(passwordHash: string, seed: UserTreeSeed) {
  const existing = await prisma.user.findUnique({
    where: { email: seed.email },
    select: { id: true },
  });

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: seed.email,
        name: seed.name,
        passwordHash,
        onboardingCompleted: true,
      },
      select: { id: true },
    }));

  const existingBranchIds = await prisma.branch.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const branchIds = existingBranchIds.map((b) => b.id);
  if (branchIds.length > 0) {
    await prisma.mark.deleteMany({ where: { branchId: { in: branchIds } } });
  }
  await prisma.branch.deleteMany({ where: { userId: user.id } });

  const createdBranches = [];
  const createdByThreadType = new Map<string, { id: string }>();
  const pending = [...seed.branchSeeds];
  let guard = 0;
  while (pending.length > 0 && guard < 2000) {
    guard += 1;
    const branchSeed = pending.shift()!;
    const parentBranchId = branchSeed.parentThreadType
      ? createdByThreadType.get(branchSeed.parentThreadType)?.id
      : null;
    if (branchSeed.parentThreadType && !parentBranchId) {
      pending.push(branchSeed);
      continue;
    }
    const branch = await prisma.branch.create({
      data: {
        userId: user.id,
        limbId: branchSeed.limbId,
        parentBranchId,
        label: branchSeed.threadType,
        name: branchSeed.name,
        goal: branchSeed.goal,
        goalValue: branchSeed.goalValue,
        currentValue: branchSeed.currentValue,
        unit: branchSeed.unit,
        status: branchSeed.status,
        bloomStatus: branchSeed.bloomStatus,
        createdAt: branchSeed.createdAt,
      },
    });
    createdBranches.push(branch);
    createdByThreadType.set(branchSeed.threadType, { id: branch.id });
  }
  if (pending.length > 0) {
    throw new Error(`Unresolved parentThreadType references for ${pending.length} branches (${seed.email})`);
  }

  const branchByThreadType = new Map(createdBranches.map((b) => [String(b.label ?? b.name ?? ""), b]));
  let createdMarks = 0;
  for (const markSeed of seed.markSeeds) {
    const branch = branchByThreadType.get(markSeed.branchThreadType);
    if (!branch) throw new Error(`Missing branch for threadType: ${markSeed.branchThreadType} (${seed.email})`);
    await prisma.mark.create({
      data: {
        userId: user.id,
        branchId: branch.id,
        limbId: markSeed.limbId,
        title: markSeed.title,
        description: markSeed.description,
        date: markSeed.date,
        year: markSeed.year,
        type: markSeed.type,
        significance: markSeed.significance,
        sentiment: markSeed.sentiment,
        value: markSeed.value,
        isTurningPoint: markSeed.isTurningPoint,
        future: markSeed.future,
        archived: false,
      },
    });
    createdMarks += 1;
  }

  console.log(`Seeded user: ${seed.email}`);
  console.log(`Branches created: ${createdBranches.length}`);
  console.log(`Marks created: ${createdMarks}`);
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  await seedUserTree(passwordHash, {
    email: "alex@pathfinder.test",
    name: "Alex",
    branchSeeds,
    markSeeds,
  });
  await seedUserTree(passwordHash, {
    email: "jordan@pathfinder.test",
    name: "Jordan Vale",
    branchSeeds: branchSeedsJordanVale,
    markSeeds: markSeedsJordanVale,
  });
  await seedUserTree(passwordHash, {
    email: "fulltree@pathfinder.test",
    name: "Full Tree Showcase",
    branchSeeds: branchSeedsFullTreeShowcase,
    markSeeds: markSeedsFullTreeShowcaseRich,
  });
}

main()
  .catch((error) => {
    console.error("Tree test seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
