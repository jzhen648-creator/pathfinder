import type { LifeAreaId } from "./types";
import { normalizeHubLabelKey } from "./taxonomy";

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
  /**
   * Optional hub-scoped conversation starters (catalog / future Stream prompts).
   * Not rendered as hub-panel chips — panel uses a single **Open Stream** entry.
   */
  openingQuestions?: [string, string, string];
  /** First-time guided onboarding Stream Lite placeholder (Scene 4). */
  firstTimeQuestion: string;
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
        "Route here when the item is about earning or cash inflow — salary, bonus, freelance, or side income. If money is being saved, invested, or moved into an account after it arrives, that's Assets or Safety net. Visa costs, rent, and living expenses are not income items unless the user is negotiating pay to cover them.",
      examples: [
        "Negotiate a raise",
        "Start freelance income",
        "Stabilise monthly cash flow",
        "Land first mortgage broker role",
        "Track commission ramp in year one",
      ],
      openingQuestions: [
        "What does your income look like right now — is it where you want it to be?",
        "Any conversation about pay or a new opportunity you've been putting off?",
        "If you could change one thing about how money comes in, what would it be?",
      ],
      firstTimeQuestion:
        "How's the money coming in — and is it where you want it to be?",
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
        "Route here for building net worth — ISA contributions, investments, savings pots with a growth goal, and property equity. If the pot is purely for emergencies or downside protection (not growth), it's Safety net. If the user mentions a specific savings target tied to a life event (visa fund, rent buffer, travel), prefer Safety net unless they explicitly frame it as investing.",
      examples: [
        "Open a stocks & shares ISA",
        "Increase pension contributions",
        "Rebalance portfolio allocation",
        "Hit £10k invested milestone",
        "Write a simple investment policy",
      ],
      openingQuestions: [
        "Are you putting money to work anywhere, or is it mostly sitting in a current account?",
        "What does financial independence look like to you, and are you moving toward it?",
        "Any investment decision you've been overthinking?",
      ],
      firstTimeQuestion:
        "What are you doing to grow your money, or what would you love to start?",
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
        "Route here for buffers, emergency funds, insurance, and protection against specific life shocks — visa costs, rent pressure, redundancy cushion, medical cover. The key signal is fear of a bad outcome, not desire for growth. If the user mentions a named life risk (visa, rent spike, job loss), this hub almost always wins over Assets even if the mechanism is a savings pot.",
      examples: [
        "Hit 6-month emergency fund",
        "Review income protection insurance",
        "Stress-test runway if income stops",
        "Top up high-interest savings",
        "Update will tied to protection plan",
      ],
      openingQuestions: [
        "How solid does your financial cushion feel — solid, thin, or nonexistent?",
        "What's the scenario that would stress you out most if it happened tomorrow?",
        "Any insurance or emergency fund you keep meaning to sort?",
      ],
      firstTimeQuestion:
        "What's the financial thing you don't want to think about — but probably should?",
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
        "Route here for money owed to creditors — credit cards, loans, overdrafts, buy-now-pay-later balances. The signal is a named debt with a balance or repayment plan. Do not route visa application fees, rent deposits, or one-off costs here — those are Safety net. Do not route mortgage equity building here — that is Assets.",
      examples: [
        "Pay off credit card",
        "Refinance mortgage",
        "Snowball consumer debt",
        "Settle joint property with Dad",
        "Close BNPL balance before move",
      ],
      openingQuestions: [
        "What do you owe, and does any of it feel like it's hanging over you?",
        "Any debt with a plan attached, or is it still just floating?",
        "What would it feel like to clear a specific debt — is there a clear target?",
      ],
      firstTimeQuestion:
        "Got any debt you'd love to clear, or anything financial weighing on you?",
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
        "Route here for role, employer, promotion, redundancy, job search, and career direction — what the user does for work and where it's going. If the user is studying for a qualification or doing a course (CEMAP, certification, language), that's Skills. If they're shipping a portfolio piece or publishing content, that's Builds & Launches. Career covers the role itself; the other two cover the inputs and outputs. Extract all three when present in the same dump.",
      examples: [
        "Land Head of Product role",
        "Plan promotion to director",
        "Scope industry pivot",
        "First interview with brokerage",
        "Map commission ramp timeline",
      ],
      openingQuestions: [
        "What's your current role, and does it feel like the right direction?",
        "Any move — promotion, pivot, new company — you've been circling but not making?",
        "Where do you want to be professionally in two to three years?",
      ],
      firstTimeQuestion:
        "What are you doing for work right now, and where do you want it to take you?",
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
        "Route here for learning, qualifications, courses, certifications, practice, and skill-building — the inputs that compound into capability. CEMAP, language learning, technical practice, and reading lists belong here even when motivated by a career goal. If the user names a specific qualification or course, this hub almost always wins over Career. Do not collapse a Skills item into a Career pursuit just because they share a target role.",
      examples: [
        "Complete CeMAP qualification",
        "Deepen SQL for analytics",
        "Find a mentor in your field",
        "LinkedIn outreach for learning (not social)",
        "Finish product management course",
      ],
      openingQuestions: [
        "What's a gap in your toolkit that you're most aware of right now?",
        "Any course, qualification, or skill you've been meaning to properly work on?",
        "Who in your field do you admire for their craft — and what do they have that you're still building?",
      ],
      firstTimeQuestion:
        "What's something you'd love to be great at — even if you're not there yet?",
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
        "Route here when the user describes building, shipping, or releasing a tangible work output — YouTube videos, portfolio pieces, products, side projects with a deliverable. The signal is something that gets published or completed, not learned or earned. When a new target is a clear next chapter of an existing shipped pursuit (same channel or product, higher metric, later date), extract it as a continuation with parentRef, not a peer pursuit.",
      examples: [
        "Ship Pathfinder v1",
        "Finish case-study portfolio",
        "Deliver Q3 product launch",
        "Publish paid newsletter issue",
        "Release portfolio website",
        "Reach 10k YouTube subscribers (continuation after 5k goal on this hub)",
      ],
      openingQuestions: [
        "Is there a project or idea you've been building, stalling on, or shipping soon?",
        "What's the last thing you finished and put out into the world?",
        "Any side project or portfolio piece you've promised yourself you'd start?",
      ],
      firstTimeQuestion:
        "What's something you'd love to put out into the world — built, launched, finished?",
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
        "Route here for meaning, values, spirituality, life direction, and intentional giving — the 'what do I believe and what matters' questions. If the core work is healing, processing patterns, or therapy, that's Inner life. If it's leisure or refuel, that's Joy. Purpose is about direction; Inner life is about repair. When the user is genuinely uncertain which one applies, route to ambiguous[] rather than guessing.",
      examples: [
        "Write a personal mission",
        "Refine my north star",
        "Move back to London for family (values-led)",
        "Values-led giving plan",
        "Figure out what I actually want long-term",
      ],
      openingQuestions: [
        "What gives your life a sense of direction right now — does that feel clear or fuzzy?",
        "Any values you've been living by — or failing to live by — that feel worth naming?",
        "Is there a version of your life you're aiming at that's hard to articulate?",
      ],
      firstTimeQuestion:
        "What feels meaningful to you right now — and is your life pointing toward it?",
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
        "Route here for therapy, grief, shadow patterns, identity shifts, emotional processing, and personal rituals that work on inner experience. The signal is repair, healing, or pattern change. Not for values questions (Purpose), not for skills or work (Skills/Career), not for body projects (Appearance). If the user mentions therapy by name, this hub wins over Purpose. Loneliness, self-criticism, and emotional flinching belong here.",
      examples: [
        "Start therapy",
        "Process anxiety before the move",
        "Journal through a breakup",
        "Work through anger at Dad",
        "Build a morning reflection ritual",
      ],
      openingQuestions: [
        "How would you describe where you are emotionally at the moment?",
        "Any pattern — in yourself, in relationships — that keeps coming up and you haven't got to the bottom of?",
        "Are you doing any deliberate inner work right now — therapy, journalling, anything like that?",
      ],
      firstTimeQuestion:
        "What's something about yourself you've been figuring out lately?",
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
        "Route here for hobbies, travel, culture, play, and refuel — things that are ends in themselves, not means to a goal. If the user would feel guilty calling it work, it belongs here. Reading, gaming, weekend trips, concerts, walks, time with friends as recreation. If a friendship activity is framed as social belonging (Friendships) or family care (Family), prefer those hubs; Joy is for the activity itself.",
      examples: [
        "Revive weekend hiking",
        "Plan Japan trip",
        "See live jazz monthly",
        "Join local game night",
        "Book concert tickets",
      ],
      openingQuestions: [
        "What's something you genuinely enjoy that you haven't done in too long?",
        "Any trip, experience, or hobby that keeps getting pushed to next month?",
        "What does a really good week look like for you — is there enough play in it?",
      ],
      firstTimeQuestion:
        "What do you love doing for no other reason than the fact you love it?",
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
        "Route here for parents, siblings, children, in-laws, and family care — including emotional dynamics like a parent going silent or pressure to introduce a partner. If the user mentions a parent or sibling by relation (Mum, Dad, brother), this is Family even when the emotion is about the user's own state. Do not route partner or fiancé items here — those are Romance.",
      examples: [
        "Weekly call with dad",
        "Co-parenting schedule",
        "Support sibling through illness",
        "Discuss London return with parents",
        "Heal tension with mum",
      ],
      openingQuestions: [
        "How are things with your family right now — anything live that needs more attention from you?",
        "Is there a relationship with a parent, sibling, or child you'd like to tend more carefully?",
        "Any family dynamic that's been sitting in the background unresolved?",
      ],
      firstTimeQuestion: "Who in your family is on your mind — for better or worse?",
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
        "Route here for spouse, partner, fiancé, dating, engagement, and romantic commitment — including the admin that comes with it (spousal visa, wedding planning, moving in). Spousal visa applications are Romance, not Family, even when families are involved. If the user mentions a girlfriend, boyfriend, or partner by role, this hub wins.",
      examples: [
        "Plan engagement",
        "Repair after major conflict",
        "Align on having kids",
        "Date night ritual",
        "Spouse visa paperwork",
      ],
      openingQuestions: [
        "How are things in your romantic life — are you in it, building it, or still figuring it out?",
        "Any conversation with your partner you've been putting off?",
        "What does a strong version of this relationship look like — and what's the gap right now?",
      ],
      firstTimeQuestion:
        "What's the story of your love life right now — and what would you change?",
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
        "Route here for friends, community, social belonging, and chosen connections outside family and romance. Reconnecting with old friends, weekly meet-ups, or feeling distant from a friend group all belong here. Not for professional networking (Career) or family time (Family). If a friend is named and the activity is about the relationship rather than the activity itself, prefer Friendships over Joy.",
      examples: [
        "Reconnect with old friend",
        "Host monthly dinner club",
        "Volunteer with local group",
        "Meet neighbours properly",
        "Find London Thai community",
      ],
      openingQuestions: [
        "Who are the people you'd see more if life allowed — anyone who comes to mind immediately?",
        "Is there a friendship that's drifted that you've been meaning to bring back — who is it with?",
        "What kind of community do you want around you, and is it actually there?",
      ],
      firstTimeQuestion:
        "Who do you wish you saw more of, and what's getting in the way?",
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
        "Route here for exercise, running, gym, sport, walking, and movement practice — physical activity for its own sake or for fitness. Couch-to-5k, 10k training, strength work all belong here. If the user mentions a completed run or workout as a moment of pride, extract it as a mark. When the input contains both Movement and Nutrition items in the same dump, extract both — do not collapse one into the other.",
      examples: [
        "Start 3× strength program",
        "Train for half marathon",
        "Join Muay Thai gym",
        "Fix hip mobility",
        "Couch-to-5k plan",
      ],
      openingQuestions: [
        "What does your movement look like right now — routine, sporadic, or nothing at all?",
        "Any training goal — race, programme, physical milestone — you've been working toward or wanting to start?",
        "Is there a way your body feels that you're actively trying to change?",
      ],
      firstTimeQuestion:
        "Are you moving your body the way you want to — running, lifting, playing, anything?",
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
        "Route here for eating, drinking, food habits, and meal patterns — what the user puts in their body. If the input mentions meal prep, cutting takeaways, or food as comfort, this is Nutrition even if it appears inside a broader health dump. Do not suppress a Nutrition item just because Movement items appear in the same input — extract both.",
      examples: [
        "Simplify weekday dinners",
        "Cut late-night snacking",
        "Protein target for training",
        "Learn Thai cooking at home",
        "Calibrate London food budget",
      ],
      openingQuestions: [
        "How's your relationship with food day to day — is it working for you?",
        "Any eating habit you've been meaning to fix or build?",
        "What does eating well actually mean to you — do you have a clear picture of it?",
      ],
      firstTimeQuestion: "How's your eating going — fuelling you, or fighting you?",
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
        "Route here for intentional body and grooming projects — haircuts, skincare, teeth, cosmetic treatments, dressing, style. The signal is presentation and how the user looks. Photo flinching, mirror avoidance, and not feeling comfortable in pictures belong here. If the underlying issue is emotional rather than presentation-focused, route to ambiguous[] with both Appearance and Inner life flagged.",
      examples: [
        "Plan Invisalign",
        "Book dermatologist for acne",
        "Complete hair restoration protocol",
        "Finish dental work before move",
        "Skincare routine for confidence",
      ],
      openingQuestions: [
        "Is there something about how you look or present yourself that you've been wanting to change?",
        "Any grooming, dental, or skin project that's been on the list for a while?",
        "Is there a version of how you present yourself that still feels out of reach?",
      ],
      firstTimeQuestion:
        "Is there anything about how you show up — face, hair, style, body — you'd love to upgrade?",
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
        "Route here for sleep, recovery, downtime, lights-out rules, and deliberate rest — the deliberate practice of resting. Lights-out times, sleep hygiene, naps, recovery days from training all belong here. Not for entertainment as leisure (Joy) and not for medical sleep treatments framed primarily as a health condition. If the user names a specific bedtime rule or sleep target, this hub wins.",
      examples: [
        "Fix 10pm wind-down",
        "Block recovery weekend after launch",
        "Address chronic undersleep",
        "Protect sleep during newborn phase",
        "Take a real no-plan Sunday",
      ],
      openingQuestions: [
        "How's your sleep — is it restoring you, or do you wake up still tired?",
        "Any wind-down ritual or recovery habit you keep meaning to build?",
        "When did you last have a proper stretch of rest — not just a night off, but real downtime?",
      ],
      firstTimeQuestion:
        "Are you sleeping well, or is rest something you keep meaning to sort out?",
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
    openingQuestions: [
      `What's been happening in ${label} lately?`,
      `Is there something in ${label} you've been meaning to work on?`,
      `What would progress look like for you in ${label}?`,
    ],
    firstTimeQuestion: `What's on your mind about ${label} right now?`,
  };
}

/** First-time onboarding Stream placeholder for a hub. */
export function hubFirstTimeQuestion(areaId: string, hubLabel: string): string {
  return hubPanelCopy(areaId, hubLabel).firstTimeQuestion;
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
