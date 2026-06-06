// ─── Pathfinder · grammar + hierarchy reference + tokens ─────────────

// ─── Visual hierarchy ladder ─────────────────────────────────────────
function PFHierarchy() {
  // brightness / size / opacity / label-priority / glow ladder
  const rows = [
    { name:"Theme gateway",  size:64, dotR:22, brightness:1.0,  glow:"strong", label:"always",     desc:"Anchor for the life area" },
    { name:"Hub",            size:64, dotR:12, brightness:0.85, glow:"mid",    label:"always",     desc:"Named sub-anchor inside a theme" },
    { name:"Active goal",    size:64, dotR:11, brightness:1.0,  glow:"soft",   label:"on demand",  desc:"Pursuit currently being worked" },
    { name:"On-hold goal",   size:64, dotR:11, brightness:0.55, glow:"none",   label:"on demand",  desc:"Paused. Dashed stroke. Italic copy." },
    { name:"Complete goal",  size:64, dotR:11, brightness:0.55, glow:"none",   label:"on demand",  desc:"Resolved. Filled, internal check." },
    { name:"Moment",         size:64, dotR:5,  brightness:0.85, glow:"soft",   label:"hover",      desc:"Annotation on a spoke. Diamond." },
    { name:"Ambiguous",      size:64, dotR:6,  brightness:0.55, glow:"none",   label:"hover",      desc:"Unresolved. Dashed diamond." },
  ];

  return (
    <div style={{
      width: 720, height: 760,
      background: "#07060A",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.06)",
      padding: "28px 32px 24px",
      position: "relative",
      fontFamily: '"Inter", sans-serif',
      color: "rgba(255,255,255,0.94)",
      overflow: "hidden",
    }}>
      <div style={{ font:'500 19px "Lora", serif', letterSpacing:"0.005em", marginBottom: 4 }}>
        Visual hierarchy
      </div>
      <div style={{ font:'400 12.5px "Inter", sans-serif', color:"rgba(255,255,255,0.55)", marginBottom: 26, maxWidth: 560, lineHeight: 1.55 }}>
        How brightness, size, glow, and label priority cascade. Theme gateway dominates; goals follow; moments hum.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"100px 1fr 90px 90px 90px", columnGap:14, rowGap: 18, alignItems:"center", marginTop: 8 }}>
        <div style={legendH}>Symbol</div>
        <div style={legendH}>Name</div>
        <div style={legendH}>Bright</div>
        <div style={legendH}>Glow</div>
        <div style={legendH}>Label</div>

        {rows.map(r => (
          <React.Fragment key={r.name}>
            <div style={{ width:96, height:48, background:"#0B0A11", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid rgba(255,255,255,0.04)" }}>
              {renderSym(r.name)}
            </div>
            <div>
              <div style={{ font:'500 13px "Inter", sans-serif', color:"rgba(255,255,255,0.94)", marginBottom:2 }}>
                {r.name}
              </div>
              <div style={{ font:'400 11.5px "Inter", sans-serif', color:"rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
                {r.desc}
              </div>
            </div>
            <div style={cellMono(r.brightness === 1 ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.42)")}>
              {Math.round(r.brightness * 100)}%
            </div>
            <div style={cellMono("rgba(255,255,255,0.55)")}>{r.glow}</div>
            <div style={cellMono("rgba(255,255,255,0.55)")}>{r.label}</div>
          </React.Fragment>
        ))}
      </div>

      <div style={{
        position:"absolute", bottom: 24, left: 32, right: 32,
        padding: "12px 16px",
        background: "rgba(255,255,255,0.022)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        font:'italic 400 12.5px "Lora", serif',
        color:"rgba(255,255,255,0.7)", lineHeight: 1.55,
      }}>
        Theme gateway · hub · active/significant goal · normal goal · milestone/moment. Restraint over neon — single-layer bloom, thin luminous strokes, calm dark surfaces.
      </div>
    </div>
  );
}

const legendH = {
  font:'500 10px "JetBrains Mono", monospace',
  color:"rgba(255,255,255,0.42)",
  letterSpacing:"0.14em", textTransform:"uppercase",
};
const cellMono = (color) => ({
  font:'500 11.5px "JetBrains Mono", monospace',
  color, letterSpacing:"0.04em",
});

function renderSym(name) {
  const c = "#EF9F27";
  const mark = "#c9a227";
  if (name === "Theme gateway") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40">
      <circle r="14" fill={c} opacity="0.18"/>
      <circle r="11" fill="#07060A" stroke={c} strokeWidth="1.6"/>
      <circle r="8" fill="none" stroke={c} strokeOpacity="0.4" strokeWidth="0.7"/>
      <line x1="-4" y1="-4" x2="-4" y2="4" stroke={c} strokeWidth="1.1"/>
      <line x1="4" y1="-4" x2="4" y2="4" stroke={c} strokeWidth="1.1"/>
      <line x1="-4" y1="0" x2="4" y2="0" stroke={c} strokeWidth="1.1"/>
    </svg>
  );
  if (name === "Hub") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40">
      <circle r="9" fill={c} opacity="0.18"/>
      <circle r="5" fill="#0A0911" stroke={c} strokeWidth="1.2"/>
    </svg>
  );
  if (name === "Active goal") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40">
      <path d={pfHexTop(0,0,12)} fill={c} opacity="0.18"/>
      <path d={pfHexTop(0,0,8)} fill="#0A0911" stroke={c} strokeWidth="1.3"/>
    </svg>
  );
  if (name === "On-hold goal") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40" opacity="0.6">
      <path d={pfHexTop(0,0,8)} fill="#0A0911" stroke={c} strokeWidth="1.3" strokeDasharray="2 2"/>
    </svg>
  );
  if (name === "Complete goal") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40" opacity="0.62">
      <path d={pfHexTop(0,0,8)} fill="#0A0911" stroke={c} strokeWidth="1.3"/>
      <path d="M-3 0 L-1 2 L4 -3" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (name === "Moment") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40">
      <path d={pfDiamond(0,0,7)} fill={mark} opacity="0.25"/>
      <path d={pfDiamond(0,0,3.5)} fill={mark}/>
    </svg>
  );
  if (name === "Ambiguous") return (
    <svg width="40" height="40" viewBox="-20 -20 40 40">
      <path d={pfDiamond(0,0,6)} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeDasharray="2 2"/>
      <circle r="1.4" fill="rgba(255,255,255,0.5)"/>
    </svg>
  );
  return null;
}

