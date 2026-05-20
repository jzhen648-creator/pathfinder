import {
  buildAreaForkFromAnchors,
  branchMainPathUntilGlobalT,
  type AreaForkSpec,
  type BranchForkSpec,
} from "@/components/tree/tree-forks";
import {
  buildRenderedBranchMainPath,
  domainClusterHubPointFromCatalog,
  domainClusterGatewaySpreadNormalForForkSpec,
} from "@/components/tree/tree-branch-geometry";
import type { Point } from "@/components/tree/tree-types";
import { resolveOrbitalMilestonesForTreeGoal } from "@/components/tree/milestone-tree-projection";
import type {
  AreaData,
  DomainHubData,
  MomentNode,
  SequencedBranchNode,
  TreeGoalNode,
  TreeMilestoneNode,
} from "@/components/tree/tree-types";
import { PREVIEW_PENDING_NODE_ID, type PreviewNode } from "@/contexts/stream-preview-context";
import type {
  ExtractedMark,
  ExtractedMilestone,
  ExtractedPursuit,
  StreamBloomStatus,
} from "@/types/stream";

export type PreviewTreeGoalNode = TreeGoalNode & { isPreview?: boolean };
export type PreviewMomentNode = MomentNode & { isPreview?: boolean };

export type PreviewHubGeometry = {
  branchSpec: BranchForkSpec;
  catalogPath: string;
  threadMainDraw: string;
  threadCatalogFull: string;
  momentChordTEnd: number;
  /** Tree-space hub anchor (same as main {@link TreeSVG}). */
  domainHubPt: Point;
  dcGatewaySpreadNormal?: Point;
  threadIndexAlongLimb: number;
  branchCountOnLimb: number;
  nextGoalSlotT: number;
};

/** Shift tree coordinates so the hub sits at the origin for preview framing. */
export function previewPointHubLocal(p: Point, hub: Point): Point {
  return { x: p.x - hub.x, y: p.y - hub.y };
}

export type PreviewHubBundle = {
  area: AreaData;
  thread: DomainHubData;
  geometry: PreviewHubGeometry;
  previewIds: Set<string>;
};

export type ApprovedStreamItems = {
  marks: ExtractedMark[];
  pursuits: ExtractedPursuit[];
  milestones: ExtractedMilestone[];
};

export const PREVIEW_ID_PREFIX = "stream-preview-";
export const PREVIEW_BOUNDS_PAD_PX = 60;

function resolveThreadBranchFork(
  areaId: string,
  area: AreaData,
  threadId: string,
): {
  branchSpec: BranchForkSpec;
  threadIndex: number;
  branchCount: number;
  areaFork: AreaForkSpec;
} {
  const areaFork = buildAreaForkFromAnchors(areaId, area);
  const branchCount = Math.max(1, area.branches.length);
  const threadIndex = Math.max(0, area.branches.findIndex((b) => b.id === threadId));
  const branchSpec = areaFork.branches[threadIndex] ?? areaFork.branches[0];
  if (!branchSpec) {
    throw new Error(`No branch fork for thread ${threadId} on area ${areaId}`);
  }
  return { branchSpec, threadIndex, branchCount, areaFork };
}

function previewPursuitId(clientKey: string): string {
  return `${PREVIEW_ID_PREFIX}pursuit-${clientKey}`;
}

function previewMarkId(index: number, title: string): string {
  return `${PREVIEW_ID_PREFIX}mark-${index}-${title.slice(0, 12).replace(/\s+/g, "-")}`;
}

function previewMilestoneId(index: number, title: string): string {
  return `${PREVIEW_ID_PREFIX}ms-${index}-${title.slice(0, 12).replace(/\s+/g, "-")}`;
}

function cloneGoalNode(g: TreeGoalNode): PreviewTreeGoalNode {
  return {
    ...g,
    milestones: g.milestones.map((m) => ({ ...m, subtasks: m.subtasks.map((s) => ({ ...s })) })),
    orbitalMilestones: g.orbitalMilestones.map((o) => ({ ...o })),
    childGoals: g.childGoals.map((c) => cloneGoalNode(c)),
  };
}

