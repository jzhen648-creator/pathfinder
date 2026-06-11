/**
 * Seed Nelson Mandela QA persona — isolated from other dev/test accounts.
 * Run: npm run seed:mandela
 */
import { BloomStatus, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureTaxonomyCurrent } from "../src/lib/hub-taxonomy-sync";

const prisma = new PrismaClient();

const EMAIL = "nelson.mandela@pathfinder.test";
const PASSWORD = "password123";

const HUBS = [
  { limbId: "work", label: "Career", name: "Career", createdAt: new Date("1941-01-01") },
  { limbId: "work", label: "Builds & Launches", name: "Builds & Launches", createdAt: new Date("1952-01-01") },
  { limbId: "becoming", label: "Purpose & Values", name: "Purpose & Values", createdAt: new Date("1944-01-01") },
  { limbId: "becoming", label: "Mind & Emotions", name: "Mind & Emotions", createdAt: new Date("1964-06-12") },
  { limbId: "people", label: "Family", name: "Family", createdAt: new Date("1918-07-18") },
  { limbId: "people", label: "Friendships", name: "Friendships", createdAt: new Date("1952-01-01") },
] as const;

const LIFE_AREA_BY_LIMB: Record<string, string> = {
  work: "Work & Career",
  becoming: "Self & Mind",
  people: "People & Relationships",
};

type HubLabel = (typeof HUBS)[number]["label"];

type MilestoneSeed = {
  title: string;
  description: string;
  completedAt: Date | null;
};

type GoalSeed = {
  key: string;
  hub: HubLabel;
  limbId: string;
  title: string;
  description: string;
  goalType: string;
  status: BloomStatus;
  year: number;
  shortLabel?: string;
  parentKey?: string;
  milestones: MilestoneSeed[];
};

type MarkSeed = {
  hub: HubLabel;
  limbId: string;
  title: string;
  date: Date;
};

function milestone(title: string, date: string | null, description = title): MilestoneSeed {
  return {
    title,
    description,
    completedAt: date ? new Date(date) : null,
  };
}