// ─── Design tokens strip ─────────────────────────────────────────────
function PFTokens() {
  return (
    <div style={{
      width: 1180, height: 540,
      background:"#07060A",
      borderRadius: 12,
      border:"1px solid rgba(255,255,255,0.06)",
      padding: 32,
      fontFamily:'"Inter", sans-serif',
      color:"rgba(255,255,255,0.94)",
      position:"relative",
      display:"grid",
      gridTemplateColumns: "1.2fr 1fr 1.1fr",
      gap: 32,
    }}>
      <div style={{
        position:"absolute", top: 32, left: 32, right: 32,
        display:"flex", justifyContent:"space-between", alignItems:"baseline",
        paddingBottom: 14, borderBottom:"1px solid rgba(255,255,255,0.06)",
      }}>
        <div>
          <div style={{ font:'500 19px "Lora", serif', letterSpacing:"0.005em" }}>Design tokens</div>
          <div style={{ font:'400 12.5px "Inter", sans-serif', color:"rgba(255,255,255,0.55)", marginTop: 3 }}>
            Five themes · one mark · serif + sans + mono.
          </div>
        </div>
        <div style={{ font:'500 10.5px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", letterSpacing:"0.16em", textTransform:"uppercase" }}>
          Pathfinder · tokens
        </div>
      </div>

      {/* Themes */}
      <div style={{ paddingTop: 70 }}>
        <div style={legendH}>Themes · 5</div>
        <div style={{ height: 14 }}/>
        {PF_THEME_ORDER.map(tid => {
          const t = PF_THEMES[tid];
          return (
            <div key={tid} style={{ display:"flex", alignItems:"center", gap: 14, marginBottom: 12 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12,
                background: "#0B0A11",
                border:`1.5px solid ${t.color}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                position:"relative",
                boxShadow: `0 0 14px ${t.color}33`,
              }}>
                <PFThemeIcon theme={tid} size={20} color={t.color} stroke={1.3}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ font:'500 13.5px "Inter", sans-serif', color:"rgba(255,255,255,0.94)" }}>
                  {t.name}
                </div>
                <div style={{ font:'400 11px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", marginTop: 2, letterSpacing:"0.04em" }}>
                  {t.color} · {t.short}
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12,
              background:"#0B0A11",
              border:`1.5px solid ${PF_MARK}`,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <svg width="18" height="18" viewBox="-9 -9 18 18">
                <path d={pfDiamond(0,0,7)} fill={PF_MARK}/>
              </svg>
            </div>
            <div>
              <div style={{ font:'500 13.5px "Inter", sans-serif', color:"rgba(255,255,255,0.94)" }}>Timeline moment</div>
              <div style={{ font:'400 11px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", marginTop: 2 }}>
                {PF_MARK} · amber
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Typography */}
      <div style={{ paddingTop: 70 }}>
        <div style={legendH}>Typography</div>
        <div style={{ height: 14 }}/>
        <div style={{ marginBottom: 18 }}>
          <div style={{ font:'500 24px "Lora", serif' }}>Pathfinder</div>
          <div style={{ font:'italic 400 16px "Lora", serif', color:"rgba(255,255,255,0.62)", marginTop: 2 }}>Mind & Spirit</div>
          <div style={{ font:'400 10.5px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", marginTop: 4 }}>
            Lora · wordmark · theme labels · writing surface
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ font:'600 18px "Inter", sans-serif', letterSpacing:"-0.012em" }}>
            Card title — Negotiate promotion
          </div>
          <div style={{ font:'400 14px "Inter", sans-serif', color:"rgba(255,255,255,0.66)", marginTop: 3, lineHeight: 1.5 }}>
            Body — calm, reflective, in the user's register.
          </div>
          <div style={{ font:'400 10.5px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", marginTop: 5 }}>
            Inter · 18/600/-0.012em · 14/400/1.5
          </div>
        </div>
        <div>
          <div style={{ font:'500 11px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.78)", letterSpacing:"0.16em", textTransform:"uppercase" }}>
            17 hubs · 5 themes
          </div>
          <div style={{ font:'400 10.5px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", marginTop: 5 }}>
            JetBrains Mono · captions + metadata
          </div>
        </div>
      </div>

      {/* Card spec */}
      <div style={{ paddingTop: 70 }}>
        <div style={legendH}>Card · single instance</div>
        <div style={{ height: 14 }}/>
        <div style={{
          background:"rgba(255,255,255,0.022)",
          border:"1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: 18,
        }}>
          <div style={{ font:'500 10.5px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", letterSpacing:"0.10em", textTransform:"uppercase", marginBottom: 8 }}>
            New pursuit
          </div>
          <div style={{
            display:"inline-flex", alignItems:"center", gap: 7,
            font:'500 11.5px "Inter", sans-serif', color:"rgba(255,255,255,0.78)",
            background:"rgba(255,255,255,0.035)", border:"1px solid rgba(255,255,255,0.08)",
            padding:"3px 9px 3px 8px", borderRadius: 999, height: 20, marginBottom: 8,
          }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#1D9E75", boxShadow:"0 0 6px #1D9E75" }}/>
            Money · Assets
          </div>
          <div style={{ font:'600 16px "Inter", sans-serif', letterSpacing:"-0.012em", lineHeight:1.25, marginBottom: 5 }}>
            Increase pension to 12%
          </div>
          <div style={{ font:'400 12.5px "Inter", sans-serif', color:"rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 12 }}>
            Open enrolment closes Friday. Theo's been on 12% since January.
          </div>
          <div style={{ display:"flex", gap: 4 }}>
            <div style={{ background:"rgba(255,255,255,0.94)", color:"#0A0911", borderRadius: 8, padding:"6px 12px", font:'500 11.5px "Inter", sans-serif' }}>Confirm</div>
            <div style={{ color:"rgba(255,255,255,0.55)", padding:"6px 10px", font:'500 11.5px "Inter", sans-serif' }}>Skip</div>
          </div>
        </div>
        <div style={{ marginTop: 14, font:'400 11px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", lineHeight: 1.7, letterSpacing:"0.02em" }}>
          <div>max-width · 480 px</div>
          <div>radius · 16</div>
          <div>padding · 26</div>
          <div>border · rgba(255,255,255,0.10)</div>
          <div>fill · rgba(11,10,15,0.84) + blur(20)</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PFHierarchy, PFTokens });