function cloneThread(thread: DomainHubData): DomainHubData {
  return {
    ...thread,
    moments: thread.moments.map((m) => ({ ...m })),
    goals: thread.goals.map((g) => cloneGoalNode(g)),
    sequencedNodes: thread.sequencedNodes.map((n) =>
      n.kind === "goal"
        ? { ...n, goal: cloneGoalNode(n.goal) }
        : { ...n, moment: { ...n.moment } },
    ),
  };
}

function parseMarkDate(date: string | null): { year: number | null; calendarDateIso: string | null } {
  if (!date?.trim()) return { year: null, calendarDateIso: null };
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return { year: null, calendarDateIso: null };
  const calendarDateIso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { year: d.getUTCFullYear(), calendarDateIso };
}

function streamBloomToGoalStatus(status: StreamBloomStatus): TreeGoalNode["bloomStatus"] {
  return status;
}

function extractedPursuitToGoalNode(
  p: ExtractedPursuit,
  branchId: string,
  parentGoalId: string | null,
): PreviewTreeGoalNode {
  const id = p.clientKey ? previewPursuitId(p.clientKey) : `${PREVIEW_ID_PREFIX}pursuit-${p.title}`;
  return {
    id,
    branchId,
    title: p.title,
    shortLabel: null,
    description: null,
    year: null,
    createdAtIso: null,
    timelineStartIso: null,
    deadlineIso: null,
    bloomStatus: streamBloomToGoalStatus(p.bloomStatus),
    positionAngle: null,
    parentGoalId,
    forkedGoalIds: [],
    milestones: [],
    orbitalMilestones: [],
    significanceTier: null,
    childGoals: [],
    isPreview: true,
  };
}

function extractedMarkToMoment(
  m: ExtractedMark,
  branchId: string,
  index: number,
  idOverride?: string,
): PreviewMomentNode {
  const { year, calendarDateIso } = parseMarkDate(m.date);
  return {
    id: idOverride ?? previewMarkId(index, m.title),
    branchId,
    label: m.title,
    description: null,
    year,
    significance: 1,
    bloomStatus: "ACTIVE",
    isTurningPoint: false,
    future: false,
    value: null,
    type: "mark",
    calendarDateIso,
    isPreview: true,
  };
}

function refreshOrbitalMilestones(goal: PreviewTreeGoalNode): void {
  goal.orbitalMilestones = resolveOrbitalMilestonesForTreeGoal({
    relationalMilestones: goal.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      position: m.position,
      completedAt: m.completedAt ?? null,
      subtasks: m.subtasks.map((s) => ({ isCompleted: s.isCompleted, title: s.title })),
    })),
  });
}

function findGoalById(goals: PreviewTreeGoalNode[], id: string): PreviewTreeGoalNode | null {
  for (const g of goals) {
    if (g.id === id) return g;
    const inChild = findGoalById(g.childGoals as PreviewTreeGoalNode[], id);
    if (inChild) return inChild;
  }
  return null;
}

function resolvePursuitRefId(
  ref: { kind: "existing"; goalId: string } | { kind: "new"; clientKey: string },
  clientKeyToId: Map<string, string>,
  goals: PreviewTreeGoalNode[],
): string | null {
  if (ref.kind === "existing") {
    return findGoalById(goals, ref.goalId)?.id ?? ref.goalId;
  }
  return clientKeyToId.get(ref.clientKey) ?? null;
}

function attachChild(parent: PreviewTreeGoalNode, child: PreviewTreeGoalNode): void {
  child.parentGoalId = parent.id;
  parent.childGoals.push(child);
}

type SequencedSortInput = {
  sequencePosition: number | null;
  year: number | null;
  month: number | null;
  createdAtMs: number;
};

function compareSequencedNodes(a: SequencedSortInput, b: SequencedSortInput): number {
  const ap = a.sequencePosition;
  const bp = b.sequencePosition;
  if (ap != null && bp != null && ap !== bp) return ap - bp;
  if (ap != null && bp == null) return -1;
  if (ap == null && bp != null) return 1;
  const ay = a.year ?? -1;
  const by = b.year ?? -1;
  if (ay !== by) return ay - by;
  const am = a.month ?? 0;
  const bm = b.month ?? 0;
  if (am !== bm) return am - bm;
  return a.createdAtMs - b.createdAtMs;
}

