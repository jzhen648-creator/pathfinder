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
   * Rendered as guided starter chips in the empty hub panel when hub has zero pursuits.
   */
  openingQuestions?: [string, string, string];
  /** First-time guided onboarding Stream placeholder (Scene 4). */
  firstTimeQuestion: string;
  /** Hub-specific open-Stream coach mark instruction during onboarding. */
  coachMarkHubInstruction: string;
};

/** Locked default-hub copy — keyed by theme id + hub display name (`Branch.label` / `thread.type`). */
const HUB_CATALOG: Partial<Record<LifeAreaId, Record<string, HubCatalogEntry>>> = {
  finance: {
    "Employment income": {
      about:
        "Pay from a job or employer — salary, bonus, commission, PAYE, and negotiated raises. Employment cash flow, not rental yields, business revenue, or investment returns.",
      why: "Salary is the default income lane for most people; separating it from rental and business stops everything from collapsing into one vague 'money in' blob.",
      belongsHere: [
        "Negotiate a raise",
        "Land mortgage advisor role",
        "Track commission ramp in year one",
      ],
      doesNotBelongHere: [
        "BTL rental yield target (→ Rental & property income)",
        "Freelance invoicing system (→ Business & freelance income)",
        "ISA contributions (→ Assets & investing)",
      ],
      aiRoutingNote:
        "Route here for employment pay — salary, bonus, commission from a job, promotion pay, and employer-side negotiation. Rental income, landlord yields, and property tenants → Rental & property income. Freelance, sole-trader, invoicing, and business revenue → Business & freelance income. If money is saved or invested after it arrives, that's Assets & investing or Safety net — not income.",
      examples: [
        "Negotiate a raise",
        "Land first mortgage broker role",
        "Track commission ramp in year one",
        "Stabilise monthly salary",
        "Switch employer for better pay",
      ],
      openingQuestions: [
        "What does your pay look like right now — is it where you want it to be?",
        "Any conversation about salary or a new role you've been putting off?",
        "If you could change one thing about how your job pays, what would it be?",
      ],
      firstTimeQuestion:
        "How's your employment income — and is it where you want it to be?",
      coachMarkHubInstruction: "Any pay or role income goals you're working toward?",
    },
    "Rental & property income": {
      about:
        "Cash flow from property you own or let — buy-to-let, room lets, Airbnb, landlord yields, and rental portfolio income. Property as an income source, not mortgage payoff or equity building.",
      why: "Rental income has different tax, risk, and benchmarking than salary; it deserves its own lane for Insights and routing.",
      belongsHere: [
        "Rental income",
        "Grow BTL portfolio yield",
        "Let spare room consistently",
      ],
      doesNotBelongHere: [
        "Negotiate salary (→ Employment income)",
        "Freelance consulting invoices (→ Business & freelance income)",
        "Pay off buy-to-let mortgage (→ Debts & obligations)",
      ],
      aiRoutingNote:
        "Route here when the user earns from property they own or let — rent, BTL, landlord, tenants, room let, Airbnb, HMO, property yield. Generic 'income' with rental cues wins here over Employment income. Mortgage balance payoff → Debts & obligations; building equity or investing sale proceeds → Assets & investing.",
      examples: [
        "Rental income",
        "Grow BTL portfolio yield",
        "Let spare room consistently",
        "Stabilise tenant voids",
        "Track net rental after costs",
      ],
      openingQuestions: [
        "Do you earn from property — and is that income where you want it?",
        "Any landlord or rental goal you've been circling?",
        "What would make your property income feel stable or worth the hassle?",
      ],
      firstTimeQuestion:
        "Any rental or property income you're building or relying on?",
      coachMarkHubInstruction: "Rental or property income you're tracking?",
    },
    "Business & freelance income": {
      about:
        "Money you earn outside employment — freelance clients, sole-trader work, side business revenue, consulting, and invoicing. Your own business cash flow, not salary or rental yields.",
      why: "Self-employed income behaves differently from payroll; separating it keeps freelance and business goals routable and benchmarkable.",
      belongsHere: [
        "Start freelance income",
        "Grow consulting pipeline",
        "Stabilise monthly business revenue",
      ],
      doesNotBelongHere: [
        "Salary negotiation (→ Employment income)",
        "BTL rental yield (→ Rental & property income)",
        "Invest business profits in ISA (→ Assets & investing)",
      ],
      aiRoutingNote:
        "Route here for freelance, self-employed, sole-trader, side business, consulting clients, invoicing, and business revenue — cash in from work you run, not from an employer or tenants. Commission from a brokerage job → Employment income. Rent from a flat you own → Rental & property income.",
      examples: [
        "Start freelance income",
        "Grow consulting pipeline",
        "Stabilise monthly business revenue",
        "Raise day rate",
        "First paid client milestone",
      ],
      openingQuestions: [
        "Are you earning on your own — freelance or business — and how's that going?",
        "Any client, rate, or pipeline goal you've been putting off?",
        "What would make self-employed income feel stable?",
      ],
      firstTimeQuestion:
        "Any freelance or business income you're building?",
      coachMarkHubInstruction: "Freelance or business income goals?",
    },
    "Assets & investing": {
      about:
        "Wealth you grow and hold — pensions, index funds, property equity, brokerage accounts, and allocation decisions. Long-horizon building, not monthly paycheck or monthly bills.",
      why: "Compounding only shows up when investments are separated from day-to-day income and expenses.",
      belongsHere: [
        "Open a stocks & shares ISA",
        "Increase pension contributions",
        "Rebalance portfolio allocation",
      ],
      doesNotBelongHere: [
        "Salary negotiation (→ Employment income)",
        "Income protection insurance (→ Safety net)",
        "Mortgage balance payoff (→ Debts & obligations)",
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
      coachMarkHubInstruction: "Building wealth anywhere — savings, investments?",
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
        "Stock market investing (→ Assets & investing)",
        "Credit card payoff (→ Debts & obligations)",
        "Negotiate salary (→ Employment income)",
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
      coachMarkHubInstruction: "Any financial protection you want to put in place?",
    },
    "Debts & obligations": {
      about:
        "Debts and obligations you must repay — mortgages, loans, credit cards, BNPL, and structured payoff plans. Not charitable giving or investing.",
      why: "Debt has its own psychology and math; tracking it separately keeps payoff plans honest.",
      belongsHere: [
        "Pay off credit card",
        "Refinance mortgage",
        "Snowball consumer debt",
      ],
      doesNotBelongHere: [
        "Values-led charity or tithing (→ Purpose & Values)",
        "Building investment portfolio (→ Assets & investing)",
        "Income protection policy (→ Safety net)",
      ],
      aiRoutingNote:
        "Route here for money owed to creditors — credit cards, loans, overdrafts, buy-now-pay-later balances. The signal is a named debt with a balance or repayment plan. Do not route visa application fees, rent deposits, or one-off costs here — those are Safety net. Do not route mortgage equity building here — that is Assets & investing.",
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
      coachMarkHubInstruction: "Any debt you want to plan around or clear?",
    },
  },
  work: {
    Job: {
      about:
        "Your job — title, employer, promotion, redundancy, job search, and where paid work is heading. The theme already says career; this category is the job itself, not courses or shipped work.",
      why: "Job moves are high-stakes and infrequent; they deserve a category that is not cluttered with every course or side repo.",
      belongsHere: [
        "Land Head of Product role",
        "Plan promotion to director",
        "Scope industry pivot",
      ],
      doesNotBelongHere: [
        "Complete AWS certification (→ Skills & learning)",
        "Ship portfolio website v1 (→ Projects & shipping)",
        "Close friendship with former colleague (→ Friendships)",
      ],
      aiRoutingNote:
        "Route here for role, employer, promotion, redundancy, job search, and where paid work is going. If the user is studying for a qualification or doing a course (CEMAP, certification, language), that's Skills & learning. If they're shipping a portfolio piece or publishing content, that's Projects & shipping. Job covers the role itself; the other two cover the inputs and outputs. Extract all three when present in the same dump.",
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
      coachMarkHubInstruction: "Where do you want your career to go from here?",
    },
    "Skills & learning": {
      about:
        "Capabilities you are building — courses, certifications, deliberate practice, tools, mentors, and professional relationships that make you better at the craft. Networking for learning and career capital, not social life.",
      why: "Skills compound separately from any single job title or shipped project.",
      belongsHere: [
        "Complete product management certification",
        "Find a mentor in your field",
        "Deepen SQL for analytics",
      ],
      doesNotBelongHere: [
        "Ship side project MVP (→ Projects & shipping)",
        "Ask for promotion (→ Job)",
        "Weekend trip with friends (→ Joy & Creativity)",
      ],
      aiRoutingNote:
        "Route here for learning, qualifications, courses, certifications, practice, and skill-building — the inputs that compound into capability. CEMAP, language learning, technical practice, and reading lists belong here even when motivated by a job goal. If the user names a specific qualification or course, this hub almost always wins over Job. Do not collapse a Skills item into a Job pursuit just because they share a target role.",
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
      coachMarkHubInstruction: "Any skills or qualifications you're working toward?",
    },
    "Projects & shipping": {
      about:
        "Concrete work you ship — side projects, portfolio pieces, flagship builds, launches, and published artifacts with a done state. If it has a deliverable or release, it lives here.",
      why: "Shipping is a different muscle from climbing the ladder or taking a course; separating it keeps busy from done.",
      belongsHere: [
        "Ship Pathfinder v1",
        "Finish case-study portfolio",
        "Deliver Q3 product launch",
      ],
      doesNotBelongHere: [
        "Promotion planning (→ Job)",
        "Learn React course (→ Skills & learning)",
        "Hobby game dev with no ship goal (→ Joy & Creativity)",
      ],
      aiRoutingNote:
        "Route here when the user describes building, shipping, or releasing a tangible work output — YouTube videos, portfolio pieces, products, side projects with a deliverable. The signal is something that gets published or completed, not learned or earned. When a new target is a clear next chapter of an existing shipped pursuit (same channel or product, higher metric, later date), extract it as a new peer pursuit with a distinct title.",
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
      coachMarkHubInstruction: "Got a project or idea you want to ship?",
    },
  },
  becoming: {
    "Purpose & Values": {
      about:
        "Life direction, meaning, identity, principles, and the kind of person you want to become — values, north star, faith, wonder, and values-led giving. The why behind your life, not day-to-day mood management or hobbies.",
      why: "Without a purpose hub, existential goals get misfiled as generic self-help or random projects.",
      belongsHere: [
        "Figure out what I actually want from life",
        "Make my actions match my values",
        "Values-led giving plan",
      ],
      doesNotBelongHere: [
        "Weekly therapy for anxiety (→ Mind & Emotions)",
        "Manage my anxiety better (→ Mind & Emotions)",
        "Start painting again (→ Joy & Creativity)",
      ],
      aiRoutingNote:
        "Route here for life direction, meaning, identity, principles, personal standards, values, self-definition, and long-term personal direction — the 'what matters and who I want to become' questions. If the core work is healing, processing patterns, therapy, anxiety, or emotional regulation, that's Mind & Emotions. If it's fun, hobbies, play, or leisure, that's Joy & Creativity. Purpose & Values is direction; Mind & Emotions is thoughts and feelings in practice. When genuinely uncertain, route to ambiguous[] rather than guessing.",
      examples: [
        "I want to figure out what I actually want from life",
        "I want to live with more discipline and integrity",
        "I need to decide what kind of person I want to become",
        "I want to build a more meaningful life",
        "I want my actions to match my values",
      ],
      openingQuestions: [
        "What gives your life a sense of direction right now — does that feel clear or fuzzy?",
        "Any values you've been living by — or failing to live by — that feel worth naming?",
        "Is there a version of your life you're aiming at that's hard to articulate?",
      ],
      firstTimeQuestion:
        "What feels meaningful to you right now — and is your life pointing toward it?",
      coachMarkHubInstruction: "Any direction or values you want to build toward?",
    },
    "Mind & Emotions": {
      about:
        "Thoughts, feelings, mental patterns, emotional regulation, confidence, anxiety, resilience, self-talk, journaling, reflection, motivation, discipline, procrastination, and psychological wellbeing — including therapy and grief work.",
      why: "Emotional and mental life is ongoing and intimate; it should not compete with career skills or body projects under Health.",
      belongsHere: [
        "I feel overwhelmed and need to organise my thoughts",
        "I need to manage my anxiety better",
        "Start weekly therapy",
      ],
      doesNotBelongHere: [
        "Clarify life mission statement (→ Purpose & Values)",
        "Values-led charity plan (→ Purpose & Values)",
        "Run a 10k training plan (→ Movement)",
      ],
      aiRoutingNote:
        "Route here for thoughts, feelings, mental patterns, emotional regulation, confidence, anxiety, resilience, self-talk, journaling, reflection, motivation, discipline, procrastination, therapy, grief, and psychological wellbeing. The signal is inner experience, repair, or pattern change — not life-direction values (Purpose & Values), not work output (Job / Skills & learning), not body presentation projects (Body & grooming). If the user mentions therapy by name, this hub wins over Purpose & Values. Physical health goals belong on Health & Body unless the user is mainly discussing emotions or mindset around those issues.",
      examples: [
        "I feel overwhelmed and need to organise my thoughts",
        "I want to become more confident",
        "I need to manage my anxiety better",
        "I keep procrastinating and want to understand why",
        "I want to stop being so reactive emotionally",
        "I want to build better mental discipline",
      ],
      openingQuestions: [
        "How would you describe where you are emotionally at the moment?",
        "Any pattern — in yourself, in relationships — that keeps coming up and you haven't got to the bottom of?",
        "Are you doing any deliberate inner work right now — therapy, journalling, anything like that?",
      ],
      firstTimeQuestion:
        "What's something about your thoughts or feelings you've been working through lately?",
      coachMarkHubInstruction: "Anything on your mind emotionally that you want to track?",
    },
    "Joy & Creativity": {
      about:
        "Creative expression and playful identity projects that are about who you are becoming — not leisure hobbies, media, or travel (see Play & Leisure). Narrower than the old folded Pleasures lane.",
      why: "Some creative joy is about self-expression tied to values; it should not compete with therapy or with pure leisure.",
      belongsHere: [
        "Write a personal manifesto",
        "Start a creative ritual",
        "Make space for playful self-expression",
      ],
      doesNotBelongHere: [
        "Learn guitar for fun (→ Hobbies on Play & Leisure)",
        "Plan Japan trip (→ Experiences on Play & Leisure)",
        "Weekly film club (→ Culture on Play & Leisure)",
      ],
      aiRoutingNote:
        "Route here only for creative self-expression and playful identity work that clearly fits Self & Mind — not general hobbies, media, travel, or entertainment. Leisure, hobbies, culture consumption, and experiences belong on Play & Leisure (pleasures theme). Social fun centered on people may belong on Friendships or Romance.",
      examples: [
        "Start a creative ritual",
        "Make space for playful self-expression",
        "Write for myself, not to publish",
      ],
      openingQuestions: [
        "Is there a creative side of you that feels underfed?",
        "Any playful expression that connects to who you're becoming?",
        "What would making space for that look like this month?",
      ],
      firstTimeQuestion:
        "Is there a creative or playful part of you that deserves its own lane?",
      coachMarkHubInstruction: "Any creative joy that's really about you, not just fun?",
    },
  },
  pleasures: {
    Hobbies: {
      about:
        "Personal interests you do for fun — crafts, gaming, collecting, gardening, making, tinkering. Active doing, not passive consumption.",
      why: "Hobbies need their own lane so they do not collapse into inner work or career side projects.",
      belongsHere: [
        "Get back into painting",
        "Finish my Warhammer army",
        "Start a vinyl collection",
      ],
      doesNotBelongHere: [
        "Read more fiction (→ Culture)",
        "Plan a trip to Japan (→ Experiences)",
        "Therapy for burnout (→ Mind & Emotions)",
      ],
      aiRoutingNote:
        "Route here for hobbies, crafts, gaming, collecting, making, and personal interests done for enjoyment. Active leisure and skill-for-fun belong here. Passive media consumption → Culture. Trips and events → Experiences. Work output with a deliverable → Projects & shipping.",
      examples: [
        "Get back into painting",
        "Learn guitar for fun",
        "Start a board game night habit",
        "Build a model railway",
      ],
      openingQuestions: [
        "What hobby have you let slide that you'd actually miss?",
        "Anything you make or collect just because you love it?",
        "What would picking it back up look like?",
      ],
      firstTimeQuestion: "What do you love making, playing, or collecting?",
      coachMarkHubInstruction: "Any hobbies you want back in your life?",
    },
    Culture: {
      about:
        "Books, music, art, film, theatre, and media you engage with for enrichment and pleasure — reading, listening, watching, visiting.",
      why: "Culture is consumption and appreciation — different from making hobbies or booking trips.",
      belongsHere: [
        "Read 12 books this year",
        "See more live music",
        "Start a film list",
      ],
      doesNotBelongHere: [
        "Learn to play piano (→ Hobbies)",
        "Trip to Japan (→ Experiences)",
        "Write a novel (→ Joy & Creativity or Projects & shipping if shipping)",
      ],
      aiRoutingNote:
        "Route here for reading, listening, watching, exhibitions, concerts, theatre, and media appreciation. Learning an instrument as a hobby → Hobbies. Travel and events → Experiences.",
      examples: [
        "Read 12 books this year",
        "See more live music",
        "Watch the director's cut list",
      ],
      openingQuestions: [
        "What are you reading, watching, or listening to lately?",
        "Any culture you wish you made more room for?",
        "What would one small step toward that be?",
      ],
      firstTimeQuestion: "What books, music, or films are part of your life right now?",
      coachMarkHubInstruction: "Any culture you want more of?",
    },
    Experiences: {
      about:
        "Travel, events, adventures, holidays, festivals, and purchases made for joy — the experiences you plan and remember.",
      why: "Experiences are episodic and logistical; they should not absorb every leisure goal.",
      belongsHere: [
        "Plan Japan trip",
        "Go to a festival this summer",
        "Book a special meal out",
      ],
      doesNotBelongHere: [
        "Daily gaming habit (→ Hobbies)",
        "Read travel writing (→ Culture)",
        "Move abroad for work (→ Career or Life & Admin themes)",
      ],
      aiRoutingNote:
        "Route here for trips, holidays, events, adventures, festivals, and experience purchases done for joy. Ongoing hobbies → Hobbies. Media and books about travel → Culture unless the user is clearly planning the trip.",
      examples: [
        "Plan Japan trip",
        "Weekend in the Lakes",
        "Festival with friends",
      ],
      openingQuestions: [
        "Any trip or event you're circling but haven't booked?",
        "What experience would make the next few months feel alive?",
        "What would planning that look like this week?",
      ],
      firstTimeQuestion: "What experience are you most looking forward to — or missing?",
      coachMarkHubInstruction: "Any trips or events you want to plan?",
    },
  },
  people: {
    Family: {
      about:
        "Kin and family role — parents, children, siblings, co-parenting, elder care, and family obligations or healing. Blood or chosen family structure, not friends or romance.",
      why: "Family dynamics carry unique guilt and duty; they should not be diluted into generic relationships.",
      belongsHere: [
        "Mum",
        "Dad",
        "Co-parenting with Alex",
      ],
      doesNotBelongHere: [
        "Date night with partner (→ Romance)",
        "Reconnect with university friend (→ Friendships)",
        "Couples therapy for partnership (→ Romance)",
      ],
      aiRoutingNote:
        "Route here for parents, siblings, children, in-laws, and family care — including emotional dynamics like a parent going silent or pressure to introduce a partner. If the user mentions a parent or sibling by relation (Mum, Dad, brother), this is Family even when the emotion is about the user's own state. Do not route partner or fiancé items here — those are Romance. Connection titles: name each new pursuit after the person or family relationship (e.g. Mum, Dad, Sister Anna, Co-parenting with Alex) — not as a productivity goal (avoid Improve relationship with…, Invest in family…, Work on…). Put plans and intentions (calls, visits, hard conversations, schedules) in milestones[]; put past moments in marks[].",
      examples: [
        "Mum",
        "Dad",
        "Sister Anna",
        "Co-parenting with Alex",
        "Grandma",
      ],
      openingQuestions: [
        "Who in your family do you want to show up for more?",
        "Is there a parent, sibling, or child you've been distant from?",
        "Any family conversation you've been putting off?",
      ],
      firstTimeQuestion: "Who in your family is on your mind — for better or worse?",
      coachMarkHubInstruction: "Who in your family deserves more of your attention?",
    },
    Romance: {
      about:
        "Partnership and intimacy — dating, marriage, cohabitation, commitment, and the romantic relationship you are building or repairing.",
      why: "Partnership has its own stakes and rhythms; it should not be confused with friendship or family duty.",
      belongsHere: [
        "Sarah",
        "Our marriage",
        "Partner",
      ],
      doesNotBelongHere: [
        "Host friends dinner (→ Friendships)",
        "Visit parents (→ Family)",
        "Individual therapy for self only (→ Mind & Emotions)",
      ],
      aiRoutingNote:
        "Route here for spouse, partner, fiancé, dating, engagement, and romantic commitment — including the admin that comes with it (spousal visa, wedding planning, moving in). Spousal visa applications are Romance, not Family, even when families are involved. If the user mentions a girlfriend, boyfriend, or partner by role, this hub wins. Connection titles: name pursuits after the partner or the relationship (e.g. Sarah, James, Our marriage) — not goal verbs (avoid Improve relationship with…, Invest in partnership…, Repair our marriage as a pursuit title). Engagement, visa, date-night, and conflict-repair plans go in milestones[]; past moments in marks[].",
      examples: [
        "Sarah",
        "Our marriage",
        "James",
        "Partner",
        "Fiancé",
      ],
      openingQuestions: [
        "Who's at the centre of your romantic life right now?",
        "Any conversation with your partner you've been putting off?",
        "What would feeling close again actually look like day to day?",
      ],
      firstTimeQuestion: "Who's at the centre of your love life right now?",
      coachMarkHubInstruction: "Who matters most in your romantic life right now?",
    },
    Friendships: {
      about:
        "Chosen relationships and belonging — close friends, communities, neighbours, groups, and showing up for causes with people. Professional networking for career growth goes to Skills.",
      why: "Friendships need intentional care but are not the same as family duty or romance.",
      belongsHere: [
        "James",
        "Friendship with James",
        "London Thai community",
      ],
      doesNotBelongHere: [
        "LinkedIn outreach for job search (→ Skills & learning)",
        "Anniversary trip with partner (→ Romance)",
        "Family reunion (→ Family)",
      ],
      aiRoutingNote:
        "Route here for friends, community, social belonging, and chosen connections outside family and romance. Reconnecting with old friends, weekly meet-ups, or feeling distant from a friend group all belong here. Not for professional networking (Career) or family time (Family). If a friend is named and the activity is about the relationship rather than the activity itself, prefer Friendships over Joy & Creativity. Connection titles: name pursuits after the friend or community (e.g. James, Friendship with James, London Thai community) — not productivity framing (avoid Improve friendship with…, Invest in social life…). Meet-ups, reconnection plans, and volunteering cadence go in milestones[]; past moments in marks[].",
      examples: [
        "James",
        "Friendship with James",
        "Dinner club crew",
        "London Thai community",
        "Neighbours on our street",
      ],
      openingQuestions: [
        "Who are the people you'd see more if life allowed — anyone who comes to mind immediately?",
        "Is there a friendship that's drifted — who is it with?",
        "What kind of community do you want around you, and is it actually there?",
      ],
      firstTimeQuestion: "Who do you wish you saw more of, and what's getting in the way?",
      coachMarkHubInstruction: "Who do you want in your life more — or back in it?",
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
        "Sleep schedule (→ Rest & sleep)",
        "Hair transplant (→ Body & grooming)",
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
      coachMarkHubInstruction: "Training goals? Fitness you want to build or track?",
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
        "CPAP for sleep apnea (→ Rest & sleep)",
        "Teeth whitening (→ Body & grooming)",
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
      coachMarkHubInstruction: "Any eating habits you want to build or change?",
    },
    "Body & grooming": {
      about:
        "Body projects you choose for how you look or feel in your body — teeth, hair, skin, grooming, and cosmetic procedures.",
      why: "Body and grooming goals are specific, often clinical or cosmetic, and should not absorb all self-improvement.",
      belongsHere: [
        "Plan Invisalign",
        "Book dermatologist for acne",
        "Complete hair restoration protocol",
      ],
      doesNotBelongHere: [
        "Therapy for body image (→ Mind & Emotions)",
        "Buy dream watch (→ Joy & Creativity)",
        "General fat loss via diet (→ Nutrition)",
      ],
      aiRoutingNote:
        "Route here for intentional body and grooming projects — haircuts, skincare, teeth, cosmetic treatments, dressing, and style when the focus is presentation. The signal is how the user looks or grooms their body. Photo flinching and grooming projects belong here. If the underlying issue is emotional rather than presentation-focused, route to ambiguous[] with both Body & grooming and Mind & Emotions flagged. Do not route general anxiety, values, or hobby goals here.",
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
      coachMarkHubInstruction: "Any body or grooming goals you want to track?",
    },
    "Rest & sleep": {
      about:
        "Sleep and recovery as infrastructure — bedtime routines, sleep quality, naps, burnout recovery, and unstructured downtime that restores you. Not hobbies unless the goal is rest.",
      why: "Rest is the most underrated lever; giving it a hub stops I'm tired from living only as a vague mark.",
      belongsHere: [
        "Fix 10pm wind-down",
        "Block recovery weekend after launch",
        "Address chronic undersleep",
      ],
      doesNotBelongHere: [
        "Meditation for self-understanding (→ Mind & Emotions)",
        "Weekend ski trip (→ Joy & Creativity)",
        "Strength deload week (→ Movement)",
      ],
      aiRoutingNote:
        "Route here for sleep, recovery, downtime, lights-out rules, and deliberate rest — the deliberate practice of resting. Lights-out times, sleep hygiene, naps, recovery days from training all belong here. Not for entertainment as leisure (Joy & Creativity) and not for medical sleep treatments framed primarily as a health condition. If the user names a specific bedtime rule or sleep target, this hub wins.",
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
      coachMarkHubInstruction: "Sleep or recovery something you want to improve?",
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
    becoming:
      "Purpose & values and mind & emotions — personal development that does not belong on Money, Work, Health, People, or Play & Leisure.",
    pleasures:
      "Hobbies, culture, and experiences you protect for joy — leisure that does not belong on Self & Mind, Work, or People.",
    people: "Relationships and the people who shape your story — named connections, not task lists.",
    health: "Physical foundation — movement, fuel, body & grooming, and rest & sleep.",
  };
  const themeLine = byTheme[areaId as LifeAreaId] ?? "this theme";
  const isPeople = areaId === "people";
  const mapItem = isPeople ? "connection" : "pursuit";
  return {
    about: `${label} is a track under ${themeLine}. ${isPeople ? "Connections" : "Pursuits"} and marks you add here stay grouped on the map.`,
    why: "Naming what matters in this part of your life makes it easier to act on and remember.",
    belongsHere: [
      `Add a ${mapItem} that fits ${label}`,
      "Capture a mark when something changes",
      "Review what is active on this hub",
    ],
    doesNotBelongHere: [
      "Items that clearly belong on another hub in this theme",
      "Work that is really about a different part of life",
      isPeople ? "Duplicates of connections already on the map" : "Duplicates of pursuits already on the map",
    ],
    aiRoutingNote: `Route here only when the item clearly fits ${label} under ${themeLine}.`,
    examples: isPeople
      ? ["Add a connection that fits this track", "Capture a mark"]
      : ["Add a pursuit that fits this track", "Capture a mark"],
    openingQuestions: [
      `What's been happening in ${label} lately?`,
      `Is there something in ${label} you've been meaning to work on?`,
      `What would progress look like for you in ${label}?`,
    ],
    firstTimeQuestion: `What's on your mind about ${label} right now?`,
    coachMarkHubInstruction: isPeople
      ? `Anyone in ${label} you want to tend or reconnect with?`
      : `Anything in ${label} you want to build or track?`,
  };
}

/** User-facing map goal label — "connection" on People & Relationships. */
export function hubMapGoalNoun(areaId: string, plural = false): string {
  if (areaId === "people") return plural ? "connections" : "connection";
  return plural ? "pursuits" : "pursuit";
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

/** Parse redirect target hub name from a doesNotBelongHere line, e.g. "(→ Assets & investing)". */
export function parseHubRedirectTarget(line: string): string | null {
  const m = /\(→\s*([^)]+)\)\s*$/.exec(line.trim());
  return m?.[1]?.trim() ?? null;
}
