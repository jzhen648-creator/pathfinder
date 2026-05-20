// ─── Pathfinder · trunk poster renderer ──────────────────────────────
// Renders the trunk-first life map. Uses pfTrunkLayout() for geometry.

function TrunkPoster({
  selectedHubId = null,
  selectedGoalId = null,
  hoveredId = null,
  dim = 0,                       // overall dim (0..1)
  showStreamPreview = null,      // { hub } — pulsing hex on this hub
  onHubClick = () => {},
  onGoalClick = () => {},
  onGatewayClick = () => {},
  showGoalLabels = "active",     // "all" | "active" | "selected" | "none"
}) {
  const L = React.useMemo(() => pfTrunkLayout(), []);
  const c = (tid) => PF_THEMES[tid].color;
  const isActive = (tid) => PF_ACTIVE_THEMES.includes(tid);
  const selHubTheme = selectedHubId ? L.hubs[selectedHubId]?.theme : null;
  const themeIsFocused = (tid) =>
    !selectedHubId || selHubTheme === tid;
  const themeDim = (tid) => themeIsFocused(tid) ? 1 : 0.55;

  return (
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid meet"
      style={{
        width:"100%", height:"100%", display:"block",
        background:"#07060A", userSelect:"none",
        opacity: 1 - dim * 0.55,
        transition:"opacity 400ms ease",
      }}>
      <defs>
        <filter id="tp-blur-xl" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="14"/>
        </filter>
        <filter id="tp-blur-lg" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="7"/>
        </filter>
        <filter id="tp-blur-md" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5"/>
        </filter>
        <filter id="tp-blur-sm" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.5"/>
        </filter>
        {/* Subtle territory veils per theme */}
        {PF_THEME_ORDER.map(tid => (
          <radialGradient key={"veil-"+tid} id={`tp-veil-${tid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={c(tid)} stopOpacity="0.07"/>
            <stop offset="60%" stopColor={c(tid)} stopOpacity="0.02"/>
            <stop offset="100%" stopColor={c(tid)} stopOpacity="0"/>
          </radialGradient>
        ))}
        <radialGradient id="tp-bg-vignette" cx="50%" cy="50%" r="65%">
          <stop offset="60%" stopColor="rgba(7,6,10,0)"/>
          <stop offset="100%" stopColor="rgba(7,6,10,0.85)"/>
        </radialGradient>
        <linearGradient id="tp-trunk" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor="rgba(245,243,252,0.55)"/>
          <stop offset="50%" stopColor="rgba(245,243,252,0.78)"/>
          <stop offset="100%" stopColor="rgba(245,243,252,0.45)"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1440" height="900" fill="url(#tp-bg-vignette)"/>

      {/* Territory veils — VERY subtle, each theme region */}
      {PF_THEME_ORDER.map(tid => {
        const r = PF_REGIONS[tid];
        const rad = 240;
        return (
          <circle key={"v-"+tid}
            cx={r.gateway.x} cy={r.gateway.y} r={rad}
            fill={`url(#tp-veil-${tid})`}
            opacity={themeDim(tid)}
          />
        );
      })}

      {/* ─── Trunk ─── */}
      <g>
        {/* atmospheric halo */}
        <path d={PF_TRUNK_PATH} stroke="rgba(245,243,252,0.18)"
          strokeWidth="38" fill="none" filter="url(#tp-blur-xl)" strokeLinecap="round"/>
        {/* mid glow */}
        <path d={PF_TRUNK_PATH} stroke="rgba(245,243,252,0.30)"
          strokeWidth="16" fill="none" filter="url(#tp-blur-md)" strokeLinecap="round"/>
        {/* trunk body */}
        <path d={PF_TRUNK_PATH} stroke="url(#tp-trunk)"
          strokeWidth="5" fill="none" strokeLinecap="round"/>
        {/* bright inner thread */}
        <path d={PF_TRUNK_PATH} stroke="rgba(255,255,255,0.85)"
          strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      </g>

      {/* ─── Limbs (trunk attach → gateway) ─── */}
      {PF_THEME_ORDER.map(tid => {
        const r = PF_REGIONS[tid];
        const limbPath = `M ${r.attach.x} ${r.attach.y} Q ${r.cp.x} ${r.cp.y} ${r.gateway.x} ${r.gateway.y}`;
        const color = c(tid);
        const op = themeDim(tid);
        const accent = selHubTheme === tid ? 1.25 : 1;
        return (
          <g key={"limb-"+tid} opacity={op}>
            {/* atmospheric halo */}
            <path d={limbPath} stroke={color} strokeOpacity={0.18 * accent}
              strokeWidth="22" fill="none" filter="url(#tp-blur-lg)" strokeLinecap="round"/>
            {/* mid glow */}
            <path d={limbPath} stroke={color} strokeOpacity={0.40 * accent}
              strokeWidth="10" fill="none" filter="url(#tp-blur-md)" strokeLinecap="round"/>
            {/* limb body */}
            <path d={limbPath} stroke={color} strokeOpacity={0.85 * accent}
              strokeWidth="3.2" fill="none" strokeLinecap="round"/>
            {/* inner thread */}
            <path d={limbPath} stroke="rgba(255,255,255,0.75)" strokeOpacity={0.55 * accent}
              strokeWidth="0.9" fill="none" strokeLinecap="round"/>
          </g>
        );
      })}

      {/* ─── Spokes (gateway → hub) — thin & quiet ─── */}
      {Object.values(L.hubs).map(hub => {
        const r = PF_REGIONS[hub.theme];
        const color = c(hub.theme);
        const sel = selectedHubId === hub.id;
        const op = themeDim(hub.theme) * (sel ? 1.5 : 1);
        return (
          <g key={"sp-"+hub.id} opacity={op}>
            <line x1={r.gateway.x} y1={r.gateway.y}
                  x2={hub.pos.x}   y2={hub.pos.y}
                  stroke={color} strokeOpacity="0.40"
                  strokeWidth={sel ? 5 : 4} filter="url(#tp-blur-sm)" strokeLinecap="round"/>
            <line x1={r.gateway.x} y1={r.gateway.y}
                  x2={hub.pos.x}   y2={hub.pos.y}
                  stroke={color} strokeOpacity="0.75"
                  strokeWidth={sel ? 1.2 : 0.9} strokeLinecap="round"/>
          </g>
        );
      })}

      {/* ─── Hub → goal connectors (faint dotted) ─── */}
      {Object.values(L.goals).map(g => {
        const hub = L.hubs[g.hub];
        const color = c(g.theme);
        const op = themeDim(g.theme) * 0.65;
        return (
          <line key={"hg-"+g.id}
            x1={hub.pos.x} y1={hub.pos.y}
            x2={g.pos.x}   y2={g.pos.y}
            stroke={color} strokeOpacity={op * 0.55}
            strokeWidth="0.7" strokeDasharray="1.5 2.5" strokeLinecap="round"/>
        );
      })}

      {/* ─── Parent → child goal connectors (slightly stronger) ─── */}
      {Object.values(L.goals).filter(g => g.parent).map(g => {
        const par = L.goals[g.parent];
        if (!par) return null;
        const color = c(g.theme);
        const op = themeDim(g.theme);
        return (
          <line key={"pc-"+g.id}
            x1={par.pos.x} y1={par.pos.y}
            x2={g.pos.x}   y2={g.pos.y}
            stroke={color} strokeOpacity={op * 0.55}
            strokeWidth="0.9"/>
        );
      })}

      {/* ─── Gateways (medallions with icon) ─── */}
      {PF_THEME_ORDER.map(tid => {
        const r = PF_REGIONS[tid];
        const color = c(tid);
        const op = themeDim(tid);
        return (
          <g key={"gw-"+tid} transform={`translate(${r.gateway.x},${r.gateway.y})`}
             style={{ cursor:"pointer", opacity: op }}
             onClick={(e) => { e.stopPropagation(); onGatewayClick(tid); }}>
            <circle r="44" fill={color} opacity="0.12" filter="url(#tp-blur-md)"/>
            <circle r="22" fill={color} opacity="0.20" filter="url(#tp-blur-sm)"/>
            <circle r="22" fill="#07060A"/>
            <circle r="22" fill="none" stroke={color} strokeWidth="1.8"/>
            <circle r="18" fill="none" stroke={color} strokeOpacity="0.40" strokeWidth="0.7"/>
            {/* embedded icon */}
            <g transform="translate(-11 -11)">
              <PFThemeIcon theme={tid} size={22} color={color} stroke={1.3}/>
            </g>
            {/* serif theme label */}
            <text y="46" textAnchor="middle"
              fill="rgba(255,255,255,0.94)"
              style={{ font:'italic 500 16px "Lora", serif', letterSpacing:"0.005em", pointerEvents:"none" }}>
              {PF_THEMES[tid].short}
            </text>
          </g>
        );
      })}

      {/* ─── Hubs ─── */}
      {Object.values(L.hubs).map(hub => {
        const color = c(hub.theme);
        const sel = selectedHubId === hub.id;
        const hov = hoveredId === "hub:" + hub.id;
        const op = themeDim(hub.theme);
        const r = sel || hov ? 8 : 6.5;
        const hubName = PF_HUBS.find(x => x.id === hub.id).name;
        // label side: away from gateway
        const lx = hub.outDir.x * 14;
        const ly = hub.outDir.y * 14 - 2;
        const anchor = hub.outDir.x > 0.25 ? "start" : hub.outDir.x < -0.25 ? "end" : "middle";
        return (
          <g key={"h-"+hub.id} transform={`translate(${hub.pos.x},${hub.pos.y})`}
             style={{ cursor:"pointer", opacity: op }}
             onClick={(e) => { e.stopPropagation(); onHubClick(hub.id); }}>
            <circle r={r * 2.2} fill={color} opacity={sel ? 0.22 : 0.10} filter="url(#tp-blur-sm)"/>
            <circle r={r} fill="#0A0911"/>
            <circle r={r} fill="none" stroke={color} strokeWidth="1.2"/>
            {sel && <circle r={r + 5} fill="none" stroke={color} strokeWidth="0.7" strokeDasharray="2 3" opacity="0.7"/>}
            <text x={lx} y={ly} textAnchor={anchor}
              fill={sel ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.75)"}
              style={{ font:'500 11px "Inter", sans-serif', letterSpacing:"0.005em", pointerEvents:"none" }}>
              {hubName}
            </text>
          </g>
        );
      })}

      {/* ─── Goals (hexes) ─── */}
      {Object.values(L.goals).map(g => {
        const pursuit = PF_PURSUITS.find(p => p.id === g.id);
        const color = c(g.theme);
        const sel = selectedGoalId === g.id;
        const branchSelected = selectedHubId === g.hub;
        const hov = hoveredId === "goal:" + g.id;
        const op = themeDim(g.theme);
        const state = pursuit.state;
        const baseR = g.parent ? 6 : 8;
        const r = baseR * (sel || hov ? 1.25 : 1);
        const isComplete = state === "complete";
        const isOnHold = state === "onhold";
        const opacity = isOnHold ? 0.55 : isComplete ? 0.55 : 1;
        const showLabel = showGoalLabels === "all"
          || (showGoalLabels === "active" && (isActive(g.theme) && state === "active"))
          || (showGoalLabels === "selected" && (sel || branchSelected));
        return (
          <g key={"g-"+g.id} transform={`translate(${g.pos.x},${g.pos.y})`}
             style={{ cursor:"pointer", opacity: op * opacity }}
             onClick={(e) => { e.stopPropagation(); onGoalClick(g.id); }}>
            {!isOnHold && !isComplete && (
              <path d={pfHexTop(0,0, r * 1.7)} fill={color} opacity="0.20" filter="url(#tp-blur-sm)"/>
            )}
            <path d={pfHexTop(0,0, r)} fill="#0A0911" stroke={color} strokeWidth={sel ? 1.5 : 1.2}
              strokeDasharray={isOnHold ? "2 2" : "0"}/>
            {isComplete && (
              <path d="M-3 0 L-1 2 L4 -3" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            )}
            {showLabel && (
              <text y={r + 12} textAnchor="middle" fill="rgba(255,255,255,0.78)"
                style={{ font:'400 10px "Inter", sans-serif', letterSpacing:"0.005em",
                  fontStyle: isOnHold ? "italic" : "normal", pointerEvents:"none" }}>
                {pursuit.name}
              </text>
            )}
          </g>
        );
      })}

      {/* ─── Moments (tiny ticks on spokes) ─── */}
      {Object.values(L.moments).map(m => {
        const color = PF_MARK;
        return (
          <g key={"m-"+m.id} transform={`translate(${m.pos.x},${m.pos.y})`}>
            <path d={pfDiamond(0,0, 9)} fill={color} opacity="0.25" filter="url(#tp-blur-sm)"/>
            <path d={pfDiamond(0,0, 3.5)} fill={color}/>
          </g>
        );
      })}

      {/* ─── Ambiguous markers ─── */}
      {Object.values(L.ambiguous).map(a => (
        <g key={"a-"+a.id} transform={`translate(${a.pos.x},${a.pos.y})`}>
          <path d={pfDiamond(0,0, 6)} fill="none" stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.9" strokeDasharray="2 2"/>
          <circle r="1.2" fill="rgba(255,255,255,0.5)"/>
        </g>
      ))}

      {/* ─── Stream preview (pulsing hex on target hub) ─── */}
      {showStreamPreview && (() => {
        const hub = L.hubs[showStreamPreview.hub];
        if (!hub) return null;
        const color = c(hub.theme);
        const baseAng = Math.atan2(hub.outDir.y, hub.outDir.x);
        const pos = {
          x: hub.pos.x + Math.cos(baseAng) * 50,
          y: hub.pos.y + Math.sin(baseAng) * 50,
        };
        return (
          <g transform={`translate(${pos.x},${pos.y})`}>
            <path d={pfHexTop(0,0,14)} fill={color} opacity="0.20">
              <animate attributeName="opacity" values="0.10;0.32;0.10" dur="1.8s" repeatCount="indefinite"/>
            </path>
            <path d={pfHexTop(0,0,10)} fill="none" stroke={color} strokeWidth="1.1" strokeDasharray="3 2" opacity="0.85"/>
            <circle r="1.8" fill={color}/>
          </g>
        );
      })()}
    </svg>
  );
}

Object.assign(window, { TrunkPoster });