function rebuildSequencedNodes(thread: DomainHubData, branchId: string): SequencedBranchNode[] {
  const rootGoals = thread.goals.filter((g) => !g.parentGoalId);
  const entries: { sortInput: SequencedSortInput; entry: SequencedBranchNode }[] = [];

  rootGoals.forEach((goal, i) => {
    entries.push({
      sortInput: { sequencePosition: i, year: goal.year ?? null, month: null, createdAtMs: 0 },
      entry: {
        kind: "goal",
        id: goal.id,
        sequencePosition: i,
        goal,
      },
    });
  });

  thread.moments
    .filter((m) => m.synthetic !== true)
    .forEach((moment, i) => {
      const date = moment.calendarDateIso ? new Date(moment.calendarDateIso) : null;
      entries.push({
        sortInput: {
          sequencePosition: rootGoals.length + i,
          year: moment.year ?? null,
          month: date ? date.getMonth() + 1 : null,
          createdAtMs: date ? date.getTime() : 0,
        },
        entry: {
          kind: "moment",
          id: moment.id,
          sequencePosition: rootGoals.length + i,
          moment,
        },
      });
    });

  entries.sort((a, b) => compareSequencedNodes(a.sortInput, b.sortInput));
  return entries.map((e) => e.entry);
}

/**
 * Hub geometry using the same fork catalog, hub anchor, and branch stroke as {@link TreeSVG}.
 * Coordinates are tree-space; apply {@link previewPointHubLocal} when framing the preview SVG.
 */
export function buildPreviewHubGeometry(areaId: string, thread: DomainHubData, area: AreaData): PreviewHubGeometry {
  const { branchSpec, threadIndex, branchCount, areaFork } = resolveThreadBranchFork(
    areaId,
    area,
    thread.id,
  );
  const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(areaFork);
  const catalogPath = branchMainPathUntilGlobalT(branchSpec, 1);
  const catalogFullPath = catalogPath;

  const domainHubPt = domainClusterHubPointFromCatalog(
    catalogFullPath,
    threadIndex,
    branchCount,
    dcGatewaySpreadNormal,
    areaId,
    undefined,
    undefined,
    thread.id,
  );

  const { strokePath, nextGoalSlotT, momentChordTEnd } = buildRenderedBranchMainPath(
    areaId,
    threadIndex,
    thread,
    catalogPath,
    branchSpec,
    undefined,
    threadIndex,
    branchCount,
    dcGatewaySpreadNormal,
    undefined,
    thread.id,
  );

  return {
    branchSpec,
    catalogPath,
    threadMainDraw: strokePath,
    threadCatalogFull: catalogFullPath,
    momentChordTEnd,
    domainHubPt,
    dcGatewaySpreadNormal,
    threadIndexAlongLimb: threadIndex,
    branchCountOnLimb: branchCount,
    nextGoalSlotT,
  };
}