const GOALS: GoalSeed[] = [
  {
    key: "defiance-campaign",
    hub: "Career",
    limbId: "work",
    title: "Build disciplined national resistance through the Defiance Campaign",
    description:
      "Organise legal, public, and civic pressure into a disciplined movement capable of challenging apartheid at national scale.",
    goalType: "project",
    status: "COMPLETE",
    year: 1952,
    shortLabel: "Defiance Campaign",
    milestones: [
      milestone("Join the ANC Youth League", "1944-09-10", "Commit to organised political leadership through the Youth League."),
      milestone("Help shape the Programme of Action", "1949-12-17", "Move the movement toward mass mobilisation and disciplined civil resistance."),
      milestone("Open Mandela and Tambo law office", "1952-08-01", "Create legal support for Black South Africans facing state repression."),
      milestone("Coordinate national volunteer mobilisation", "1952-10-01", "Recruit and prepare volunteers for non-violent defiance."),
      milestone("Face banning orders after the campaign", "1952-12-31", "Absorb state pressure while keeping the work alive."),
      milestone("Translate campaign lessons into durable organisation", "1953-06-01", "Turn mobilisation lessons into longer-term leadership practice."),
    ],
  },
  {
    key: "freedom-charter",
    hub: "Purpose & Values",
    limbId: "becoming",
    title: "Anchor the liberation movement around a democratic Freedom Charter",
    description:
      "Help turn scattered grievances into a shared constitutional vision for a non-racial and democratic South Africa.",
    goalType: "identity",
    status: "COMPLETE",
    year: 1955,
    shortLabel: "Freedom Charter",
    milestones: [
      milestone("Gather community demands across the country", "1954-09-01", "Listen widely before drafting a shared vision."),
      milestone("Convene the Congress of the People", "1955-06-25", "Bring allied movements together around a democratic programme."),
      milestone("Adopt the Freedom Charter", "1955-06-26", "Commit publicly to a South Africa belonging to all who live in it."),
      milestone("Defend the charter through the Treason Trial", "1956-12-05", "Sustain the vision under direct prosecution."),
      milestone("Deepen non-racial alliance work", "1958-08-01", "Build practical trust across political and racial lines."),
      milestone("Carry charter principles into later negotiations", "1990-02-11", "Reconnect release-era strategy to the long-standing democratic vision."),
    ],
  },
  {
    key: "robin-island",
    hub: "Mind & Emotions",
    limbId: "becoming",
    title: "Preserve dignity, discipline, and political clarity through imprisonment",
    description:
      "Use confinement as a long school of self-command, collective morale, and strategic preparation for eventual negotiations.",
    goalType: "identity",
    status: "COMPLETE",
    year: 1964,
    shortLabel: "Robben Island",
    milestones: [
      milestone("Deliver the Rivonia statement from the dock", "1964-04-20", "State the democratic ideal clearly before sentencing."),
      milestone("Accept life sentence without surrendering purpose", "1964-06-12", "Absorb the sentence while preserving political commitment."),
      milestone("Build study and debate routines with fellow prisoners", "1966-01-15", "Turn prison life into disciplined intellectual community."),
      milestone("Maintain family correspondence under censorship", "1968-07-01", "Keep personal ties alive despite severe restrictions."),
      milestone("Mentor younger prisoners arriving on the island", "1976-08-01", "Translate experience into steadiness for a new generation."),
      milestone("Open careful channels with state representatives", "1985-07-01", "Begin testing whether principled negotiation is possible."),
      milestone("Move from Robben Island to Pollsmoor", "1982-03-31", "Enter a new phase of confinement and strategic contact."),
      milestone("Prepare emotionally for release without bitterness", "1989-12-01", "Leave prison ready to lead rather than retaliate."),
    ],
  },
  {
    key: "negotiated-transition",
    hub: "Career",
    limbId: "work",
    title: "Negotiate the transition from apartheid to constitutional democracy",
    description:
      "Move from prisoner and banned leader to national negotiator while holding together principle, pressure, and compromise.",
    goalType: "project",
    status: "COMPLETE",
    year: 1994,
    shortLabel: "Transition",
    parentKey: "defiance-campaign",
    milestones: [
      milestone("Walk free from Victor Verster Prison", "1990-02-11", "Re-enter public life with a call for disciplined peace."),
      milestone("Lead the ANC through unbanning and rebuilding", "1990-08-01", "Restore public structures after decades of illegality."),
      milestone("Suspend armed struggle after negotiation progress", "1990-08-06", "Signal a serious transition toward political settlement."),
      milestone("Navigate violence and breakdowns in CODESA", "1992-06-17", "Keep negotiations viable through crisis."),
      milestone("Agree an interim constitution", "1993-11-18", "Lock in the legal bridge to democratic elections."),
      milestone("Vote in South Africa's first democratic election", "1994-04-27", "Complete the passage from exclusion to democratic participation."),
    ],
  },
  {
    key: "presidency",
    hub: "Career",
    limbId: "work",
    title: "Lead the first democratic presidency with reconciliation and institution-building",
    description:
      "Use the presidency to stabilise democracy, legitimise new institutions, and model restraint after victory.",
    goalType: "project",
    status: "COMPLETE",
    year: 1995,
    shortLabel: "Presidency",
    parentKey: "negotiated-transition",
    milestones: [
      milestone("Take office as president", "1994-05-10", "Begin the first democratic administration."),
      milestone("Form a government of national unity", "1994-05-11", "Share power to stabilise the transition."),
      milestone("Launch the Reconstruction and Development Programme", "1994-09-01", "Connect democracy to material repair."),
      milestone("Support the Truth and Reconciliation Commission", "1995-12-01", "Create a national process for truth, accountability, and healing."),
      milestone("Use the Rugby World Cup as reconciliation symbol", "1995-06-24", "Turn a divided sporting symbol into shared national theatre."),
      milestone("Sign the final constitution", "1996-12-10", "Entrench democratic rights in the country's highest law."),
    ],
  },
  {
    key: "global-eldership",
    hub: "Career",
    limbId: "work",
    title: "Continue elder statesmanship through global advocacy networks",
    description:
      "After office, lend moral authority to peace, public health, and democratic causes without clinging to formal power.",
    goalType: "project",
    status: "ACTIVE",
    year: 2007,
    shortLabel: "Eldership",
    parentKey: "presidency",
    milestones: [
      milestone("Step down after one presidential term", "1999-06-14", "Model democratic succession and restraint."),
      milestone("Launch the Nelson Mandela Foundation", "1999-08-19", "Create a home for memory, dialogue, and civic work."),
      milestone("Speak publicly about HIV/AIDS stigma", "2000-07-14", "Use personal authority to confront silence and shame."),
      milestone("Establish the 46664 campaign", "2003-11-29", "Mobilise global attention against HIV/AIDS."),
      milestone("Convene The Elders", "2007-07-18", "Gather independent leaders for peace and human rights work."),
      milestone("Support conflict mediation and democratic norms", null, "Continue lending authority to peace efforts where useful."),
    ],
  },
  {
    key: "family-repair",
    hub: "Family",
    limbId: "people",
    title: "Repair and protect family bonds after decades of sacrifice",
    description:
      "Hold the private cost of public leadership with honesty while rebuilding presence across children, grandchildren, and kin.",
    goalType: "relationship",
    status: "PAUSED",
    year: 1998,
    shortLabel: "Family bonds",
    milestones: [
      milestone("Acknowledge the family cost of imprisonment", "1990-03-01", "Name the personal losses that came with public struggle."),
      milestone("Reconnect with children and grandchildren", "1994-12-01", "Rebuild presence after decades of forced absence."),
      milestone("Protect family privacy during presidency", "1995-06-01", "Balance public duty with private boundaries."),
      milestone("Navigate separation and divorce with Winnie", "1996-03-19", "Face personal rupture in public life."),
      milestone("Marry Graca Machel", "1998-07-18", "Begin a late-life partnership rooted in shared public service."),
      milestone("Sustain family rituals after retirement", null, "Keep rebuilding ordinary family presence where possible."),
    ],
  },
  {
    key: "dialogue-centre",
    hub: "Builds & Launches",
    limbId: "work",
    title: "Build institutions that preserve memory and convene difficult dialogue",
    description:
      "Turn personal legacy into durable civic infrastructure for archives, dialogue, education, and democratic culture.",
    goalType: "project",
    status: "ACTIVE",
    year: 2004,
    shortLabel: "Dialogue centre",
    milestones: [
      milestone("Formalise archive and memory work", "1999-08-19", "Start preserving records and public memory in institutional form."),
      milestone("Open dialogue programmes on social cohesion", "2004-05-01", "Use legacy as a convening force for difficult questions."),
      milestone("Support education through the Mandela Rhodes Foundation", "2003-02-01", "Invest in future African leadership."),
      milestone("Establish Mandela Day as a service ritual", "2009-07-18", "Translate admiration into public service."),
      milestone("Digitise key archive materials", null, "Make memory work more accessible to future generations."),
      milestone("Keep dialogue independent of party politics", null, "Protect the institution as a democratic public good."),
    ],
  },
];

