import type { MockHubSeed } from "@/lib/mock-seeds-to-tree-seed";

/** Demo persona for `npm run seed:demo-user` — isolated from the pinned dev account. */
export const ALEX_CARTER_PROFILE = {
  name: "Alex Carter",
  email: "alex.carter@pathfinder.test",
  birthYear: 1992,
  birthPlace: "Bristol, UK",
};

const NOW = new Date("2026-05-15T12:00:00.000Z");

export const ALEX_CARTER_SEEDS: MockHubSeed[] = [
  {
    limbId: "finance",
    name: "Income",
    goal: "Reach £85k total compensation as Senior PM by 2027",
    goalValue: 85000,
    currentValue: 72000,
    unit: "£",
    events: [
      { date: "2024-01-10", title: "Promoted to Senior PM", description: "Step up from PM II with broader platform scope.", type: "achievement", sentiment: "positive" },
      { date: "2025-06-01", title: "Comp review prep", description: "Documented impact across three squads for cycle.", type: "milestone", sentiment: "neutral" },
      { date: "2026-03-01", title: "Calibration feedback", description: "Manager aligned on path to £85k band.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "finance",
    name: "Assets",
    goal: "Build £40k house deposit fund by end of 2027",
    goalValue: 40000,
    currentValue: 18500,
    unit: "£",
    events: [
      { date: "2023-09-01", title: "Opened LISA", description: "Set up Lifetime ISA for first-home bonus.", type: "milestone", sentiment: "positive" },
      { date: "2025-01-15", title: "Automated monthly transfer", description: "£650/month into deposit pot.", type: "decision", sentiment: "positive" },
      { date: "2026-02-20", title: "Crossed £15k", description: "On track if savings rate holds.", type: "achievement", sentiment: "positive", value: 15000 },
    ],
  },
  {
    limbId: "finance",
    name: "Safety net",
    goal: "Maintain 4-month emergency runway",
    goalValue: 12000,
    currentValue: 11000,
    unit: "£",
    events: [
      { date: "2024-04-01", title: "Defined runway target", description: "Based on Bristol rent + essentials.", type: "decision", sentiment: "neutral" },
      { date: "2025-11-01", title: "Refilled after car repair", description: "Kept above 3 months despite £1.2k bill.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "finance",
    name: "Liabilities",
    goal: "Clear graduate plan balance before mortgage search",
    goalValue: 0,
    currentValue: 3200,
    unit: "£",
    events: [
      { date: "2025-03-01", title: "Plan 2 balance snapshot", description: "£4.8k remaining — overpayment strategy set.", type: "milestone", sentiment: "neutral" },
      { date: "2026-01-10", title: "Extra payment habit", description: "£200/month above minimum.", type: "decision", sentiment: "positive" },
    ],
  },
  {
    limbId: "work",
    name: "Career",
    goal: "Own platform discovery-to-delivery for payments squad",
    goalValue: 1,
    currentValue: 0.6,
    unit: "scope",
    events: [
      { date: "2022-06-01", title: "Joined fintech as PM", description: "First product role out of consultancy.", type: "milestone", sentiment: "positive" },
      { date: "2024-09-01", title: "Led checkout redesign", description: "Shipped v2 with measurable conversion lift.", type: "achievement", sentiment: "positive" },
      { date: "2026-04-01", title: "Staffing payments initiative", description: "Hired two engineers; roadmap through Q4.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "work",
    name: "Skills",
    goal: "Strengthen data storytelling for exec reviews",
    events: [
      { date: "2025-02-01", title: "SQL refresher course", description: "Completed mode analytics module.", type: "milestone", sentiment: "positive" },
      { date: "2026-03-15", title: "Exec readout practice", description: "Ran dry-run with design partner.", type: "milestone", sentiment: "neutral" },
    ],
  },
  {
    limbId: "work",
    name: "Builds & Launches",
    goal: "Ship in-app savings nudge experiment",
    goalValue: 1,
    currentValue: 0.35,
    unit: "launch",
    events: [
      { date: "2025-10-01", title: "Discovery interviews", description: "12 sessions with savers under 35.", type: "milestone", sentiment: "positive" },
      { date: "2026-05-01", title: "Beta behind feature flag", description: "5% rollout; watching activation.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "becoming",
    name: "Purpose",
    goal: "Design work that compounds — craft, family, and financial calm",
    events: [
      { date: "2023-12-01", title: "Wrote personal north star", description: "Clarified trade-offs between ambition and presence.", type: "realisation", sentiment: "positive" },
      { date: "2026-01-01", title: "Annual intention set", description: "Fewer projects, deeper follow-through.", type: "decision", sentiment: "positive" },
    ],
  },
  {
    limbId: "becoming",
    name: "Inner life",
    goal: "10-minute morning reflection habit, 5 days a week",
    events: [
      { date: "2024-08-01", title: "Started journaling", description: "Three prompts: energy, friction, gratitude.", type: "milestone", sentiment: "positive" },
      { date: "2026-04-20", title: "21-day streak", description: "Longest consistent run so far.", type: "achievement", sentiment: "positive" },
    ],
  },
  {
    limbId: "becoming",
    name: "Joy",
    goal: "Finish draft of short-story collection",
    events: [
      { date: "2025-05-01", title: "Joined writers' circle", description: "Monthly feedback in Bristol.", type: "milestone", sentiment: "positive" },
      { date: "2026-02-01", title: "Draft 4 of 8 stories", description: "Halfway through collection target.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "people",
    name: "Family",
    goal: "Monthly call rhythm with parents and sister",
    events: [
      { date: "2024-11-01", title: "Set recurring Sunday slot", description: "Shared calendar with siblings.", type: "decision", sentiment: "positive" },
      { date: "2026-03-10", title: "Visited parents in Cardiff", description: "Weekend trip; helped with garden project.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "people",
    name: "Romance",
    goal: "Plan 2027 wedding with Sam without financial stress",
    events: [
      { date: "2024-06-01", title: "Engaged in Lisbon", description: "Committed to joint planning cadence.", type: "achievement", sentiment: "positive" },
      { date: "2026-04-01", title: "Venue shortlist", description: "Three options under £12k all-in.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "people",
    name: "Friendships",
    goal: "Host quarterly dinner for close friends",
    events: [
      { date: "2025-01-15", title: "First supper club", description: "Six friends; rotating cooking.", type: "milestone", sentiment: "positive" },
      { date: "2026-04-12", title: "Spring supper", description: "Q2 gathering on the calendar.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "health",
    name: "Movement",
    goal: "Run Bristol Half Marathon under 1:55",
    goalValue: 115,
    currentValue: 122,
    unit: "min",
    events: [
      { date: "2025-01-01", title: "Started 16-week plan", description: "Three runs per week with tempo day.", type: "decision", sentiment: "positive" },
      { date: "2026-04-20", title: "20-mile long run", description: "Felt strong; pacing on track.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "health",
    name: "Nutrition",
    goal: "Protein-forward meals on training days",
    events: [
      { date: "2025-03-01", title: "Meal prep template", description: "Batch lunches Sundays.", type: "milestone", sentiment: "positive" },
      { date: "2026-05-01", title: "Tracked macros for 30 days", description: "Averaged 130g protein on run days.", type: "achievement", sentiment: "positive" },
    ],
  },
  {
    limbId: "health",
    name: "Appearance",
    goal: "Consistent skincare routine before wedding photos",
    events: [
      { date: "2025-09-01", title: "Derm consult", description: "Simple AM/PM routine prescribed.", type: "milestone", sentiment: "positive" },
    ],
  },
  {
    limbId: "health",
    name: "Rest",
    goal: "Protect 7h sleep average during launch season",
    events: [
      { date: "2025-11-01", title: "Phone-free bedroom rule", description: "Charger moved to hallway.", type: "decision", sentiment: "positive" },
      { date: "2026-04-01", title: "Sleep avg 6.9h", description: "Close to target during busy sprint.", type: "milestone", sentiment: "neutral" },
    ],
  },
];

/** Narrative “now” for Alex fixture dates. */
export const ALEX_CARTER_TREE_NOW = NOW;
