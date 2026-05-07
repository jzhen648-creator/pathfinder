import type { Branch, Mark, Moment, Reframe } from "@/lib/types";

export type MockDensity = "min" | "med" | "extensive";
export type MockProfileId = "alex" | "david";

export type MockScenario = {
  profile: {
    name: string;
    email: string;
    birthYear: number | null;
    birthPlace: string;
  };
  branches: Branch[];
  marks: Mark[];
  reframes: Reframe[];
};

const USER_ID = "mock-user";
const PROFILE = {
  name: "Alex Carter",
  email: "alex.mock@example.com",
  birthYear: 1994,
  birthPlace: "Manchester, UK",
};
const DAVID_PROFILE = {
  name: "David Thompson",
  email: "david.thompson.mock@example.com",
  birthYear: 1960,
  birthPlace: "London, UK",
};

type Seed = {
  limbId: Branch["limbId"];
  name: string;
  goal?: string;
  goalValue?: number;
  currentValue?: number;
  unit?: string;
  statusMed?: Branch["status"];
  statusExtensive?: Branch["status"];
  events: Array<{
    date: string;
    title: string;
    description: string;
    type: Mark["type"];
    sentiment: Mark["sentiment"];
    value?: number | null;
    reframe?: string;
  }>;
};

const SEEDS: Seed[] = [
  { limbId: "finance", name: "Debt", goal: "Clear all personal debt", goalValue: 28000, currentValue: 0, unit: "£", statusMed: "achieved", statusExtensive: "achieved", events: [
    { date: "2015-03-01", title: "Student debt pressure hit", description: "Debt burden became concrete after starting full-time salary.", type: "setback", sentiment: "negative", value: 28000 },
    { date: "2016-04-01", title: "Repayment System", description: "Automated monthly overpayments.", type: "decision", sentiment: "neutral", value: 22000 },
    { date: "2018-11-01", title: "Debt Free", description: "Final payment cleared.", type: "achievement", sentiment: "positive", value: 0, reframe: "Consistency beat intensity." },
    { date: "2021-01-01", title: "No-Consumer-Debt Rule", description: "Permanent personal money rule.", type: "realisation", sentiment: "positive" },
    { date: "2024-10-01", title: "Helped Sibling Plan Debt", description: "Shared strategy with family.", type: "achievement", sentiment: "positive" },
    { date: "2025-04-01", title: "Five Years Debt-Free", description: "Stability became normal.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "finance", name: "Savings", goal: "Reach £75k invested", goalValue: 75000, currentValue: 61000, unit: "£", statusExtensive: "active", events: [
    { date: "2019-02-01", title: "Opened ISA", description: "Started monthly index investing.", type: "decision", sentiment: "positive", value: 500 },
    { date: "2020-03-01", title: "Stayed Invested", description: "Did not panic during volatility.", type: "realisation", sentiment: "positive", value: 4200 },
    { date: "2021-11-01", title: "Crossed £15k", description: "Compounding became visible.", type: "milestone", sentiment: "positive", value: 15000 },
    { date: "2024-02-01", title: "Paused Contributions", description: "Cashflow pressure reduced investing rate.", type: "setback", sentiment: "negative", value: 19000 },
    { date: "2024-09-01", title: "Restarted Monthly Plan", description: "Rebuilt consistency with smaller deposits.", type: "decision", sentiment: "neutral", value: 34000 },
    { date: "2025-06-01", title: "Reached £61k", description: "Long-run plan back on track.", type: "achievement", sentiment: "positive", value: 61000 },
  ]},
  { limbId: "finance", name: "Income", goal: "Grow annual income sustainably", goalValue: 140000, currentValue: 108000, unit: "£", statusExtensive: "active", events: [
    { date: "2015-02-01", title: "First full-time salary", description: "Started stable monthly income.", type: "milestone", sentiment: "neutral", value: 26000 },
    { date: "2017-06-01", title: "Promotion raise", description: "Comp increased with senior scope.", type: "achievement", sentiment: "positive", value: 38000 },
    { date: "2020-09-01", title: "Role pivot dip", description: "Short-term pay tradeoff for learning.", type: "decision", sentiment: "neutral", value: 35000 },
    { date: "2022-03-01", title: "Lead-level compensation", description: "Income stepped up with leadership responsibilities.", type: "achievement", sentiment: "positive", value: 76000 },
    { date: "2024-01-01", title: "Founder transition volatility", description: "Income became less predictable during transition.", type: "setback", sentiment: "negative", value: 62000 },
    { date: "2026-01-01", title: "Income stabilized", description: "Portfolio income model settled and grew again.", type: "milestone", sentiment: "positive", value: 108000 },
  ]},
  { limbId: "work", name: "Career", goal: "Grow as product leader", statusExtensive: "active", events: [
    { date: "2011-09-01", title: "Started Human-Computer Interaction degree", description: "Entered university with a focus on design, psychology, and digital product systems.", type: "milestone", sentiment: "positive" },
    { date: "2013-07-01", title: "Placement year in digital agency", description: "Completed a supervised industry placement and learned shipping discipline with real clients.", type: "achievement", sentiment: "positive" },
    { date: "2014-07-01", title: "Graduated with portfolio distinction", description: "Final-year capstone and portfolio review created a strong bridge into product work.", type: "achievement", sentiment: "positive" },
    { date: "2015-02-01", title: "First Agency Role", description: "Entered professional work full-time and applied university training in production settings.", type: "milestone", sentiment: "neutral" },
    { date: "2020-09-01", title: "Moved to Product", description: "Switched discipline from delivery execution to product discovery and strategy.", type: "decision", sentiment: "neutral" },
    { date: "2024-01-01", title: "Left to Build", description: "Shifted to founder path using combined formal education plus practical operating experience.", type: "decision", sentiment: "positive", reframe: "Risk created autonomy." },
  ]},
  { limbId: "work", name: "Projects", goal: "Ship meaningful side projects", statusExtensive: "paused", events: [
    { date: "2018-02-01", title: "Weekend Project Start", description: "Started building nights/weekends.", type: "decision", sentiment: "positive" },
    { date: "2019-01-01", title: "MVP Launch", description: "Shipped first version publicly.", type: "milestone", sentiment: "neutral" },
    { date: "2019-10-01", title: "Burnout Phase", description: "Split focus became unsustainable.", type: "setback", sentiment: "negative" },
    { date: "2020-03-01", title: "Paused Project", description: "Protected health and focus.", type: "decision", sentiment: "neutral", reframe: "Stopping was strategic." },
    { date: "2024-02-01", title: "Relaunch Attempt", description: "Demand still weak.", type: "setback", sentiment: "negative" },
    { date: "2024-11-01", title: "Archived", description: "Closed this branch for now.", type: "realisation", sentiment: "neutral" },
  ]},
  { limbId: "work", name: "Business", goal: "Build a sustainable product business", statusExtensive: "active", events: [
    { date: "2023-04-01", title: "Explored business models", description: "Compared service, SaaS, and hybrid paths.", type: "decision", sentiment: "neutral" },
    { date: "2024-01-01", title: "Incorporated studio", description: "Set up legal and financial business foundations.", type: "milestone", sentiment: "positive" },
    { date: "2024-06-01", title: "First retained client", description: "Secured recurring revenue for operations.", type: "achievement", sentiment: "positive" },
    { date: "2024-11-01", title: "Cashflow squeeze", description: "Pipeline dip created short-term pressure.", type: "setback", sentiment: "negative" },
    { date: "2025-02-01", title: "Offer narrowed", description: "Focused on one clear service-product wedge.", type: "realisation", sentiment: "positive" },
    { date: "2025-09-01", title: "Base profitability", description: "Reached stable monthly operating surplus.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "work", name: "Skills", goal: "Complete 100 deliberate sessions", goalValue: 100, currentValue: 84, unit: "sessions", statusMed: "active", statusExtensive: "active", events: [
    { date: "2012-10-01", title: "Research methods module top grade", description: "University methods training became the backbone for later discovery and experimentation work.", type: "achievement", sentiment: "positive", value: 8 },
    { date: "2016-01-01", title: "Weekly Learning Block", description: "Protected one weekly study block for deliberate upskilling beyond day-to-day delivery.", type: "decision", sentiment: "positive", value: 20 },
    { date: "2018-05-01", title: "Service design short course", description: "Completed an intensive continuing-education course on end-to-end service design.", type: "milestone", sentiment: "positive", value: 36 },
    { date: "2021-02-01", title: "Coaching Certification", description: "Finished formal coaching accreditation to improve leadership and team development.", type: "achievement", sentiment: "positive", value: 62 },
    { date: "2024-03-01", title: "Mentored PMs", description: "Teaching and curriculum-style mentoring deepened conceptual mastery.", type: "realisation", sentiment: "positive", value: 84 },
    { date: "2024-12-01", title: "Graduate-level strategy elective", description: "Returned to structured study with an executive elective on product strategy and operating models.", type: "milestone", sentiment: "positive", value: 92 },
  ]},
  { limbId: "people", name: "Family", goal: "Stay consistently present", statusExtensive: "active", events: [
    { date: "2018-05-01", title: "Dad Diagnosis", description: "Priorities shifted overnight.", type: "setback", sentiment: "negative" },
    { date: "2019-01-01", title: "Weekly Support Routine", description: "Built reliable cadence.", type: "decision", sentiment: "neutral" },
    { date: "2020-06-01", title: "Remission", description: "Huge family relief.", type: "achievement", sentiment: "positive", reframe: "Hard seasons clarified values." },
    { date: "2022-01-01", title: "Monthly Family Days", description: "Protected regular time.", type: "milestone", sentiment: "positive" },
    { date: "2024-03-01", title: "Care Fatigue", description: "Asked for shared support.", type: "realisation", sentiment: "neutral" },
    { date: "2025-02-01", title: "Sustainable Care Plan", description: "Better long-term structure.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "people", name: "Friendships", goal: "Maintain deep friendships", statusExtensive: "active", events: [
    { date: "2015-03-01", title: "Moved Cities", description: "Distance strained old friendships.", type: "setback", sentiment: "negative" },
    { date: "2016-08-01", title: "Met Jamie", description: "Built a key friendship in London.", type: "achievement", sentiment: "positive" },
    { date: "2018-10-01", title: "Social Dip", description: "Work stress reduced availability.", type: "setback", sentiment: "negative" },
    { date: "2019-11-01", title: "Sunday Ritual", description: "Weekly check-ins restored connection.", type: "decision", sentiment: "positive" },
    { date: "2022-05-01", title: "Hosted Reunion", description: "Reconnected old and new circles.", type: "achievement", sentiment: "positive" },
    { date: "2025-03-01", title: "Smaller, Deeper Circle", description: "More trust, less noise.", type: "realisation", sentiment: "positive" },
  ]},
  { limbId: "people", name: "Romantic", goal: "Build intentional partnership", statusExtensive: "active", events: [
    { date: "2019-03-01", title: "Met Sam", description: "Unexpected relationship start.", type: "milestone", sentiment: "positive" },
    { date: "2021-09-01", title: "Moved In Together", description: "Shared home began.", type: "achievement", sentiment: "positive" },
    { date: "2024-02-01", title: "Conflict Season", description: "Pressure increased friction.", type: "setback", sentiment: "negative" },
    { date: "2024-08-01", title: "Got Engaged", description: "Committed to long-term path.", type: "achievement", sentiment: "positive" },
    { date: "2025-01-01", title: "Paused Wedding Plans", description: "Prioritized communication work.", type: "decision", sentiment: "neutral", reframe: "Pausing protected honesty." },
    { date: "2025-10-01", title: "Counselling Progress", description: "Healthier patterns emerging.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "health", name: "Fitness", goal: "Sub-4 marathon", goalValue: 240, currentValue: 238, unit: "minutes", statusMed: "active", statusExtensive: "active", events: [
    { date: "2016-02-01", title: "Wake-up Call", description: "Lowest energy period.", type: "setback", sentiment: "negative" },
    { date: "2016-06-01", title: "First 5k Attempt", description: "Finished by mixing run/walk.", type: "milestone", sentiment: "neutral", value: 45 },
    { date: "2019-09-01", title: "Half Marathon", description: "First major race finish.", type: "achievement", sentiment: "positive", value: 124 },
    { date: "2021-04-01", title: "Burnout Rebound", description: "Stress disrupted routines.", type: "setback", sentiment: "negative", reframe: "Fitness is maintenance." },
    { date: "2024-03-01", title: "Consistent Training Block", description: "No missed weeks for two months.", type: "milestone", sentiment: "positive" },
    { date: "2025-10-01", title: "Marathon 3:58", description: "Broke the 4-hour target.", type: "achievement", sentiment: "positive", value: 238 },
  ]},
  { limbId: "health", name: "Mental Health", goal: "Maintain stable wellbeing score", goalValue: 8, currentValue: 7, unit: "score", statusExtensive: "active", events: [
    { date: "2019-04-01", title: "Started Therapy", description: "Committed to weekly sessions.", type: "decision", sentiment: "positive", value: 4 },
    { date: "2020-03-01", title: "Anxiety Spike", description: "Concentration and sleep worsened.", type: "setback", sentiment: "negative", value: 3 },
    { date: "2021-01-01", title: "Boundary Rules", description: "No work after 8pm weekdays.", type: "decision", sentiment: "neutral", value: 5 },
    { date: "2022-07-01", title: "Relapse Under Pressure", description: "Old loops resurfaced.", type: "setback", sentiment: "negative", value: 4 },
    { date: "2024-02-01", title: "Better Therapist Fit", description: "Progress accelerated.", type: "milestone", sentiment: "positive", value: 6 },
    { date: "2025-12-01", title: "Stable Baseline", description: "More resilient during hard weeks.", type: "achievement", sentiment: "positive", value: 7 },
  ]},
  { limbId: "health", name: "Food & Body", goal: "Maintain steady energy and healthy body composition", goalValue: 8, currentValue: 7, unit: "score", statusExtensive: "active", events: [
    { date: "2020-01-01", title: "Tracked meals and energy", description: "Started logging food patterns against energy dips.", type: "decision", sentiment: "neutral", value: 4 },
    { date: "2021-06-01", title: "Protein-first routine", description: "Improved satiety and reduced late crashes.", type: "milestone", sentiment: "positive", value: 5 },
    { date: "2022-09-01", title: "Travel eating relapse", description: "Old patterns returned during heavy travel periods.", type: "setback", sentiment: "negative", value: 4 },
    { date: "2023-12-01", title: "Prep system rebuilt", description: "Simple prep rhythm stabilized weekday nutrition.", type: "realisation", sentiment: "positive", value: 6 },
    { date: "2024-10-01", title: "Body metrics improving", description: "Energy and body composition trended in the right direction.", type: "decision", sentiment: "positive", value: 7 },
    { date: "2025-08-01", title: "Sustained healthy baseline", description: "Nutrition routine became automatic and steady.", type: "achievement", sentiment: "positive", value: 7 },
  ]},
  { limbId: "becoming", name: "Mindset", goal: "Operate from long-term thinking", statusExtensive: "active", events: [
    { date: "2017-01-01", title: "Noticed Avoidance Loop", description: "Started naming patterns.", type: "realisation", sentiment: "neutral" },
    { date: "2019-06-01", title: "Therapy Breakthrough", description: "Linked perfectionism and fear.", type: "achievement", sentiment: "positive" },
    { date: "2021-06-01", title: "Less Approval Seeking", description: "Lower reactivity to opinions.", type: "milestone", sentiment: "positive" },
    { date: "2022-11-01", title: "Identity Doubt Spike", description: "Uncertainty resurfaced old narratives.", type: "setback", sentiment: "negative" },
    { date: "2024-03-01", title: "Internal Scorecard", description: "Defined personal success metrics.", type: "decision", sentiment: "positive", reframe: "Confidence follows commitments kept." },
    { date: "2025-11-01", title: "Calm Under Volatility", description: "Pressure remains, panic drops.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "becoming", name: "Habits", goal: "Maintain 5 keystone habits", goalValue: 5, currentValue: 4, unit: "habits", statusExtensive: "active", events: [
    { date: "2018-01-01", title: "Morning Routine Attempt", description: "Initial consistency was low.", type: "setback", sentiment: "negative", value: 1 },
    { date: "2019-02-01", title: "Habit Tracker", description: "Tracking improved follow-through.", type: "decision", sentiment: "neutral", value: 2 },
    { date: "2020-08-01", title: "Three Habits Stable", description: "Reading, movement, planning became default.", type: "milestone", sentiment: "positive", value: 3 },
    { date: "2022-04-01", title: "Routine Collapse", description: "Stress broke the pattern.", type: "setback", sentiment: "negative", value: 1 },
    { date: "2023-09-01", title: "Rebuilt Smaller Defaults", description: "Tiny daily floor restored momentum.", type: "decision", sentiment: "positive", value: 3 },
    { date: "2025-05-01", title: "Four Habits Stable", description: "Consistency resilient to busy periods.", type: "achievement", sentiment: "positive", value: 4 },
  ]},
  { limbId: "becoming", name: "Identity", goal: "Live as a creator-led person", statusExtensive: "active", events: [
    { date: "2019-01-01", title: "Perspective Shift", description: "Saw wider life possibilities.", type: "realisation", sentiment: "positive" },
    { date: "2020-09-01", title: "Pivot to Product", description: "Moved closer to building work.", type: "decision", sentiment: "positive" },
    { date: "2023-06-01", title: "Became a Builder", description: "Identity shifted to creator.", type: "achievement", sentiment: "positive" },
    { date: "2024-09-01", title: "Learning to Rest", description: "Integrated rest into identity.", type: "realisation", sentiment: "neutral" },
    { date: "2025-04-01", title: "Published Weekly", description: "Creation became consistent and visible.", type: "milestone", sentiment: "positive" },
    { date: "2026-02-01", title: "Identity Stabilised", description: "Creator mode became baseline.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "becoming", name: "Creativity", goal: "Create and publish meaningful creative work", statusExtensive: "active", events: [
    { date: "2018-03-01", title: "Started weekend sketch habit", description: "Returned to making for joy, not outcomes.", type: "decision", sentiment: "positive" },
    { date: "2020-04-01", title: "Published first essays", description: "Shared early writing publicly despite nerves.", type: "milestone", sentiment: "neutral" },
    { date: "2022-02-01", title: "Creative drought", description: "Production stalled during high work pressure.", type: "setback", sentiment: "negative" },
    { date: "2023-11-01", title: "Weekly creation ritual", description: "Time-blocked one protected creative session weekly.", type: "decision", sentiment: "positive" },
    { date: "2025-02-01", title: "Built small audience", description: "Consistent output attracted a regular audience.", type: "achievement", sentiment: "positive" },
    { date: "2026-03-01", title: "Multi-medium expression", description: "Combined writing, visuals, and short-form audio.", type: "milestone", sentiment: "positive" },
  ]},
];

const MIN_ENABLED: Record<Branch["limbId"], string[]> = {
  finance: ["Debt", "Savings"],
  work: ["Career", "Skills"],
  people: ["Family", "Friendships"],
  health: ["Fitness", "Mental Health"],
  becoming: ["Mindset", "Habits"],
};

/** min uses 4 marks/branch so tree spacing can be exercised (threads stay ≥3 moments); seeds already carry spaced dates. */
const MARK_COUNT: Record<MockDensity, number> = { min: 4, med: 4, extensive: 6 };
const DAVID_MARK_COUNT: Record<MockDensity, number> = { min: 3, med: 6, extensive: 10 };

const DAVID_MIN_ENABLED: Record<Branch["limbId"], string[]> = {
  finance: ["Income", "Savings"],
  work: ["Career", "Skills"],
  people: ["Family", "Friendships"],
  health: ["Fitness", "Mental Health"],
  becoming: ["Mindset", "Habits"],
};

const DAVID_SEEDS: Seed[] = [
  { limbId: "work", name: "Career", goal: "Contribute meaningful systems work", statusExtensive: "achieved", events: [
    { date: "1976-09-01", title: "Technical college foundation year", description: "Completed a pre-apprenticeship technical year in electronics and applied maths.", type: "milestone", sentiment: "positive" },
    { date: "1978-09-01", title: "Started apprenticeship", description: "Joined a London telecom apprenticeship after school.", type: "milestone", sentiment: "positive" },
    { date: "1981-04-01", title: "City & Guilds instrumentation certificate", description: "Completed formal post-apprenticeship qualification while working full-time.", type: "achievement", sentiment: "positive" },
    { date: "1983-06-01", title: "Qualified engineer", description: "Completed training and moved into full-time engineering role.", type: "achievement", sentiment: "positive" },
    { date: "1991-10-01", title: "Evening diploma in leadership", description: "Studied supervisory practice at night to prepare for team-lead responsibilities.", type: "milestone", sentiment: "positive" },
    { date: "2005-07-01", title: "Moved into systems architecture", description: "Shifted from delivery to long-range technical design.", type: "decision", sentiment: "positive" },
    { date: "2020-05-01", title: "Retired from full-time", description: "Closed full-time chapter after 40+ years.", type: "milestone", sentiment: "positive" },
    { date: "2023-02-01", title: "Part-time advisory work", description: "Returned in lighter advisory capacity two days a week.", type: "decision", sentiment: "neutral" },
  ]},
  { limbId: "work", name: "Projects", goal: "Build stronger teams than the ones inherited", statusExtensive: "achieved", events: [
    { date: "1988-03-01", title: "First team lead role", description: "Started managing six field engineers.", type: "milestone", sentiment: "neutral" },
    { date: "1995-09-01", title: "Handled major outage", description: "Led cross-team recovery during city-wide disruption.", type: "achievement", sentiment: "positive" },
    { date: "2008-05-01", title: "Standardised field playbooks", description: "Documented repeatable incident and handover procedures across teams.", type: "achievement", sentiment: "positive" },
    { date: "2016-06-01", title: "Succession prepared", description: "Developed future team leads before retirement.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "work", name: "Skills", goal: "Support 50 early-career engineers", goalValue: 50, currentValue: 34, unit: "mentees", statusExtensive: "active", events: [
    { date: "2012-03-01", title: "Started informal mentoring", description: "Began regular support for junior staff and apprentices.", type: "decision", sentiment: "positive", value: 14 },
    { date: "2018-07-01", title: "Formal mentoring program", description: "Joined company mentorship scheme with structured learning plans.", type: "milestone", sentiment: "positive", value: 22 },
    { date: "2021-09-01", title: "Guest lecturer sessions", description: "Contributed practical lectures to a local further-education engineering course.", type: "achievement", sentiment: "positive", value: 28 },
    { date: "2024-01-01", title: "34 mentees reached", description: "Mentorship became a core post-retirement activity.", type: "achievement", sentiment: "positive", value: 34 },
  ]},
  { limbId: "work", name: "Business", goal: "Keep advisory work sustainable post-retirement", statusExtensive: "active", events: [
    { date: "2020-10-01", title: "Set up advisory structure", description: "Registered a simple consulting setup.", type: "decision", sentiment: "neutral" },
    { date: "2021-11-01", title: "First recurring advisory client", description: "Secured reliable part-time client work.", type: "achievement", sentiment: "positive" },
    { date: "2023-07-01", title: "Narrowed offer", description: "Focused on systems transition advisory only.", type: "realisation", sentiment: "positive" },
  ]},
  { limbId: "finance", name: "Income", goal: "Maintain stable household finances", statusExtensive: "achieved", events: [
    { date: "1980-01-01", title: "First steady income", description: "Moved from temporary work to stable salary.", type: "achievement", sentiment: "positive" },
    { date: "1992-02-01", title: "Mortgage pressure", description: "High rates made repayments difficult.", type: "setback", sentiment: "negative" },
    { date: "2020-06-01", title: "Income shift at retirement", description: "Transitioned from salary to pension + advisory income.", type: "decision", sentiment: "neutral" },
  ]},
  { limbId: "finance", name: "Savings", goal: "Maintain 25 years of secure drawdown", goalValue: 25, currentValue: 20, unit: "years", statusExtensive: "active", events: [
    { date: "1998-04-01", title: "Opened pension review cycle", description: "Started annual pension planning reviews.", type: "decision", sentiment: "positive", value: 8 },
    { date: "2015-03-01", title: "Rebalanced conservatively", description: "Moved allocation toward lower-volatility mix.", type: "decision", sentiment: "neutral", value: 14 },
    { date: "2023-03-01", title: "Adjusted drawdown guardrails", description: "Introduced spending bands to protect long-horizon runway.", type: "realisation", sentiment: "positive", value: 18 },
    { date: "2026-01-01", title: "20-year runway in place", description: "Retirement planning steady as of now.", type: "milestone", sentiment: "positive", value: 20 },
  ]},
  { limbId: "finance", name: "Debt", goal: "Keep liabilities low and manageable", statusExtensive: "active", events: [
    { date: "1989-07-01", title: "Bought first London home", description: "Purchased family house in North London.", type: "achievement", sentiment: "positive" },
    { date: "2017-10-01", title: "Mortgage fully paid", description: "Reached full ownership.", type: "achievement", sentiment: "positive" },
    { date: "2027-05-01", title: "Accessibility upgrades planned", description: "Future-proofing stairs and bathroom layout.", type: "decision", sentiment: "neutral" },
  ]},
  { limbId: "people", name: "Romantic", goal: "Sustain a respectful long-term marriage", statusExtensive: "active", events: [
    { date: "1982-05-01", title: "Met Julia", description: "Met future partner through mutual friends.", type: "milestone", sentiment: "positive" },
    { date: "1984-09-01", title: "Married", description: "Committed to shared life path.", type: "achievement", sentiment: "positive" },
    { date: "2015-02-01", title: "Counselling support", description: "Chose relationship support to repair and reset.", type: "decision", sentiment: "positive" },
    { date: "2024-09-01", title: "40 years married", description: "Marked resilience and adaptation after hard seasons.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "people", name: "Family", goal: "Stay present across generations", statusExtensive: "active", events: [
    { date: "1986-09-01", title: "First child born", description: "Family life became central focus.", type: "milestone", sentiment: "positive" },
    { date: "1990-12-01", title: "Second child born", description: "Household responsibilities expanded.", type: "achievement", sentiment: "positive" },
    { date: "2007-04-01", title: "Parent illness period", description: "Supported aging parent through long treatment.", type: "setback", sentiment: "negative" },
    { date: "2013-08-01", title: "Empty nest transition", description: "Children moved into independent adult life.", type: "realisation", sentiment: "neutral" },
    { date: "2029-06-01", title: "Planned expanded program", description: "Broadened support for the growing family network.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "people", name: "Friendships", goal: "Give back locally through practical service", statusExtensive: "active", events: [
    { date: "2010-03-01", title: "Joined local repair club", description: "Began volunteering technical skills monthly.", type: "decision", sentiment: "positive" },
    { date: "2016-04-01", title: "Community trustee role", description: "Took governance role in neighborhood center.", type: "achievement", sentiment: "positive" },
    { date: "2022-10-01", title: "Launched skills workshops", description: "Started practical electronics workshops for teens.", type: "achievement", sentiment: "positive" },
    { date: "2025-04-01", title: "Volunteer mentor rota", description: "Built a rotating mentor roster so sessions stayed sustainable.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "health", name: "Fitness", goal: "Maintain blood pressure under control", statusExtensive: "active", events: [
    { date: "2004-02-01", title: "Hypertension diagnosis", description: "Initial warning from GP.", type: "setback", sentiment: "negative" },
    { date: "2018-05-01", title: "Consistent good readings", description: "Sustained stability over multiple years.", type: "achievement", sentiment: "positive" },
    { date: "2026-02-01", title: "Cardio review stable", description: "Health markers remain in safe range.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "health", name: "Food & Body", goal: "Stay active and fuel well in later life", statusExtensive: "active", events: [
    { date: "2011-07-01", title: "Knee injury rehab period", description: "Adjusted diet and movement during recovery.", type: "setback", sentiment: "negative" },
    { date: "2015-05-01", title: "Strength routine restart", description: "Added low-impact resistance work to protect mobility.", type: "decision", sentiment: "positive" },
    { date: "2020-09-01", title: "Daily walking habit", description: "Locked in 8k step baseline.", type: "milestone", sentiment: "positive" },
    { date: "2023-01-01", title: "Simplified meal rhythm", description: "Switched to a repeatable weekly meal pattern with steadier energy.", type: "realisation", sentiment: "positive" },
  ]},
  { limbId: "health", name: "Mental Health", goal: "Protect calm and purpose in later life", statusExtensive: "active", events: [
    { date: "2009-03-01", title: "Caregiver fatigue", description: "Family care responsibilities overwhelmed capacity.", type: "setback", sentiment: "negative" },
    { date: "2014-06-01", title: "Peer support circle", description: "Joined a monthly local support group for carers.", type: "decision", sentiment: "neutral" },
    { date: "2022-03-01", title: "New rhythm established", description: "Balanced work, family, and personal time.", type: "achievement", sentiment: "positive" },
    { date: "2025-11-01", title: "Reduced advisory days", description: "Lowered weekly workload to protect sleep and recovery.", type: "decision", sentiment: "positive" },
  ]},
  { limbId: "becoming", name: "Mindset", goal: "Design a meaningful post-career chapter", statusExtensive: "active", events: [
    { date: "2017-01-01", title: "Questioned next chapter", description: "Started asking what retirement should mean.", type: "realisation", sentiment: "neutral" },
    { date: "2021-04-01", title: "Defined retirement themes", description: "Named service, family history, and mentoring as the core threads.", type: "decision", sentiment: "positive" },
    { date: "2026-04-01", title: "Purpose score feels aligned", description: "Current life feels coherent with values.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "becoming", name: "Habits", goal: "Stay mentally sharp through active study", statusExtensive: "active", events: [
    { date: "2018-09-01", title: "Began history studies", description: "Joined evening classes on modern British history.", type: "decision", sentiment: "positive" },
    { date: "2021-01-01", title: "Weekly study notes", description: "Started summarizing each study session to strengthen recall.", type: "milestone", sentiment: "positive" },
    { date: "2024-05-01", title: "Open-university module", description: "Completed later-life learning milestone.", type: "achievement", sentiment: "positive" },
  ]},
  { limbId: "becoming", name: "Identity", goal: "Leave practical guidance and family stories documented", statusExtensive: "active", events: [
    { date: "2023-06-01", title: "Started family archive", description: "Digitized photos, letters, and oral histories.", type: "decision", sentiment: "positive" },
    { date: "2025-02-01", title: "Recorded oral histories", description: "Completed interviews with relatives across three generations.", type: "achievement", sentiment: "positive" },
    { date: "2027-12-01", title: "Plan to finish memoir", description: "Future milestone for complete multi-decade life story.", type: "milestone", sentiment: "positive" },
  ]},
  { limbId: "becoming", name: "Creativity", goal: "Keep creating and sharing practical knowledge", statusExtensive: "active", events: [
    { date: "2019-02-01", title: "Started repair workshop notes", description: "Began turning lessons into reusable guides.", type: "decision", sentiment: "positive" },
    { date: "2022-02-01", title: "First workshop zine", description: "Printed a small practical guide for local sessions.", type: "milestone", sentiment: "positive" },
    { date: "2024-10-01", title: "Published community handbook", description: "Shared practical guidance with local volunteers.", type: "achievement", sentiment: "positive" },
  ]},
];

function slug(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getStatus(seed: Seed, density: MockDensity): Branch["status"] {
  if (density === "min") return "active";
  if (density === "med") return seed.statusMed ?? "active";
  return seed.statusExtensive ?? "active";
}

function parseMockDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function applyLondon1960NarrativeFork(branches: Branch[], marks: Mark[]) {
  // Taxonomy branches should be root-level siblings so labels are explicit and
  // consistent across profiles. Narrative divergence should happen inside branch
  // timelines (marks), not by nesting taxonomy branches under each other.
  const TAXONOMY_ROOTS = new Set(
    [
      "career",
      "skills",
      "projects",
      "business",
      "fitness",
      "mental health",
      "food & body",
      "income",
      "savings",
      "debt",
      "romantic",
      "family",
      "friendships",
      "habits",
      "mindset",
      "identity",
      "creativity",
    ].map((s) => s.toLowerCase()),
  );
  for (const branch of branches) {
    const name = ((branch.name ?? branch.label) ?? "").trim().toLowerCase();
    if (!TAXONOMY_ROOTS.has(name)) continue;
    branch.parentBranchId = null;
    branch.turningPointId = null;
    branch.mapAngleOffset = 0;
  }

  // David-specific causal storytelling: early formal training in Career acts as
  // trunk, with other Work & Learning threads branching after qualification.
  const marksByBranch = new Map<string, Mark[]>();
  for (const mark of marks) {
    const arr = marksByBranch.get(mark.branchId) ?? [];
    arr.push(mark);
    marksByBranch.set(mark.branchId, arr);
  }
  for (const arr of marksByBranch.values()) {
    arr.sort((a, b) => {
      const at = parseMockDate(a.date)?.getTime() ?? 0;
      const bt = parseMockDate(b.date)?.getTime() ?? 0;
      return at - bt;
    });
  }
  const byName = new Map(
    branches.map((b) => [((b.name ?? b.label) ?? "").trim().toLowerCase(), b] as const),
  );
  const setNarrativeFork = (
    parentName: string,
    turningTitle: string,
    childSpecs: Array<{ name: string; angle: number }>,
  ) => {
    const parent = byName.get(parentName.trim().toLowerCase());
    if (!parent) return;
    const turning = (marksByBranch.get(parent.id) ?? []).find(
      (m) => m.title.trim().toLowerCase() === turningTitle.trim().toLowerCase(),
    );
    if (!turning) return;
    for (const spec of childSpecs) {
      const child = byName.get(spec.name.trim().toLowerCase());
      if (!child) continue;
      if (child.id === parent.id) continue;
      child.parentBranchId = parent.id;
      child.turningPointId = turning.id;
      child.mapAngleOffset = spec.angle;
    }
  };
  const setNarrativeForkFromLine = (
    parentName: string,
    childSpecs: Array<{ name: string; angle: number }>,
  ) => {
    const parent = byName.get(parentName.trim().toLowerCase());
    if (!parent) return;
    for (const spec of childSpecs) {
      const child = byName.get(spec.name.trim().toLowerCase());
      if (!child) continue;
      if (child.id === parent.id) continue;
      child.parentBranchId = parent.id;
      child.turningPointId = null;
      child.mapAngleOffset = spec.angle;
    }
  };

  // Work & Learning (3 distinct fork points):
  // 1) Project leadership grows between qualification and later promotions.
  setNarrativeForkFromLine("Career", [{ name: "Projects", angle: -18 }]);
  // 2) Mentoring/teaching deepens as a gradual thread during later career years.
  setNarrativeForkFromLine("Career", [{ name: "Skills", angle: 18 }]);
  // 3) Team-lead phase splits management/advisory from hands-on project execution
  setNarrativeFork("Projects", "First team lead role", [{ name: "Business", angle: 18 }]);

  // Alex-style Work & Learning structure: keep a comparable hierarchy where
  // early career moments branch into parallel learning/building/business threads.
  // Alex: both skills and side projects evolve between major career milestones.
  setNarrativeForkFromLine("Career", [{ name: "Skills", angle: 18 }]);
  setNarrativeForkFromLine("Career", [{ name: "Projects", angle: -18 }]);
  setNarrativeFork("Projects", "MVP Launch", [{ name: "Business", angle: 18 }]);
  // Alex-style Relationships / Health / Personal Growth
  setNarrativeForkFromLine("Friendships", [
    { name: "Family", angle: -14 },
    { name: "Romantic", angle: 14 },
  ]);
  setNarrativeForkFromLine("Mindset", [
    { name: "Habits", angle: -16 },
    { name: "Identity", angle: 0 },
    { name: "Creativity", angle: 16 },
  ]);
  // Money
  // Alex: salary is the trunk; debt and savings open from first stable income.
  setNarrativeForkFromLine("Income", [
    { name: "Savings", angle: -14 },
    { name: "Debt", angle: 14 },
  ]);
  // David: causal ordering — first stable income enables the first-home path.
  // Keep turningPointId unset so the branch can visually emerge from the segment
  // between income marks (not only from a single node).
  const incomeBranch = byName.get("income");
  const debtBranch = byName.get("debt");
  if (incomeBranch && debtBranch) {
    debtBranch.parentBranchId = incomeBranch.id;
    debtBranch.turningPointId = null;
    debtBranch.mapAngleOffset = 14;
  }
  // Savings is a long-running thread that emerges between income milestones.
  setNarrativeForkFromLine("Income", [{ name: "Savings", angle: -14 }]);
  // Relationships
  setNarrativeForkFromLine("Romantic", [
    { name: "Family", angle: -14 },
    { name: "Friendships", angle: 14 },
  ]);
}

function enforceMockBranchChronology(branches: Branch[], marks: Mark[]) {
  const branchById = new Map(branches.map((b) => [b.id, b] as const));
  const marksById = new Map(marks.map((m) => [m.id, m] as const));

  const marksByBranch = new Map<string, Mark[]>();
  for (const mark of marks) {
    const arr = marksByBranch.get(mark.branchId) ?? [];
    arr.push(mark);
    marksByBranch.set(mark.branchId, arr);
  }

  const sortByDate = (arr: Mark[]) =>
    arr.sort((a, b) => {
      const at = parseMockDate(a.date)?.getTime() ?? 0;
      const bt = parseMockDate(b.date)?.getTime() ?? 0;
      return at - bt;
    });
  for (const arr of marksByBranch.values()) sortByDate(arr);

  const getLatestDateInBranch = (branchId: string): Date | null => {
    const arr = marksByBranch.get(branchId) ?? [];
    if (arr.length === 0) return null;
    return parseMockDate(arr[arr.length - 1]?.date);
  };

  const ONE_DAY = 24 * 60 * 60 * 1000;
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (const branch of branches) {
      if (!branch.parentBranchId) continue;
      const parent = branchById.get(branch.parentBranchId);
      if (!parent) continue;
      const childMarks = marksByBranch.get(branch.id) ?? [];
      if (childMarks.length === 0) continue;

      const firstChildDate = parseMockDate(childMarks[0]?.date);
      if (!firstChildDate) continue;
      const turningDate = branch.turningPointId
        ? parseMockDate(marksById.get(branch.turningPointId)?.date)
        : null;
      let anchor = turningDate;
      if (!anchor) {
        const parentMarks = marksByBranch.get(parent.id) ?? [];
        // Segment-anchor mode (no explicit turning point): use latest parent mark
        // at/before child start, not the parent's last mark.
        for (const pm of parentMarks) {
          const dt = parseMockDate(pm.date);
          if (!dt) continue;
          if (dt.getTime() <= firstChildDate.getTime()) anchor = dt;
          else break;
        }
      }
      if (!anchor) {
        anchor = getLatestDateInBranch(parent.id);
      }
      if (!anchor) continue;

      const minAllowed = new Date(anchor.getTime() + ONE_DAY);
      if (firstChildDate.getTime() >= minAllowed.getTime()) continue;
      // Preserve source chronology: if a branch starts before its assigned
      // narrative fork anchor, keep dates intact and detach it to root level.
      branch.parentBranchId = null;
      branch.turningPointId = null;
      branch.mapAngleOffset = 0;
      changed = true;
    }
    if (!changed) break;
  }
}

function buildScenario(
  density: MockDensity,
  options?: {
    profile?: typeof PROFILE;
    seeds?: Seed[];
    minEnabled?: Record<Branch["limbId"], string[]>;
    markCount?: Record<MockDensity, number>;
  },
): MockScenario {
  const profile = options?.profile ?? PROFILE;
  const seeds = options?.seeds ?? SEEDS;
  const minEnabled = options?.minEnabled ?? MIN_ENABLED;
  const markCount = options?.markCount ?? MARK_COUNT;
  const selected = seeds.filter((seed) =>
    density === "min" ? minEnabled[seed.limbId].includes(seed.name) : true,
  );

  const branches: Branch[] = selected.map((seed, idx) => {
    const id = `branch-${seed.limbId}-${slug(seed.name)}`;
    return {
      id,
      userId: USER_ID,
      limbId: seed.limbId,
      label: seed.name,
      name: seed.name,
      goal: density === "min" ? null : (seed.goal ?? null),
      goalValue: density === "min" ? null : (seed.goalValue ?? null),
      currentValue: density === "min" ? null : (seed.currentValue ?? null),
      unit: density === "min" ? null : (seed.unit ?? null),
      status: getStatus(seed, density),
      order: idx,
    parentBranchId: null,
    turningPointId: null,
    mapAngleOffset: 0,
      createdAt: seed.events[0]?.date ?? "2024-01-01",
      updatedAt: seed.events[Math.min(seed.events.length - 1, markCount[density] - 1)]?.date ?? "2024-01-01",
    };
  });

  const marks: Mark[] = [];
  const reframes: Reframe[] = [];
  selected.forEach((seed) => {
    const branchId = `branch-${seed.limbId}-${slug(seed.name)}`;
    seed.events.slice(0, markCount[density]).forEach((event, index) => {
      const id = `mark-${seed.limbId}-${slug(seed.name)}-${index + 1}`;
      marks.push({
        id,
        userId: USER_ID,
        limbId: seed.limbId,
        branchId,
        title: event.title,
        description: event.description,
        date: event.date,
        type: event.type,
        value: density === "min" ? null : (event.value ?? null),
        sentiment: density === "min" ? "neutral" : event.sentiment,
        archived: false,
        createdAt: event.date,
        updatedAt: event.date,
      });
      if (event.reframe && density !== "min") {
        if (density === "extensive" || reframes.length === 0) {
          reframes.push({
            id: `reframe-${id}`,
            markId: id,
            note: event.reframe,
            date: event.date,
            createdAt: event.date,
          });
        }
      }
    });
  });

  if (density !== "min") {
    injectMockRoadmapFork(branches, marks, density);
  }
  // Apply narrative fork structure across all mock profiles so branch behavior
  // is consistent "now and going forward". Missing branch names are skipped safely.
  applyLondon1960NarrativeFork(branches, marks);
  enforceMockBranchChronology(branches, marks);

  return {
    profile: {
      ...PROFILE,
      ...profile,
    },
    branches,
    marks,
    reframes,
  };
}

/** One child branch off "Main Career" so roadmap/tree views show fork edges (parentBranchId + turningPointId). */
function injectMockRoadmapFork(branches: Branch[], marks: Mark[], density: MockDensity) {
  const parentId = "branch-work-main-career";
  const turningMarkId = "mark-work-main-career-3";
  if (!branches.some((b) => b.id === parentId) || !marks.some((m) => m.id === turningMarkId)) {
    return;
  }
  const childId = "branch-work-founder-path";
  if (branches.some((b) => b.id === childId)) return;

  const goalLine =
    density === "extensive"
      ? "Reach first £1k MRR on indie product"
      : "Ship v1 of indie product";

  branches.push({
    id: childId,
    userId: USER_ID,
    limbId: "work",
    label: "Indie product path",
    name: "Indie product path",
    goal: goalLine,
    goalValue: density === "extensive" ? 1000 : null,
    currentValue: density === "extensive" ? 340 : null,
    unit: density === "extensive" ? "£ MRR" : null,
    status: "active",
    order: branches.length,
    parentBranchId: parentId,
    turningPointId: turningMarkId,
    mapAngleOffset: 25,
    createdAt: "2020-10-15T12:00:00.000Z",
    updatedAt: "2025-06-01T12:00:00.000Z",
  });

  marks.push(
    {
      id: "mark-work-founder-path-1",
      userId: USER_ID,
      limbId: "work",
      branchId: childId,
      title: "Nights-and-weekends build",
      description: "Split time after the product-role pivot.",
      date: "2021-04-01T12:00:00.000Z",
      type: "milestone",
      sentiment: "neutral",
      archived: false,
      createdAt: "2021-04-01T12:00:00.000Z",
      updatedAt: "2021-04-01T12:00:00.000Z",
    },
    {
      id: "mark-work-founder-path-2",
      userId: USER_ID,
      limbId: "work",
      branchId: childId,
      title: "First paying users",
      description: "Small revenue proved demand.",
      date: density === "extensive" ? "2025-08-01T12:00:00.000Z" : "2024-11-01T12:00:00.000Z",
      type: "achievement",
      sentiment: "positive",
      archived: false,
      createdAt: "2024-11-01T12:00:00.000Z",
      updatedAt: "2025-08-01T12:00:00.000Z",
    },
  );
}

export const MOCK_SCENARIOS: Record<MockDensity, MockScenario> = {
  min: buildScenario("min"),
  med: buildScenario("med"),
  extensive: buildScenario("extensive"),
};

export const MOCK_SCENARIOS_BY_PROFILE: Record<MockProfileId, Record<MockDensity, MockScenario>> = {
  alex: MOCK_SCENARIOS,
  david: {
    min: buildScenario("min", {
      profile: DAVID_PROFILE,
      seeds: DAVID_SEEDS,
      minEnabled: DAVID_MIN_ENABLED,
      markCount: DAVID_MARK_COUNT,
    }),
    med: buildScenario("med", {
      profile: DAVID_PROFILE,
      seeds: DAVID_SEEDS,
      minEnabled: DAVID_MIN_ENABLED,
      markCount: DAVID_MARK_COUNT,
    }),
    extensive: buildScenario("extensive", {
      profile: DAVID_PROFILE,
      seeds: DAVID_SEEDS,
      minEnabled: DAVID_MIN_ENABLED,
      markCount: DAVID_MARK_COUNT,
    }),
  },
};

export function getMockScenario(profileId: MockProfileId, density: MockDensity): MockScenario {
  return MOCK_SCENARIOS_BY_PROFILE[profileId][density];
}

export const MOCK_PROFILE_LABELS: Record<MockProfileId, string> = {
  alex: "Alex Carter",
  david: "David Thompson",
};

export const MOCK_DATA = MOCK_SCENARIOS.med;
export const MOCK_BRANCHES = MOCK_DATA.branches;
export const MOCK_MARKS = MOCK_DATA.marks;

type LegacyMockLifeData = {
  branches: Branch[];
  moments: Moment[];
  marks: Mark[];
  nodes: Moment[];
};

function parseYearMonth(value: string): { year: number; month: number | null } {
  const datePart = value.split("T")[0] ?? value;
  const [yearRaw, monthRaw] = datePart.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return {
    year: Number.isFinite(year) ? year : 2000,
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : null,
  };
}

function buildLegacyMomentsFromScenario(scenario: MockScenario): Moment[] {
  const marksByBranch = new Map<string, Mark[]>();
  for (const mark of scenario.marks) {
    const arr = marksByBranch.get(mark.branchId) ?? [];
    arr.push(mark);
    marksByBranch.set(mark.branchId, arr);
  }
  for (const arr of marksByBranch.values()) {
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  return scenario.marks.map((mark) => {
    const branchMarks = marksByBranch.get(mark.branchId) ?? [];
    const mapPosition = Math.max(0, branchMarks.findIndex((m) => m.id === mark.id));
    const { year, month } = parseYearMonth(mark.date);
    const significance = mark.type === "achievement" || mark.type === "decision" ? 3 : 2;
    const future = mark.type === "milestone" && new Date(mark.date).getTime() > Date.now();

    return {
      id: mark.id,
      userId: mark.userId,
      limbId: mark.limbId,
      branchId: mark.branchId,
      label: mark.title,
      description: mark.description ?? null,
      year,
      month,
      mapPosition,
      significance,
      future,
      isTurningPoint: mark.type === "decision",
      location: null,
      timelineNote: null,
      createdAt: mark.createdAt,
      updatedAt: mark.updatedAt,
    };
  });
}

export function getLegacyMockLifeData(
  profileId: MockProfileId = "alex",
  density: MockDensity = "extensive",
): LegacyMockLifeData {
  const scenario = getMockScenario(profileId, density);
  const moments = buildLegacyMomentsFromScenario(scenario);
  return {
    branches: scenario.branches,
    moments,
    marks: scenario.marks,
    nodes: moments,
  };
}