const MARKS: MarkSeed[] = [
  { hub: "Family", limbId: "people", title: "Born in Mvezo in the Thembu royal lineage", date: new Date("1918-07-18") },
  { hub: "Purpose & Values", limbId: "becoming", title: "Arrived in Johannesburg and encountered urban political life", date: new Date("1941-04-01") },
  { hub: "Career", limbId: "work", title: "Joined the African National Congress", date: new Date("1943-08-01") },
  { hub: "Friendships", limbId: "people", title: "Built organising partnership with Oliver Tambo and Walter Sisulu", date: new Date("1944-09-10") },
  { hub: "Builds & Launches", limbId: "work", title: "Opened Mandela and Tambo law practice", date: new Date("1952-08-01") },
  { hub: "Purpose & Values", limbId: "becoming", title: "Freedom Charter adopted at Kliptown", date: new Date("1955-06-26") },
  { hub: "Mind & Emotions", limbId: "becoming", title: "Sentenced to life imprisonment after Rivonia", date: new Date("1964-06-12") },
  { hub: "Mind & Emotions", limbId: "becoming", title: "Transferred from Robben Island to Pollsmoor Prison", date: new Date("1982-03-31") },
  { hub: "Career", limbId: "work", title: "Released from prison after 27 years", date: new Date("1990-02-11") },
  { hub: "Career", limbId: "work", title: "Elected president in South Africa's first democratic election", date: new Date("1994-05-10") },
  { hub: "Builds & Launches", limbId: "work", title: "Signed the final constitution", date: new Date("1996-12-10") },
  { hub: "Friendships", limbId: "people", title: "Launched The Elders with global peers", date: new Date("2007-07-18") },
];

async function resolveHub(userId: string, limbId: string, label: HubLabel) {
  const branch = await prisma.themeCategory.findFirst({
    where: { userId, limbId, isSystemCategory: true, label },
    select: { id: true },
  });
  if (!branch) {
    throw new Error(`Missing hub ${limbId}/${label} for ${EMAIL}`);
  }
  return branch;
}

