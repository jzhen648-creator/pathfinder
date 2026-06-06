// ─── Pathfinder · Work theme close-up ────────────────────────────────
// One theme region zoomed: trunk segment → limb → gateway → 3 hubs →
// goals orbiting hubs → moment on a spoke. All grammar parts labeled.

function PFWorkCrop() {
  const color = PF_THEMES.work.color;
  const mark = PF_MARK;

  // ─── Local geometry (bespoke for legibility) ─────────────────────
  // Anchor trunk segment on the right side; Work region spreads left.
  const trunkSeg = {
    top:    { x: 1080, y: 120 },
    ctrl1:  { x: 1110, y: 320 },
    ctrl2:  { x: 1060, y: 550 },
    bottom: { x: 1090, y: 740 },
  };
  const trunkPath = `M ${trunkSeg.bottom.x} ${trunkSeg.bottom.y} C ${trunkSeg.ctrl2.x} ${trunkSeg.ctrl2.y} ${trunkSeg.ctrl1.x} ${trunkSeg.ctrl1.y} ${trunkSeg.top.x} ${trunkSeg.top.y}`;

  // Limb: trunk attach point → Work gateway
  const attach  = { x: 1100, y: 380 };
  const limbCp  = { x: 880,  y: 320 };
  const gateway = { x: 600,  y: 340 };
  const limbPath = `M ${attach.x} ${attach.y} Q ${limbCp.x} ${limbCp.y} ${gateway.x} ${gateway.y}`;

  // Hubs around gateway — fan opening LEFT (outward)
  const hubs = [
    { id:"career", name:"Career",             pos:{ x: 380, y: 200 } },
    { id:"skills", name:"Skills",             pos:{ x: 340, y: 360 } },
    { id:"builds", name:"Builds & Launches",  pos:{ x: 360, y: 520 } },
  ];

  // Goals orbit hubs
  const goals = [
    // Career (top hub) — Senior IC parent + RFC child
    { id:"senior-ic", hub:"career", pos:{ x: 200, y: 150 }, state:"active",
      label:"Become senior IC", parent:false },
    { id:"rfc",       hub:"career", pos:{ x: 150, y: 240 }, state:"active",
      label:"Lead platform RFC", parent:"senior-ic" },
    // Skills — CeMAP on hold
    { id:"cemap",     hub:"skills", pos:{ x: 170, y: 380 }, state:"onhold",
      label:"Complete CeMAP" },
    // Builds — portfolio active
    { id:"portfolio", hub:"builds", pos:{ x: 180, y: 540 }, state:"active",
      label:"Portfolio v1" },
  ];

  // Moment: on the spoke from gateway to Career hub
  const careerHub = hubs[0].pos;
  const momentPos = {
    x: gateway.x + (careerHub.x - gateway.x) * 0.55 + 18,
    y: gateway.y + (careerHub.y - gateway.y) * 0.55 - 6,
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div style={{
      width: 1320, height: 820,
      background: "#07060A",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.06)",
      position: "relative", overflow: "hidden",
      fontFamily: '"Inter", sans-serif',
      color: "rgba(255,255,255,0.94)",
    }}>
      {/* Header */}
      <div style={{
        position: "absolute", top: 28, left: 36, right: 36,
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        zIndex: 5,
      }}>
        <div>
          <div style={{ font: '500 22px "Lora", serif', letterSpacing: "0.005em" }}>
            Work region · gateway, hubs, goals
          </div>
          <div style={{ font: '400 13px "Inter", sans-serif', color: "rgba(255,255,255,0.55)", marginTop: 4, maxWidth: 760, lineHeight: 1.5 }}>
            One theme zoomed. Trunk → Limb → Gateway medallion → short Spokes to a local cluster of Hubs → Goals orbiting each hub → Moment on a spoke.
          </div>
        </div>
        <div style={{
          font: '500 10.5px "JetBrains Mono", monospace',
          color: "rgba(255,255,255,0.42)", letterSpacing: "0.14em", textTransform: "uppercase",
          textAlign: "right",
        }}>
          <div>Work & Career</div>
          <div style={{ color, marginTop: 3 }}>#EF9F27</div>
        </div>
      </div>

      <svg viewBox="0 0 1320 820" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        <defs>
          <filter id="cp-blur-xl" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="12"/></filter>
          <filter id="cp-blur-lg" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="cp-blur-md" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
          <filter id="cp-blur-sm" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.5"/></filter>
          <linearGradient id="cp-trunk" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(245,243,252,0.55)"/>
            <stop offset="100%" stopColor="rgba(245,243,252,0.45)"/>
          </linearGradient>
          <radialGradient id="cp-veil" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.08"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </radialGradient>
        </defs>

        {/* Subtle Work territory veil */}
        <circle cx={gateway.x - 100} cy={gateway.y + 80} r="360" fill="url(#cp-veil)"/>

        {/* Trunk segment (right side) */}
        <g>
          <path d={trunkPath} stroke="rgba(245,243,252,0.18)" strokeWidth="36" fill="none" filter="url(#cp-blur-xl)" strokeLinecap="round"/>
          <path d={trunkPath} stroke="rgba(245,243,252,0.30)" strokeWidth="14" fill="none" filter="url(#cp-blur-md)" strokeLinecap="round"/>
          <path d={trunkPath} stroke="url(#cp-trunk)" strokeWidth="5" fill="none" strokeLinecap="round"/>
          <path d={trunkPath} stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        </g>

        {/* Limb — vascular */}
        <g>
          <path d={limbPath} stroke={color} strokeOpacity="0.20" strokeWidth="30" fill="none" filter="url(#cp-blur-lg)" strokeLinecap="round"/>
          <path d={limbPath} stroke={color} strokeOpacity="0.45" strokeWidth="12" fill="none" filter="url(#cp-blur-md)" strokeLinecap="round"/>
          <path d={limbPath} stroke={color} strokeOpacity="0.90" strokeWidth="4" fill="none" strokeLinecap="round"/>
          <path d={limbPath} stroke="rgba(255,255,255,0.78)" strokeOpacity="0.7" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
        </g>

        {/* Spokes (gateway → hubs) */}
        {hubs.map((h, i) => (
          <g key={"sp-"+i}>
            <line x1={gateway.x} y1={gateway.y} x2={h.pos.x} y2={h.pos.y}
              stroke={color} strokeOpacity="0.40" strokeWidth="6" filter="url(#cp-blur-sm)" strokeLinecap="round"/>
            <line x1={gateway.x} y1={gateway.y} x2={h.pos.x} y2={h.pos.y}
              stroke={color} strokeOpacity="0.85" strokeWidth="1.2" strokeLinecap="round"/>
          </g>
        ))}

        {/* Hub → goal connectors (dotted) */}
        {goals.map(g => {
          const hub = hubs.find(h => h.id === g.hub);
          return (
            <line key={"hg-"+g.id}
              x1={hub.pos.x} y1={hub.pos.y} x2={g.pos.x} y2={g.pos.y}
              stroke={color} strokeOpacity="0.40" strokeWidth="0.8" strokeDasharray="1.5 2.5"/>
          );
        })}

        {/* Parent→child solid connector (Senior IC → RFC) */}
        {(() => {
          const par = goals.find(g => g.id === "senior-ic");
          const ch  = goals.find(g => g.id === "rfc");
          return (
            <line x1={par.pos.x} y1={par.pos.y} x2={ch.pos.x} y2={ch.pos.y}
              stroke={color} strokeOpacity="0.55" strokeWidth="1"/>
          );
        })()}

        {/* Gateway medallion (with embedded icon) */}
        <g transform={`translate(${gateway.x} ${gateway.y})`}>
          <circle r="48" fill={color} opacity="0.14" filter="url(#cp-blur-md)"/>
          <circle r="26" fill="#07060A"/>
          <circle r="26" fill="none" stroke={color} strokeWidth="2"/>
          <circle r="22" fill="none" stroke={color} strokeOpacity="0.40" strokeWidth="0.8"/>
          {/* embedded ladder icon (work) */}
          <g transform="translate(-12 -12)">
            <PFThemeIcon theme="work" size={24} color={color} stroke={1.3}/>
          </g>
          <text y="50" textAnchor="middle" fill="rgba(255,255,255,0.96)"
            style={{ font:'italic 500 17px "Lora", serif' }}>
            Work
          </text>
        </g>

        {/* Hubs */}
        {hubs.map(h => (
          <g key={"h-"+h.id} transform={`translate(${h.pos.x} ${h.pos.y})`}>
            <circle r="20" fill={color} opacity="0.14" filter="url(#cp-blur-sm)"/>
            <circle r="8" fill="#0A0911"/>
            <circle r="8" fill="none" stroke={color} strokeWidth="1.4"/>
            <text x="-14" y="3" textAnchor="end" fill="rgba(255,255,255,0.94)"
              style={{ font:'500 12px "Inter", sans-serif' }}>
              {h.name}
            </text>
          </g>
        ))}

        {/* Moment on Career spoke */}
        <g transform={`translate(${momentPos.x} ${momentPos.y})`}>
          <path d={pfDiamond(0,0, 11)} fill={mark} opacity="0.28" filter="url(#cp-blur-sm)"/>
          <path d={pfDiamond(0,0, 4.5)} fill={mark}/>
        </g>

        {/* Goals (hexes) */}
        {goals.map(g => {
          const isComplete = g.state === "complete";
          const isOnHold   = g.state === "onhold";
          const op = isOnHold ? 0.6 : 1;
          const r  = g.parent ? 9 : 11;
          return (
            <g key={"g-"+g.id} transform={`translate(${g.pos.x} ${g.pos.y})`} opacity={op}>
              {!isOnHold && !isComplete && (
                <path d={pfHexTop(0,0, r*1.7)} fill={color} opacity="0.20" filter="url(#cp-blur-sm)"/>
              )}
              <path d={pfHexTop(0,0, r)} fill="#0A0911" stroke={color} strokeWidth="1.4"
                strokeDasharray={isOnHold ? "2 2" : "0"}/>
            </g>
          );
        })}

        {/* Goal labels (inline) */}
        <text x={goals[0].pos.x - 16} y={goals[0].pos.y + 4} textAnchor="end"
          fill="rgba(255,255,255,0.94)" style={{ font:'500 12px "Inter", sans-serif' }}>
          Become senior IC
        </text>
        <text x={goals[1].pos.x - 16} y={goals[1].pos.y + 2} textAnchor="end"
          fill="rgba(255,255,255,0.78)" style={{ font:'400 11.5px "Inter", sans-serif' }}>
          Lead platform RFC
        </text>
        <text x={goals[1].pos.x - 16} y={goals[1].pos.y + 16} textAnchor="end"
          fill="rgba(255,255,255,0.42)" style={{ font:'400 10px "JetBrains Mono", monospace', letterSpacing:"0.06em" }}>
          child of Senior IC
        </text>
        <text x={goals[2].pos.x - 16} y={goals[2].pos.y + 2} textAnchor="end"
          fill="rgba(255,255,255,0.58)" style={{ font:'italic 400 11.5px "Inter", sans-serif' }}>
          Complete CeMAP
        </text>
        <text x={goals[2].pos.x - 16} y={goals[2].pos.y + 16} textAnchor="end"
          fill="rgba(255,255,255,0.32)" style={{ font:'400 10px "JetBrains Mono", monospace', letterSpacing:"0.08em", textTransform:"uppercase" }}>
          on hold
        </text>
        <text x={goals[3].pos.x - 16} y={goals[3].pos.y + 4} textAnchor="end"
          fill="rgba(255,255,255,0.92)" style={{ font:'500 12px "Inter", sans-serif' }}>
          Portfolio v1
        </text>

        {/* Moment label */}
        <text x={momentPos.x + 14} y={momentPos.y - 4}
          fill={mark} style={{ font:'italic 400 12px "Lora", serif' }}>
          "Priya hinted at scope"
        </text>
        <text x={momentPos.x + 14} y={momentPos.y + 10}
          fill="rgba(255,255,255,0.42)" style={{ font:'400 10px "JetBrains Mono", monospace', letterSpacing:"0.06em" }}>
          Mon · moment
        </text>

        {/* Callout dashed lines */}
        {(() => {
          const callouts = [
            { fx: 1085, fy: 90,  ax: trunkSeg.top.x - 10, ay: trunkSeg.top.y + 10 },                 // 01 trunk
            { fx: 920,  fy: 110, ax: 880, ay: 310 },                                                 // 02 limb
            { fx: 600,  fy: 470, ax: gateway.x + 26, ay: gateway.y + 8 },                            // 03 gateway
            { fx: 530,  fy: 580, ax: (gateway.x + hubs[2].pos.x)/2, ay: (gateway.y + hubs[2].pos.y)/2 + 8 }, // 04 spoke
            { fx: 250,  fy: 600, ax: hubs[2].pos.x + 14, ay: hubs[2].pos.y + 8 },                    // 05 hub
            { fx: 90,   fy: 700, ax: hubs[2].pos.x - 70, ay: hubs[2].pos.y + 20 },                   // 06 connector
            { fx: 80,   fy: 80,  ax: goals[0].pos.x - 14, ay: goals[0].pos.y - 14 },                 // 07 goal
            { fx: 870,  fy: 670, ax: momentPos.x + 6, ay: momentPos.y + 10 },                        // 08 moment
          ];
          return (
            <g>
              {callouts.map((cb, i) => (
                <g key={i}>
                  <line x1={cb.fx + 6} y1={cb.fy + 8} x2={cb.ax} y2={cb.ay}
                    stroke="rgba(255,255,255,0.28)" strokeWidth="0.7" strokeDasharray="2 3"/>
                  <circle cx={cb.ax} cy={cb.ay} r="1.8" fill="rgba(255,255,255,0.55)"/>
                </g>
              ))}
            </g>
          );
        })()}
      </svg>

      {/* Callout labels (HTML for type control) */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        {[
          { tag:"01 · Trunk",       desc:"Vertical organic spine. One organism — Mind & Spirit up, Work + Money left, People + Health right.", x: 1080, y: 60,  w: 220 },
          { tag:"02 · Limb",        desc:"Thick Bézier conduit from trunk to gateway. Vascular, theme-tinted glow.",                       x: 870,  y: 82,  w: 220 },
          { tag:"03 · Gateway",     desc:"Medallion at limb tip — ring + embedded icon + serif label.",                                     x: 530,  y: 440, w: 220 },
          { tag:"04 · Spoke",       desc:"Short connective stroke from gateway to a hub. Quieter than the limb.",                           x: 460,  y: 560, w: 220 },
          { tag:"05 · Hub",         desc:"Named domain. Sub-anchor inside the theme.",                                                      x: 100,  y: 580, w: 200 },
          { tag:"06 · Hub conduit", desc:"Faint dotted thread from hub to its goals. Connective, not the conceptual object.",               x: 40,   y: 670, w: 220 },
          { tag:"07 · Goal",        desc:"Pointy-top hex orbiting its hub. Active = bright. On-hold = dashed. Complete = check.",           x: 80,   y: 60,  w: 220 },
          { tag:"08 · Moment",      desc:"Small amber diamond annotated along a spoke. A reflection, not a pursuit.",                       x: 850,  y: 640, w: 220 },
        ].map((a, i) => (
          <div key={i} style={{ position:"absolute", left: a.x, top: a.y, width: a.w }}>
            <div style={{
              font:'500 10.5px "JetBrains Mono", monospace',
              color:"rgba(255,255,255,0.85)",
              letterSpacing:"0.10em", textTransform:"uppercase",
              marginBottom: 4,
            }}>{a.tag}</div>
            <div style={{
              font:'400 11.5px "Inter", sans-serif',
              color:"rgba(255,255,255,0.55)", lineHeight: 1.5,
              textWrap:"pretty",
            }}>{a.desc}</div>
          </div>
        ))}
      </div>

      <div style={{
        position:"absolute", bottom: 22, left: 36, right: 36,
        padding:"14px 18px",
        background:"rgba(255,255,255,0.022)",
        border:"1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        display:"flex", alignItems:"center", gap: 14,
      }}>
        <span style={{
          font:'500 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.14em", textTransform:"uppercase",
        }}>Read aloud</span>
        <span style={{
          flex:1, font:'italic 400 13.5px "Lora", serif',
          color:"rgba(255,255,255,0.78)", lineHeight: 1.5,
        }}>
          Trunk · the centre. Work limb · curving out left. Work gateway · medallion with the ladder icon. Three spokes to three hubs. Each hub gathers its goals. A moment annotates the Career spoke.
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { PFWorkCrop });
