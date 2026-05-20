// ─── Pathfinder · trunk poster ───────────────────────────────────────
// Trunk-first life map. Vertical organic trunk; Becoming at crown;
// Work + Money emerge LEFT; People + Health emerge RIGHT.
// Hubs cluster locally around their gateway (NOT on long rails).
// Goals orbit hubs. Moments are subtle ticks along conduits.

// ─── Geometry helpers ────────────────────────────────────────────────
function tpAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function tpScale(v, s) { return { x: v.x * s, y: v.y * s }; }
function tpNorm(v) {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}
function tpRotate(v, deg) {
  const r = deg * Math.PI / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r),
           y: v.x * Math.sin(r) + v.y * Math.cos(r) };
}

// Trunk: gentle vertical S-curve, asymmetric
const PF_TRUNK = {
  top:    { x: 720, y: 200 },
  ctrl1:  { x: 760, y: 380 },
  ctrl2:  { x: 690, y: 580 },
  bottom: { x: 720, y: 830 },
};
const PF_TRUNK_PATH = `M ${PF_TRUNK.bottom.x} ${PF_TRUNK.bottom.y} C ${PF_TRUNK.ctrl2.x} ${PF_TRUNK.ctrl2.y} ${PF_TRUNK.ctrl1.x} ${PF_TRUNK.ctrl1.y} ${PF_TRUNK.top.x} ${PF_TRUNK.top.y}`;

// ─── Theme region layout ─────────────────────────────────────────────
// Per theme: attach point on trunk, limb control point bow, gateway position,
// outward direction, hub list with relative angles (radians around outward).
const PF_REGIONS = {
  becoming: {
    attach: { x: 720, y: 210 },                 // top of trunk
    cp:     { x: 720, y: 130 },                 // limb control
    gateway:{ x: 720, y: 100 },                 // crown gateway
    outward: { x: 0, y: -1 },
    hubs: [
      { id: "innerlife", angDeg: -42, r: 130 },
      { id: "purpose",   angDeg:   0, r: 120 },
      { id: "joy",       angDeg:  42, r: 130 },
    ],
  },
  work: {
    attach: { x: 738, y: 300 },
    cp:     { x: 580, y: 240 },
    gateway:{ x: 360, y: 260 },
    outward: tpNorm({ x: -1, y: -0.18 }),
    hubs: [
      { id: "career",  angDeg: -38, r: 150 },
      { id: "skills",  angDeg:  -3, r: 132 },
      { id: "builds",  angDeg:  38, r: 148 },
    ],
  },
  money: {
    attach: { x: 706, y: 580 },
    cp:     { x: 540, y: 660 },
    gateway:{ x: 350, y: 660 },
    outward: tpNorm({ x: -1, y: 0.10 }),
    hubs: [
      { id: "income",      angDeg: -48, r: 145 },
      { id: "assets",      angDeg: -15, r: 140 },
      { id: "safetynet",   angDeg:  18, r: 140 },
      { id: "liabilities", angDeg:  50, r: 142 },
    ],
  },
  people: {
    attach: { x: 738, y: 340 },
    cp:     { x: 880, y: 290 },
    gateway:{ x: 1080, y: 290 },
    outward: tpNorm({ x: 1, y: -0.12 }),
    hubs: [
      { id: "family",      angDeg: -38, r: 140 },
      { id: "romance",     angDeg:  -2, r: 130 },
      { id: "friendships", angDeg:  38, r: 140 },
    ],
  },
  health: {
    attach: { x: 706, y: 620 },
    cp:     { x: 880, y: 680 },
    gateway:{ x: 1090, y: 680 },
    outward: tpNorm({ x: 1, y: 0.10 }),
    hubs: [
      { id: "movement",   angDeg: -48, r: 145 },
      { id: "nutrition",  angDeg: -15, r: 138 },
      { id: "appearance", angDeg:  18, r: 138 },
      { id: "rest",       angDeg:  50, r: 145 },
    ],
  },
};

// Compute full layout (hubs, goals, moments)
const PF_TRUNK_CACHE = {};
function pfTrunkLayout() {
  if (PF_TRUNK_CACHE.v) return PF_TRUNK_CACHE.v;
  const L = { hubs:{}, goals:{}, moments:{}, ambiguous:{} };

  // Hubs
  Object.entries(PF_REGIONS).forEach(([tid, region]) => {
    const baseAng = Math.atan2(region.outward.y, region.outward.x);
    region.hubs.forEach(h => {
      const ang = baseAng + (h.angDeg * Math.PI / 180);
      const pos = {
        x: region.gateway.x + Math.cos(ang) * h.r,
        y: region.gateway.y + Math.sin(ang) * h.r,
      };
      // Goal-outward direction from hub (continues away from gateway)
      const outDir = tpNorm({
        x: pos.x - region.gateway.x,
        y: pos.y - region.gateway.y,
      });
      L.hubs[h.id] = { id: h.id, theme: tid, pos, outDir,
                       gateway: region.gateway };
    });
  });

  // Goals — orbit hub in a small fan facing outward
  Object.entries(L.hubs).forEach(([hid, hub]) => {
    const goals = PF_PURSUITS.filter(p => p.hub === hid);
    if (goals.length === 0) return;
    const baseAng = Math.atan2(hub.outDir.y, hub.outDir.x);
    goals.forEach((g, i) => {
      const n = goals.length;
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
      const ang = baseAng + t * 60 * Math.PI / 180;
      // child goals push out further
      const r = g.parent ? 78 : 50;
      const pos = {
        x: hub.pos.x + Math.cos(ang) * r,
        y: hub.pos.y + Math.sin(ang) * r,
      };
      L.goals[g.id] = { id: g.id, theme: hub.theme, hub: hid, pos, parent: g.parent };
    });
  });

  // Moments — small ticks along the spoke from gateway to hub
  PF_MARKS.forEach((m) => {
    const hub = L.hubs[m.hub];
    if (!hub) return;
    const region = PF_REGIONS[hub.theme];
    // tick sits ~40% from gateway toward hub, slightly offset perpendicular
    const dx = hub.pos.x - region.gateway.x;
    const dy = hub.pos.y - region.gateway.y;
    const t = 0.55;
    const px = region.gateway.x + dx * t;
    const py = region.gateway.y + dy * t;
    // perpendicular offset
    const perp = tpNorm({ x: -dy, y: dx });
    const pos = { x: px + perp.x * 10, y: py + perp.y * 10 };
    L.moments[m.id] = { id: m.id, pos, theme: hub.theme, hub: m.hub };
  });

  // Ambiguous markers — drift between two candidate hubs
  PF_AMBIGUOUS.forEach((a) => {
    const h1 = L.hubs[a.betweenHubs[0]];
    const h2 = L.hubs[a.betweenHubs[1]];
    if (!h1 || !h2) return;
    const pos = { x: (h1.pos.x + h2.pos.x)/2, y: (h1.pos.y + h2.pos.y)/2 };
    L.ambiguous[a.id] = { id: a.id, pos };
  });

  PF_TRUNK_CACHE.v = L;
  return L;
}

Object.assign(window, { pfTrunkLayout, PF_REGIONS, PF_TRUNK, PF_TRUNK_PATH });