async function main() {
  console.log(`Seeding Nelson Mandela QA persona: ${EMAIL}`);

  await prisma.user.deleteMany({ where: { email: EMAIL } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Nelson Mandela",
      passwordHash,
      birthYear: 1918,
      birthPlace: "Mvezo, South Africa",
      onboardingCompleted: true,
      firstRunCompleted: true,
    },
    select: { id: true },
  });

  await prisma.themeCategory.createMany({
    data: HUBS.map((hub, order) => ({
      userId: user.id,
      limbId: hub.limbId,
      label: hub.label,
      name: hub.name,
      status: "active",
      status: "ACTIVE",
      isSystemCategory: true,
      isActive: true,
      order,
      createdAt: hub.createdAt,
    })),
  });

  const branches = new Map<string, string>();
  for (const hub of HUBS) {
    const branch = await resolveHub(user.id, hub.limbId, hub.label);
    branches.set(`${hub.limbId}:${hub.label}`, branch.id);
  }

  await prisma.mark.createMany({
    data: MARKS.map((mark, index) => ({
      userId: user.id,
      categoryId: branches.get(`${mark.limbId}:${mark.hub}`)!,
      limbId: mark.limbId,
      title: mark.title,
      date: mark.date,
      year: mark.date.getUTCFullYear(),
      month: mark.date.getUTCMonth() + 1,
      sequencePosition: index,
    })),
  });

  const createdGoals = new Map<string, { id: string; title: string; parentGoalId: string | null }>();
  for (const goal of GOALS) {
    const parentGoalId = goal.parentKey ? createdGoals.get(goal.parentKey)?.id : null;
    if (goal.parentKey && !parentGoalId) {
      throw new Error(`Missing parent goal ${goal.parentKey} for ${goal.key}`);
    }

    const created = await prisma.goal.create({
      data: {
        userId: user.id,
        categoryId: branches.get(`${goal.limbId}:${goal.hub}`)!,
        limbId: goal.limbId,
        parentGoalId,
        title: goal.title,
        shortLabel: goal.shortLabel,
        description: goal.description,
        lifeArea: LIFE_AREA_BY_LIMB[goal.limbId] ?? "Other",
        goalType: goal.goalType,
        status: goal.status,
        year: goal.year,
        aiGenerated: false,
        significance: 3,
        sequencePosition: parentGoalId ? null : GOALS.findIndex((item) => item.key === goal.key),
        milestones: {
          createMany: {
            data: goal.milestones.map((item, position) => ({
              title: item.title,
              description: item.description,
              position,
              completedAt: item.completedAt,
            })),
          },
        },
      },
      select: { id: true, title: true, parentGoalId: true },
    });

    createdGoals.set(goal.key, created);
  }

  const [totalGoals, totalMarks, milestoneRichGoals, continuationChildren] = await Promise.all([
    prisma.goal.count({ where: { userId: user.id } }),
    prisma.mark.count({ where: { userId: user.id } }),
    prisma.goal.findMany({
      where: {
        userId: user.id,
        milestones: { some: {} },
      },
      select: {
        id: true,
        title: true,
        _count: { select: { milestones: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goal.findMany({
      where: { userId: user.id, parentGoalId: { not: null } },
      select: { id: true, title: true, parentGoalId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const goalsWithSixPlus = milestoneRichGoals.filter((goal) => goal._count.milestones >= 6);
  const chain = ["defiance-campaign", "negotiated-transition", "presidency", "global-eldership"]
    .map((key) => createdGoals.get(key))
    .filter((goal): goal is { id: string; title: string; parentGoalId: string | null } => Boolean(goal));

  console.log(`\nDone. Login: ${EMAIL} / ${PASSWORD}`);
  console.log(`Total goals seeded: ${totalGoals}`);
  console.log(`Total marks seeded: ${totalMarks}`);
  console.log("Goals with 6+ milestones:");
  for (const goal of goalsWithSixPlus) {
    console.log(`  - ${goal.title}: ${goal._count.milestones}`);
  }
  console.log("Continuation children:");
  for (const goal of continuationChildren) {
    console.log(`  - ${goal.title}: parentGoalId=${goal.parentGoalId} -> id=${goal.id}`);
  }
  console.log("Primary continuation chain:");
  for (const goal of chain) {
    console.log(`  - ${goal.title}: parentGoalId=${goal.parentGoalId ?? "null"} -> id=${goal.id}`);
  }

  await ensureTaxonomyCurrent(prisma, user.id);
  console.log("Hub taxonomy stamped for fast theme-unlock E2E.");
}

main()
  .catch((error) => {
    console.error("Mandela seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
