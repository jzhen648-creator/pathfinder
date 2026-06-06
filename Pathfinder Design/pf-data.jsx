// ─── Pathfinder · data (poster-tree brief) ───────────────────────────
// Persona: Amelia Rhodes, 29, London, partnered. Mid-pivot from tech IC
// toward mortgage broking. Active: Work + Money. Others quieter.

const PF_THEMES = {
  work:     { id:"work",     name:"Work & Career",          short:"Work",     color:"#EF9F27" },
  money:    { id:"money",    name:"Money & Finance",        short:"Money",    color:"#1D9E75" },
  becoming: { id:"becoming", name:"Mind & Spirit",       short:"Mind & Spirit", color:"#7F77DD" },
  people:   { id:"people",   name:"People & Relationships", short:"People",   color:"#D4537E" },
  health:   { id:"health",   name:"Health & Body",          short:"Health",   color:"#D85A30" },
};
const PF_THEME_ORDER = ["work","money","becoming","people","health"];
const PF_ACTIVE_THEMES = ["work","money"];
const PF_MARK = "#c9a227";

// 17 hubs — exact names from spec
const PF_HUBS = [
  // Work · 3 spokes
  { id:"career",  theme:"work",     name:"Career",
    about:"Role, promotion, employer, the direction itself." },
  { id:"skills",  theme:"work",     name:"Skills",
    about:"Learning, credentials, mentors, deliberate practice." },
  { id:"builds",  theme:"work",     name:"Builds & Launches",
    about:"Shipped work, portfolio, launches, deliverables." },
  // Money · 4 fan (earn → grow → protect → owe)
  { id:"income",      theme:"money", name:"Income",
    about:"Where the money comes in." },
  { id:"assets",      theme:"money", name:"Assets",
    about:"What you're growing — savings, investments, ownership." },
  { id:"safetynet",   theme:"money", name:"Safety net",
    about:"The cushion under everything else." },
  { id:"liabilities", theme:"money", name:"Liabilities",
    about:"What's owed, what's outstanding." },
  // Becoming · 3 fan (inner left, purpose centre, joy right)
  { id:"innerlife", theme:"becoming", name:"Inner life",
    about:"The quiet maintenance of self." },
  { id:"purpose",   theme:"becoming", name:"Purpose",
    about:"The thread under everything." },
  { id:"joy",       theme:"becoming", name:"Joy",
    about:"Pleasures, play, what lights you up." },
  // People · 3 spokes
  { id:"family",      theme:"people", name:"Family",
    about:"Origin, kin, the long relationships." },
  { id:"romance",     theme:"people", name:"Romance",
    about:"Partnership, intimacy, the chosen close." },
  { id:"friendships", theme:"people", name:"Friendships",
    about:"Circle, peers, the people you stay current with." },
  // Health · 4 spokes
  { id:"movement",   theme:"health", name:"Movement",
    about:"How the body moves — training, walking, embodiment." },
  { id:"nutrition",  theme:"health", name:"Nutrition",
    about:"What goes in. Cooking, eating, hydration." },
  { id:"appearance", theme:"health", name:"Appearance",
    about:"How you show up — clothes, skin, presence." },
  { id:"rest",       theme:"health", name:"Rest",
    about:"Sleep, recovery, the daily reset." },
];