export function mergePreviewItemsIntoHub(
  existingThread: DomainHubData,
  approved: ApprovedStreamItems,
  area: Pick<AreaData, "id" | "label" | "color">,
  sourceNodes: PreviewNode[] = [],
): PreviewHubBundle {
  const thread = cloneThread(existingThread);
  const previewIds = new Set<string>();
  const clientKeyToId = new Map<string, string>();

  for (const p of approved.pursuits) {
    if (p.clientKey) clientKeyToId.set(p.clientKey, previewPursuitId(p.clientKey));
  }

  const pursuitSourceNodes = sourceNodes.filter((n) => n.kind === "pursuit");
  let pursuitSourceIdx = 0;

  for (const p of approved.pursuits) {
    if (p.existingGoalId) {
      const existing = findGoalById(thread.goals as PreviewTreeGoalNode[], p.existingGoalId);
      if (existing) {
        existing.bloomStatus = streamBloomToGoalStatus(p.bloomStatus);
      }
      pursuitSourceIdx += 1;
      continue;
    }

    let parentGoalId: string | null = null;
    if (p.parentRef) {
      parentGoalId = resolvePursuitRefId(p.parentRef, clientKeyToId, thread.goals as PreviewTreeGoalNode[]);
    }

    const node = extractedPursuitToGoalNode(p, thread.id, parentGoalId);
    const src = pursuitSourceNodes[pursuitSourceIdx];
    pursuitSourceIdx += 1;
    if (src?.id === PREVIEW_PENDING_NODE_ID) {
      node.id = PREVIEW_PENDING_NODE_ID;
    }
    if (p.clientKey) clientKeyToId.set(p.clientKey, node.id);
    previewIds.add(node.id);

    if (parentGoalId) {
      const parent = findGoalById(thread.goals as PreviewTreeGoalNode[], parentGoalId);
      if (parent) attachChild(parent, node);
      else thread.goals.push(node);
    } else {
      thread.goals.push(node);
    }
  }

  const hasRealMarks = thread.moments.some((m) => m.synthetic !== true);
  if (hasRealMarks) {
    thread.moments = thread.moments.filter((m) => m.synthetic !== true);
  }

  const markSourceNodes = sourceNodes.filter((n) => n.kind === "mark");
  approved.marks.forEach((m, i) => {
    const src = markSourceNodes[i];
    const momentId = src?.id === PREVIEW_PENDING_NODE_ID ? PREVIEW_PENDING_NODE_ID : undefined;
    const moment = extractedMarkToMoment(m, thread.id, i, momentId);
    previewIds.add(moment.id);
    thread.moments.push(moment);
  });

  const milestoneSourceNodes = sourceNodes.filter((n) => n.kind === "milestone");
  approved.milestones.forEach((ms, i) => {
    const pursuitId = resolvePursuitRefId(ms.pursuitRef, clientKeyToId, thread.goals as PreviewTreeGoalNode[]);
    if (!pursuitId) return;
    const goal = findGoalById(thread.goals as PreviewTreeGoalNode[], pursuitId);
    if (!goal) return;

    const src = milestoneSourceNodes[i];
    const milestone: TreeMilestoneNode = {
      id: src?.id === PREVIEW_PENDING_NODE_ID ? PREVIEW_PENDING_NODE_ID : previewMilestoneId(i, ms.title),
      title: ms.title,
      position: goal.milestones.length,
      completedAt: null,
      subtasks: [],
    };
    previewIds.add(milestone.id);
    goal.milestones.push(milestone);
    refreshOrbitalMilestones(goal);
  });

  thread.sequencedNodes = rebuildSequencedNodes(thread, thread.id);

  const areaData: AreaData = {
    id: area.id,
    label: area.label,
    color: area.color,
    summary: null,
    branches: [thread],
  };
  const geometry = buildPreviewHubGeometry(area.id, thread, areaData);

  return { area: areaData, thread, geometry, previewIds };
}

/** Dev / test: hub with committed goals/marks plus room for Stream preview items. */
export function createDevPreviewBaseThread(opts: {
  branchId: string;
  hubLabel: string;
  existingGoals?: PreviewTreeGoalNode[];
  existingMoments?: PreviewMomentNode[];
}): DomainHubData {
  const goals: PreviewTreeGoalNode[] = opts.existingGoals ?? [
    {
      id: "dev-existing-linkedin",
      branchId: opts.branchId,
      title: "Update LinkedIn",
      shortLabel: null,
      description: null,
      year: null,
      createdAtIso: null,
      timelineStartIso: null,
      deadlineIso: null,
      bloomStatus: "ACTIVE",
      positionAngle: null,
      parentGoalId: null,
      forkedGoalIds: [],
      milestones: [],
      orbitalMilestones: [],
      significanceTier: null,
      childGoals: [],
      isPreview: false,
    },
  ];

  const thread: DomainHubData = {
    id: opts.branchId,
    type: opts.hubLabel,
    moments: opts.existingMoments?.map((m) => ({ ...m })) ?? [],
    goals,
    sequencedNodes: [],
  };
  thread.sequencedNodes = rebuildSequencedNodes(thread, opts.branchId);
  return thread;
}

