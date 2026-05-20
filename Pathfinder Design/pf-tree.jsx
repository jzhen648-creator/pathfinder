// ─── Pathfinder · poster tree ────────────────────────────────────────
// Cartographic poster: trunk → limb → gateway → spoke/fan → hub →
// branch conduit → hex pursuit · diamond mark · dashed unresolved.

const PF_T = {
  bg: "#07060A",
  core: "#0B0A11",
  rim: "rgba(245,243,252,0.85)",
  ink: "rgba(255,255,255,0.94)",
  ink2: "rgba(255,255,255,0.62)",
  ink3: "rgba(255,255,255,0.42)",
  ink4: "rgba(255,255,255,0.26)",
};

function pfPolar(r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}
function pfNorm(v) {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}
function pfAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function pfScale(v, s) { return { x: v.x * s, y: v.y * s }; }
function pfPerp(v) { return { x: -v.y, y: v.x }; }

// Curved Bezier limb from near-center outward to gateway.
// `bow` = perpendicular offset of the control point (organic flex).
function pfBezier(startR, end, bow, angle) {
  const start = pfPolar(startR, angle);
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  // CCW perpendicular
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * bow;
  const cy = my + py * bow;
  return { path: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`, start, end, cp: { x: cx, y: cy } };
}

// Pointy-top hexagon path
function pfHexTop(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * Math.PI / 180; // start at top
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return "M " + pts.map(p => p.join(",")).join(" L ") + " Z";
}
// Diamond path
function pfDiamond(cx, cy, r) {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}
// Inscribed pentagon (subtle trunk anchor)
function pfPentagon(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = (-90 + i * 72) * Math.PI / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return "M " + pts.map(p => p.join(",")).join(" L ") + " Z";
}

// ─── Layout configuration ────────────────────────────────────────────
// Each theme: gateway angle/radius, hub layout strategy (spoke vs fan),
// hub-list (ids in display order), and bezier bow direction.
const PF_THEME_LAYOUT = {
  work:     { angle: -90, gwR: 280, bow:  44, hubLayout:"spoke", hubR: 470,
              hubIds:["career","skills","builds"], hubSpread: 42 },
  money:    { angle: -18, gwR: 290, bow: -36, hubLayout:"fan",   hubR: 470,
              hubIds:["income","assets","safetynet","liabilities"], hubSpread: 64 },
  becoming: { angle:  54, gwR: 270, bow:  28, hubLayout:"fan",   hubR: 460,
              hubIds:["innerlife","purpose","joy"], hubSpread: 50 },
  people:   { angle: 126, gwR: 270, bow: -32, hubLayout:"spoke", hubR: 470,
              hubIds:["family","romance","friendships"], hubSpread: 44 },
  health:   { angle: 198, gwR: 290, bow:  40, hubLayout:"spoke", hubR: 460,
              hubIds:["movement","nutrition","appearance","rest"], hubSpread: 64 },
};

// Compute all positions once.
const PF_LAYOUT_CACHE = {};
function pfComputeLayout() {
  if (PF_LAYOUT_CACHE.v) return PF_LAYOUT_CACHE.v;

  const L = { themes:{}, hubs:{}, pursuits:{}, milestones:{}, marks:{}, ambiguous:{}, limbs:[] };

  // Limbs + gateways
  PF_THEME_ORDER.forEach(tid => {
    const cfg = PF_THEME_LAYOUT[tid];
    const gw = pfPolar(cfg.gwR, cfg.angle);
    const limb = pfBezier(26, gw, cfg.bow, cfg.angle);
    L.themes[tid] = { id: tid, pos: gw, angle: cfg.angle, ...cfg };
    L.limbs.push({ themeId: tid, ...limb });
  });

  // Hubs
  PF_THEME_ORDER.forEach(tid => {
    const cfg = PF_THEME_LAYOUT[tid];
    const gw = L.themes[tid].pos;
    cfg.hubIds.forEach((hid, i) => {
      const n = cfg.hubIds.length;
      const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5..+0.5
      const hubAng = cfg.angle + t * cfg.hubSpread;
      const hubPos = pfPolar(cfg.hubR, hubAng);
      // Branch direction: from gateway through hub, continue outward.
      const dir = pfNorm({ x: hubPos.x - gw.x, y: hubPos.y - gw.y });
      L.hubs[hid] = {
        id: hid, theme: tid,
        pos: hubPos,
        gatewayPos: gw,
        angle: hubAng,
        branchDir: dir,
      };
    });
  });

  // Pursuits — ON branch line, spaced
  const STEP = 56;
  PF_PURSUITS.forEach(p => {
    const hub = L.hubs[p.hub];
    if (!hub) return;
    // ordering: nested pursuits sit beside parent, others at p.order along branch
    const pos = pfAdd(hub.pos, pfScale(hub.branchDir, STEP * (p.order + 1)));
    // small lateral jitter for nested children to avoid overlap
    let finalPos = pos;
    if (p.parent) {
      const perp = pfPerp(hub.branchDir);
      finalPos = pfAdd(pos, pfScale(perp, 26));
    }
    L.pursuits[p.id] = {
      id: p.id, theme: hub.theme, hub: p.hub,
      pos: finalPos, branchDir: hub.branchDir,
      state: p.state, parent: p.parent,
    };
  });

  // Milestones — small orbital dots adjacent to their pursuit
  const MS_BY_PURSUIT = {};
  PF_MILESTONES.forEach(m => {
    (MS_BY_PURSUIT[m.pursuit] = MS_BY_PURSUIT[m.pursuit] || []).push(m);
  });
  Object.entries(MS_BY_PURSUIT).forEach(([pid, list]) => {
    const pursuit = L.pursuits[pid];
    if (!pursuit) return;
    const perp = pfPerp(pursuit.branchDir);
    list.forEach((m, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const idx = Math.floor(i / 2) + 1;
      const off = pfAdd(pfScale(perp, side * (14 + idx * 4)), pfScale(pursuit.branchDir, 4));
      L.milestones[m.id] = { id: m.id, pos: pfAdd(pursuit.pos, off), pursuit: pid, theme: pursuit.theme };
    });
  });

  // Marks — amber diamonds ON branch conduit (positioned at order index)
  PF_MARKS.forEach((m, i) => {
    const hub = L.hubs[m.hub];
    if (!hub) return;
    const pos = pfAdd(hub.pos, pfScale(hub.branchDir, STEP * 1));
    L.marks[m.id] = { id: m.id, pos, hub: m.hub, theme: hub.theme };
  });

  // Ambiguous — sits BETWEEN two candidate hubs
  PF_AMBIGUOUS.forEach(a => {
    const h1 = L.hubs[a.betweenHubs[0]];
    const h2 = L.hubs[a.betweenHubs[1]];
    if (!h1 || !h2) return;
    // midpoint between branch midpoints
    const p1 = pfAdd(h1.pos, pfScale(h1.branchDir, 70));
    const p2 = pfAdd(h2.pos, pfScale(h2.branchDir, 70));
    const pos = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    L.ambiguous[a.id] = { id: a.id, pos, themes:[h1.theme, h2.theme] };
  });

  PF_LAYOUT_CACHE.v = L;
  return L;
}

// ─── Poster tree component ───────────────────────────────────────────
function PosterTree({
  width = 1440, height = 900,
  selectedHubId = null,
  selectedPursuitId = null,
  hoveredId = null,
  dim = 0,                  // overall dim (0..1) — used in stream mode
  showStreamPreview = null, // {hub, position?} — pulsing preview hex
  onHubClick = () => {},
  onPursuitClick = () => {},
  onGatewayClick = () => {},
  showLabels = true,
  showPursuitLabels = "active", // "all" | "active" | "selected" | "none"
  scale = 1,
  pan = { x: 0, y: 0 },
}) {
  const L = React.useMemo(() => pfComputeLayout(), []);

  // viewport — fit the tree centered with comfortable margin
  const vbHalf = 760;
  const vb = `${-vbHalf} ${-vbHalf} ${vbHalf * 2} ${vbHalf * 2}`;

  const c = (tid) => PF_THEMES[tid].color;
  const isActive = (tid) => PF_ACTIVE_THEMES.includes(tid);
  const dimTheme = (tid) => isActive(tid) ? 1 : 0.78; // less-active themes dimmer

  const isSelectedHub = (id) => selectedHubId === id;
  const selectedHubTheme = selectedHubId ? L.hubs[selectedHubId]?.theme : null;

  // Helper: should we glow this hub's branch as "selected"?
  const branchIsSelected = (hubId) => isSelectedHub(hubId);

  const PURSUIT_R = 13;
  const HUB_R = 7;
  const GW_R = 14;

  return (
    <svg
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100%", height: "100%", display: "block",
        background: PF_T.bg, userSelect: "none",
        opacity: 1 - dim * 0.6,
        transition: "opacity 400ms ease",
      }}
    >
      <defs>
        <filter id="pf-blur-xl" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="pf-blur-lg" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="pf-blur-md" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id="pf-blur-sm" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <radialGradient id="pf-vignette" cx="50%" cy="50%" r="55%">
          <stop offset="50%"  stopColor="rgba(7,6,10,0)"/>
          <stop offset="100%" stopColor="rgba(7,6,10,0.7)"/>
        </radialGradient>
      </defs>

      {/* Background vignette */}
      <rect x={-vbHalf} y={-vbHalf} width={vbHalf*2} height={vbHalf*2} fill="url(#pf-vignette)"/>

      <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>

        {/* ─── 1. Limbs (Bezier — vascular conduit, thick + glowing) ─── */}
        {L.limbs.map(limb => {
          const tid = limb.themeId;
          const color = c(tid);
          const active = isActive(tid);
          const opacity = (active ? 1 : 0.82);
          const branchAccent = selectedHubTheme === tid ? 1.25 : 1;
          return (
            <g key={"limb-"+tid} opacity={opacity}>
              {/* atmospheric halo — wide soft blur */}
              <path d={limb.path} stroke={color} strokeOpacity={0.18 * branchAccent}
                strokeWidth={22} fill="none" filter="url(#pf-blur-xl)" strokeLinecap="round"/>
              {/* mid glow */}
              <path d={limb.path} stroke={color} strokeOpacity={0.40 * branchAccent}
                strokeWidth={11} fill="none" filter="url(#pf-blur-md)" strokeLinecap="round"/>
              {/* vascular body */}
              <path d={limb.path} stroke={color} strokeOpacity={0.85 * branchAccent}
                strokeWidth={3.5} fill="none" strokeLinecap="round"/>
              {/* inner bright thread */}
              <path d={limb.path} stroke="rgba(255,255,255,0.78)" strokeOpacity={0.85 * branchAccent}
                strokeWidth={1.1} fill="none" strokeLinecap="round"/>
            </g>
          );
        })}

        {/* ─── 2. Spokes (gateway → hub) — thinner than limb, glow + line ─── */}
        {Object.values(L.hubs).map(hub => {
          const color = c(hub.theme);
          const sel = branchIsSelected(hub.id);
          const op = (isActive(hub.theme) ? 0.78 : 0.62) * (sel ? 1.3 : 1);
          return (
            <g key={"sp-"+hub.id}>
              <line x1={hub.gatewayPos.x} y1={hub.gatewayPos.y}
                x2={hub.pos.x} y2={hub.pos.y}
                stroke={color} strokeOpacity={op * 0.42}
                strokeWidth={5} filter="url(#pf-blur-sm)" strokeLinecap="round"/>
              <line x1={hub.gatewayPos.x} y1={hub.gatewayPos.y}
                x2={hub.pos.x} y2={hub.pos.y}
                stroke={color} strokeOpacity={op}
                strokeWidth={sel ? 1.8 : 1.4} strokeLinecap="round"/>
            </g>
          );
        })}

        {/* ─── 3. Branch conduits — pursuits sit ON this stroke ─── */}
        {Object.values(L.hubs).map(hub => {
          const pursuits = PF_PURSUITS.filter(p => p.hub === hub.id);
          if (pursuits.length === 0 && !PF_MARKS.some(m => m.hub === hub.id)) return null;
          const maxOrder = Math.max(0, ...pursuits.map(p => p.order));
          const endLen = 56 * (maxOrder + 1) + 30;
          const end = pfAdd(hub.pos, pfScale(hub.branchDir, endLen));
          const color = c(hub.theme);
          const sel = branchIsSelected(hub.id);
          const op = (isActive(hub.theme) ? 0.78 : 0.60) * (sel ? 1.3 : 1);
          return (
            <g key={"br-"+hub.id}>
              {/* atmospheric halo */}
              <line x1={hub.pos.x} y1={hub.pos.y} x2={end.x} y2={end.y}
                stroke={color} strokeOpacity={op * 0.32}
                strokeWidth={sel ? 10 : 8} filter="url(#pf-blur-md)" strokeLinecap="round"/>
              {/* body */}
              <line x1={hub.pos.x} y1={hub.pos.y} x2={end.x} y2={end.y}
                stroke={color} strokeOpacity={op}
                strokeWidth={sel ? 2.0 : 1.6} strokeLinecap="round"/>
              {/* bright wire */}
              <line x1={hub.pos.x} y1={hub.pos.y} x2={end.x} y2={end.y}
                stroke="rgba(255,255,255,0.45)" strokeOpacity={0.6}
                strokeWidth={0.5} strokeLinecap="round"/>
            </g>
          );
        })}

        {/* ─── 4. Gateway medallions — RING (not filled orb) + serif label ─── */}
        {PF_THEME_ORDER.map(tid => {
          const t = L.themes[tid];
          const color = c(tid);
          return (
            <g key={"gw-"+tid} transform={`translate(${t.pos.x},${t.pos.y})`}
               style={{ cursor:"pointer" }}
               onClick={(e) => { e.stopPropagation(); onGatewayClick(tid); }}>
              {/* soft bloom — restrained so the gateway doesn't dominate */}
              <circle r="26" fill={color} opacity="0.10" filter="url(#pf-blur-md)"/>
              {/* dark cutout where the limb passes through */}
              <circle r={GW_R} fill={PF_T.bg}/>
              {/* ring */}
              <circle r={GW_R} fill="none" stroke={color} strokeWidth="1.8"/>
              <circle r={GW_R - 3} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="0.8"/>
              {/* tiny center dot — node marker, not a filled disc */}
              <circle r="2.5" fill={color}/>
              {/* serif theme label */}
              {showLabels && (
                <text y={GW_R + 22} textAnchor="middle"
                      fill={PF_T.ink}
                      style={{ font:'italic 500 16px "Lora", serif', letterSpacing:"0.005em", pointerEvents:"none" }}>
                  {PF_THEMES[tid].short}
                </text>
              )}
            </g>
          );
        })}

        {/* ─── 5. Hubs ─── */}
        {Object.values(L.hubs).map(hub => {
          const color = c(hub.theme);
          const sel = isSelectedHub(hub.id);
          const hov = hoveredId === "hub:" + hub.id;
          const r = HUB_R * (sel || hov ? 1.25 : 1);
          const themeFaded = isActive(hub.theme) ? 1 : 0.85;
          return (
            <g key={"h-"+hub.id} transform={`translate(${hub.pos.x},${hub.pos.y})`}
               style={{ cursor:"pointer", opacity: themeFaded }}
               onClick={(e) => { e.stopPropagation(); onHubClick(hub.id); }}>
              <circle r={r * 2.4} fill={color} opacity={sel ? 0.22 : 0.10} filter="url(#pf-blur-sm)"/>
              <circle r={r} fill={PF_T.core}/>
              <circle r={r} fill="none" stroke={color} strokeWidth="1.3"/>
              {sel && <circle r={r + 6} fill="none" stroke={color} strokeWidth="0.9" strokeDasharray="2 3" opacity="0.7"/>}
              {/* Hub name (always visible) */}
              {showLabels && (
                <text
                  x={hub.branchDir.x * (r + 14)}
                  y={hub.branchDir.y * (r + 14) - 2}
                  textAnchor={hub.branchDir.x > 0.25 ? "start" : hub.branchDir.x < -0.25 ? "end" : "middle"}
                  fill={sel ? PF_T.ink : PF_T.ink2}
                  style={{ font:'500 11.5px "Inter", sans-serif', letterSpacing:"0.01em", pointerEvents:"none" }}>
                  {PF_HUBS.find(h => h.id === hub.id).name}
                </text>
              )}
            </g>
          );
        })}

        {/* ─── 6. Pursuits (hexes ON branch) ─── */}
        {PF_PURSUITS.map(p => {
          const pos = L.pursuits[p.id];
          if (!pos) return null;
          const color = c(pos.theme);
          const sel = selectedPursuitId === p.id;
          const hov = hoveredId === "pursuit:" + p.id;
          const branchSelected = branchIsSelected(p.hub);
          const r = PURSUIT_R * (sel || hov ? 1.2 : 1);
          // state styling
          const isComplete = p.state === "complete";
          const isOnHold = p.state === "onhold";
          const opacity = isOnHold ? 0.55 : isComplete ? 0.50 : 1;
          const stroke = color;
          const strokeWidth = sel ? 1.7 : 1.3;
          const showLabel = showPursuitLabels === "all"
            || (showPursuitLabels === "active" && (isActive(pos.theme) || branchSelected))
            || (showPursuitLabels === "selected" && (sel || branchSelected));
          return (
            <g key={"p-"+p.id} transform={`translate(${pos.pos.x},${pos.pos.y})`}
               style={{ cursor:"pointer", opacity }}
               onClick={(e) => { e.stopPropagation(); onPursuitClick(p.id); }}>
              {!isOnHold && !isComplete && (
                <path d={pfHexTop(0, 0, r * 1.6)} fill={color} opacity="0.18" filter="url(#pf-blur-sm)"/>
              )}
              <path d={pfHexTop(0, 0, r)} fill={PF_T.core} stroke={stroke} strokeWidth={strokeWidth}
                strokeDasharray={isOnHold ? "2 2" : "0"}/>
              {isComplete && (
                <path d="M-4 0 L-1 3 L5 -3" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              )}
              {showLabel && (
                <text
                  x={pos.branchDir.x * (r + 11)}
                  y={pos.branchDir.y * (r + 11) + 3}
                  textAnchor={pos.branchDir.x > 0.3 ? "start" : pos.branchDir.x < -0.3 ? "end" : "middle"}
                  fill={sel ? PF_T.ink : PF_T.ink2}
                  style={{
                    font:'400 10.5px "Inter", sans-serif',
                    letterSpacing:"0.01em",
                    pointerEvents:"none",
                    fontStyle: isOnHold ? "italic" : "normal",
                  }}>
                  {p.name}
                </text>
              )}
            </g>
          );
        })}

        {/* ─── 7. Milestones (small orbitals) ─── */}
        {PF_MILESTONES.map(m => {
          const pos = L.milestones[m.id];
          if (!pos) return null;
          const color = c(pos.theme);
          return (
            <circle key={"m-"+m.id} cx={pos.pos.x} cy={pos.pos.y}
              r="2.6" fill={m.done ? color : PF_T.core}
              stroke={color} strokeWidth="0.9"/>
          );
        })}

        {/* ─── 8. Marks (amber diamonds ON branch) ─── */}
        {PF_MARKS.map(m => {
          const pos = L.marks[m.id];
          if (!pos) return null;
          return (
            <g key={"mk-"+m.id} transform={`translate(${pos.pos.x},${pos.pos.y})`}>
              <path d={pfDiamond(0,0,12)} fill={PF_MARK} opacity="0.22" filter="url(#pf-blur-sm)"/>
              <path d={pfDiamond(0,0,5)} fill={PF_MARK}/>
            </g>
          );
        })}

        {/* ─── 9. Ambiguous (dashed diamond between hubs) ─── */}
        {PF_AMBIGUOUS.map(a => {
          const pos = L.ambiguous[a.id];
          if (!pos) return null;
          return (
            <g key={"a-"+a.id} transform={`translate(${pos.pos.x},${pos.pos.y})`}>
              <path d={pfDiamond(0,0,8)} fill="none"
                stroke="rgba(255,255,255,0.55)" strokeWidth="1"
                strokeDasharray="2 2"/>
              <circle r="1.5" fill="rgba(255,255,255,0.5)"/>
            </g>
          );
        })}

        {/* ─── 10. Stream preview hex (pulsing) ─── */}
        {showStreamPreview && (() => {
          const hub = L.hubs[showStreamPreview.hub];
          if (!hub) return null;
          const order = showStreamPreview.order ?? 1;
          const pos = pfAdd(hub.pos, pfScale(hub.branchDir, 56 * (order + 1)));
          const color = c(hub.theme);
          return (
            <g transform={`translate(${pos.x},${pos.y})`}>
              <path d={pfHexTop(0,0,16)} fill={color} opacity="0.18"
                style={{ transformOrigin:"center", animation:"pf-pulse 1.8s ease-in-out infinite" }}/>
              <path d={pfHexTop(0,0,12)} fill="none" stroke={color} strokeWidth="1.2"
                strokeDasharray="3 2" opacity="0.85"
                style={{ transformOrigin:"center", animation:"pf-pulse 1.8s ease-in-out infinite" }}/>
              <circle r="2" fill={color}/>
            </g>
          );
        })()}

        {/* ─── 11. Center pentagon (trunk anchor — subtle) ─── */}
        <g>
          <circle r="28" fill="rgba(255,255,255,0.018)" filter="url(#pf-blur-sm)"/>
          <path d={pfPentagon(0,0,14)} fill="none"
            stroke="rgba(255,255,255,0.30)" strokeWidth="0.9"/>
          <path d={pfPentagon(0,0,7)} fill="none"
            stroke="rgba(255,255,255,0.18)" strokeWidth="0.7"/>
        </g>

      </g>
    </svg>
  );
}

Object.assign(window, {
  PosterTree, pfComputeLayout, pfHexTop, pfDiamond, pfPentagon, pfPolar, PF_T,
  PF_THEME_LAYOUT,
});