// Pursuits — ON branch conduits, in sequence (older toward hub, newer outward)
// state: active | onhold | complete
const PF_PURSUITS = [
  // Work · Career
  { id:"senior-ic", hub:"career", state:"active", order:0,
    name:"Become senior IC",
    body:"The thread you've been pulling on for two years. About range, not titles." },
  { id:"rfc",       hub:"career", state:"active", order:1, parent:"senior-ic",
    name:"Lead platform RFC process",
    body:"Concrete way to show the breadth Priya keeps pointing to." },
  // Work · Skills
  { id:"cemap",     hub:"skills", state:"onhold", order:0,
    name:"Complete CeMAP qualification",
    body:"Paused since November. The pivot is real but the studying isn't, yet." },
  // Work · Builds & Launches
  { id:"portfolio", hub:"builds", state:"active", order:0,
    name:"Ship portfolio website v1",
    body:"Small but unblocks both directions — current role and the broker pivot." },

  // Money · Income
  { id:"broker-role", hub:"income", state:"active", order:0,
    name:"Land first mortgage broker role",
    body:"The pivot, named. Three conversations lined up this quarter." },
  // Money · Assets
  { id:"lisa",  hub:"assets", state:"active", order:0,
    name:"Open Lifetime ISA before April",
    body:"£4k window, 25% bonus. Apr 5 deadline. Almost overdue to act." },
  // Money · Safety net
  { id:"emergency", hub:"safetynet", state:"onhold", order:0,
    name:"6-month emergency fund",
    body:"Paused while the pivot is mid-air. Comes back when income steadies." },

  // Becoming · Purpose
  { id:"northstar", hub:"purpose", state:"active", order:0,
    name:"Clarify north star after career pivot",
    body:"Quiet pursuit. Less about deciding, more about listening." },
  // Becoming · Inner life
  { id:"therapy", hub:"innerlife", state:"active", order:0,
    name:"Weekly therapy for anxiety",
    body:"Tuesdays at 6. Six months in. Holding." },

  // People · Family
  { id:"parents", hub:"family", state:"complete", order:0,
    name:"Visit parents monthly",
    body:"Held for the last 5 months running." },

  // Health · Movement
  { id:"halfmar", hub:"movement", state:"active", order:0,
    name:"Half-marathon training block",
    body:"12-week block. Currently week 4. Long runs on Sundays with Theo." },
];

// Milestones (small orbital dots near pursuits)
const PF_MILESTONES = [
  { id:"ms1", pursuit:"senior-ic", name:"Own the inference review",         date:"this cycle", done:false },
  { id:"ms2", pursuit:"rfc",       name:"First draft circulated",            date:"this week",  done:false },
  { id:"ms3", pursuit:"lisa",      name:"Build £10k invested",               date:"by July",    done:false },
  { id:"ms4", pursuit:"lisa",      name:"Fund account by Apr 5",             date:"Apr 5",      done:false },
  { id:"ms5", pursuit:"broker-role", name:"CeMAP exam booked",               date:"May",        done:false },
  { id:"ms6", pursuit:"halfmar",   name:"Long run · 15km",                   date:"week 6",     done:true  },
  { id:"ms7", pursuit:"portfolio", name:"Domain pointed, hosting live",      date:"done",       done:true  },
];

// Marks (amber diamonds ON branch line)
const PF_MARKS = [
  { id:"mk1", hub:"rest",   text:"Started sleep tracking", date:"Mar 18",
    body:"Logged on the Rest branch — first data point in a year." },
  { id:"mk2", hub:"career", text:"Priya hinted at expanded scope", date:"Mon",
    body:"Marked on the Career branch — resurfaces when Senior IC is next opened." },
];

// Ambiguous — dashed diamond, sits between two candidate branches.
// "Less reactive at work" — unclear if Career or Inner life.
const PF_AMBIGUOUS = [
  { id:"amb1", betweenHubs:["career","innerlife"],
    note:"Less reactive at work",
    body:"Unclear yet whether this lives on Career or Inner life. Surfaced from yesterday's session." },
];

// Stream session — sample brain-dump used in Frame C.
const PF_STREAM = `Sunday again. I keep coming back to the pension thing. Open enrolment closes Friday and I've been at 6% since the role started. Twelve feels right — Theo's been on twelve since January and he says it just disappears, you stop seeing it.

The LISA is the louder one but the pension is the one that compounds quietly. Both go on Assets. I want to land them before the broker pivot really lands, while the steady income is still here to anchor it.`;

// One proposal for Frame C (Stream active state)
const PF_PROPOSAL = {
  kind:"pursuit",
  themeId:"money", hub:"assets",
  label:"New pursuit",
  title:"Increase pension to 12%",
  body:"Open enrolment closes Friday. You've held at 6% for the whole role; Theo's been at 12 since January. Land it on Money · Assets, alongside the LISA.",
};

const PF_PERSONA = {
  name:"Amelia Rhodes",
  initial:"A",
  age:29,
  city:"London",
  partner:"Theo",
  status:"Partnered · mid-career pivot",
  bio:"Tech IC, slowly pivoting toward mortgage broking.",
};

Object.assign(window, {
  PF_THEMES, PF_THEME_ORDER, PF_ACTIVE_THEMES, PF_MARK,
  PF_HUBS, PF_PURSUITS, PF_MILESTONES, PF_MARKS, PF_AMBIGUOUS,
  PF_STREAM, PF_PROPOSAL, PF_PERSONA,
});