export function isPreviewNodeId(id: string, previewIds: Set<string>): boolean {
  return previewIds.has(id) || id.startsWith(PREVIEW_ID_PREFIX);
}

function isPreviewTreeNode(node: { id: string; isPreview?: boolean }): boolean {
  return node.isPreview === true || node.id.startsWith(PREVIEW_ID_PREFIX);
}

function clientKeyFromPreviewPursuitId(id: string): string | null {
  const prefix = `${PREVIEW_ID_PREFIX}pursuit-`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

export function previewNodesToApprovedItems(nodes: PreviewNode[]): ApprovedStreamItems {
  const marks: ExtractedMark[] = [];
  const pursuits: ExtractedPursuit[] = [];
  const milestones: ExtractedMilestone[] = [];

  for (const n of nodes) {
    if (n.kind === "mark") {
      marks.push({
        title: n.title,
        date: n.date ?? null,
      });
      continue;
    }
    if (n.kind === "pursuit") {
      const pursuit: ExtractedPursuit = {
        title: n.title,
        goalType: (n.goalType as ExtractedPursuit["goalType"]) ?? "project",
        bloomStatus: (n.bloomStatus as StreamBloomStatus) ?? "ACTIVE",
      };
      if (n.clientKey) pursuit.clientKey = n.clientKey;
      if (n.parentId) {
        const parentKey = clientKeyFromPreviewPursuitId(n.parentId);
        if (parentKey) {
          pursuit.parentRef = { kind: "new", clientKey: parentKey };
        } else {
          pursuit.parentRef = { kind: "existing", goalId: n.parentId };
        }
      }
      pursuits.push(pursuit);
      continue;
    }
    if (n.kind === "milestone") {
      if (!n.pursuitClientId) continue;
      const clientKey = clientKeyFromPreviewPursuitId(n.pursuitClientId);
      if (clientKey) {
        milestones.push({
          title: n.title,
          pursuitRef: { kind: "new", clientKey },
        });
      } else if (!n.pursuitClientId.startsWith(PREVIEW_ID_PREFIX)) {
        milestones.push({
          title: n.title,
          pursuitRef: { kind: "existing", goalId: n.pursuitClientId },
        });
      }
    }
  }

  return { marks, pursuits, milestones };
}

function cloneAreaForPreview(area: AreaData): AreaData {
  return {
    ...area,
    branches: area.branches.map((b) => cloneThread(b)),
  };
}

/**
 * Deep-cloned areas with Stream preview nodes merged per hub — never mutates `sourceAreas`.
 */
export function buildPreviewAreasFromNodes(
  sourceAreas: AreaData[],
  previewNodes: PreviewNode[],
): AreaData[] {
  if (previewNodes.length === 0) return [];

  const byHub = new Map<string, PreviewNode[]>();
  for (const n of previewNodes) {
    const list = byHub.get(n.hubId) ?? [];
    list.push(n);
    byHub.set(n.hubId, list);
  }

  const out: AreaData[] = [];

  for (const [hubId, nodes] of byHub) {
    const areaId = nodes[0]!.areaId;
    const sourceArea = sourceAreas.find((a) => a.id === areaId);
    if (!sourceArea) continue;
    const sourceThread = sourceArea.branches.find((b) => b.id === hubId);
    if (!sourceThread) continue;

    const approved = previewNodesToApprovedItems(nodes);
    const { thread: mergedThread } = mergePreviewItemsIntoHub(
      sourceThread,
      approved,
      {
        id: sourceArea.id,
        label: sourceArea.label,
        color: sourceArea.color,
      },
      nodes,
    );

    const cloned = cloneAreaForPreview(sourceArea);
    cloned.branches = cloned.branches.map((b) => (b.id === hubId ? mergedThread : b));
    out.push(cloned);
  }

  return out;
}

export function isPreviewTreeGoal(goal: TreeGoalNode): goal is PreviewTreeGoalNode {
  return isPreviewTreeNode(goal);
}

export function isPreviewMoment(moment: MomentNode): moment is PreviewMomentNode {
  return isPreviewTreeNode(moment);
}
