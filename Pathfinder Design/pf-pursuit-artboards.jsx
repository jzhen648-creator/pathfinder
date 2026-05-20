// ─── Pathfinder · Pursuit panel artboards ────────────────────────────
// Three deliverables:
//   1. PFPursuitInContext — the panel as it appears when clicking a goal
//      on the tree (1440×900 frame, dimmed tree behind, panel on right)
//   2. PFPursuitSpec     — close-up with annotated callouts (1180×900)
//   3. PFPursuitStates   — 3 hero states side-by-side (Active / On-hold / Complete)

// Sample payload — Senior IC (enriched for the design exercise)
const PF_PANEL_SAMPLE = {
  theme: PF_THEMES.work,
  hub: "Career",
  state: "active",
  significance: 4,
  title: "Become senior IC",
  body: "The thread you've been pulling on for two years. About range, not titles — broader scope, harder problems, more leverage.",
  heardOn: "Mar 4",
  quote: "Priya floated 'expanded scope' on Monday and I haven't been able to put it down.",
  milestones: [
    { id:"a", name:"Own the inference review",         date:"this cycle",  done:false },
    { id:"b", name:"Draft impact one-pager",            date:"Mar 12",      done:true  },
    { id:"c", name:"Loop in Marcus for backing",        date:"this month",  done:false },
    { id:"d", name:"Calibration conversation booked",   date:"2 weeks",     done:false },
  ],
  moments: [
    { id:"m1", text:"Priya hinted at expanded scope",          date:"Mon" },
    { id:"m2", text:"Marcus said platform team is hiring",     date:"last week" },
  ],
  children: [
    { id:"rfc",   name:"Lead platform RFC process",  state:"active", role:"child pursuit" },
  ],
  related: [
    { id:"r1", name:"Negotiate promotion",  hub:"Comp",    themeColor:"#EF9F27" },
    { id:"r2", name:"Complete CeMAP",       hub:"Skills",  themeColor:"#EF9F27" },
    { id:"r3", name:"Open Lifetime ISA",    hub:"Assets",  themeColor:"#1D9E75" },
  ],
};

// ─── 1 · In context (over a dimmed tree) ─────────────────────────────
function PFPursuitInContext() {
  return (
    <div style={{
      width: 1440, height: 900,
      background: "#07060A",
      position: "relative", overflow: "hidden",
      fontFamily:'"Inter", sans-serif',
    }}>
      {/* Tree (dimmed) */}
      <div style={{ position:"absolute", inset: 0, opacity: 0.30, pointerEvents:"none" }}>
        <TrunkPoster
          interactive={false}
          selectedHubId="career"
          selectedGoalId="senior-ic"
          showGoalLabels="active"
        />
      </div>

      {/* Top bar (minimal) */}
      <div style={{
        position:"absolute", top: 0, left: 0, right: 0, height: 52,
        display:"flex", alignItems:"center", padding:"0 22px",
        background:"linear-gradient(to bottom, rgba(7,6,10,0.92), rgba(7,6,10,0.4))",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        zIndex: 30,
      }}>
        <div style={{ font:'500 18px "Lora", serif', color:"rgba(255,255,255,0.94)" }}>Pathfinder</div>
        <div style={{ marginLeft: 14, font:'italic 400 13px "Lora", serif', color:"rgba(255,255,255,0.42)" }}>
          life map
        </div>
      </div>

      {/* Panel on right */}
      <div style={{ position:"absolute", top: 80, right: 28, zIndex: 40 }}>
        <PFPursuitPanel data={PF_PANEL_SAMPLE} onClose={() => {}}/>
      </div>

      {/* Caption */}
      <div style={{
        position:"absolute", bottom: 26, left: 32,
        maxWidth: 560,
        padding:"14px 18px",
        background:"rgba(11,10,15,0.66)",
        border:"1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        backdropFilter:"blur(14px)",
        WebkitBackdropFilter:"blur(14px)",
        zIndex: 30,
      }}>
        <div style={{
          font:'500 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.14em", textTransform:"uppercase",
          marginBottom: 6,
        }}>
          Clicked · Work › Career › Become senior IC
        </div>
        <div style={{
          font:'italic 400 13.5px "Lora", serif',
          color:"rgba(255,255,255,0.78)", lineHeight: 1.55,
        }}>
          Tree dims to background; panel slides in from the right edge. Tree stays visible behind — you can see where this pursuit lives, while you read its content.
        </div>
      </div>
    </div>
  );
}

// ─── 2 · Annotated spec ──────────────────────────────────────────────
function PFPursuitSpec() {
  return (
    <div style={{
      width: 1180, height: 900,
      background:"#07060A",
      borderRadius: 12,
      border:"1px solid rgba(255,255,255,0.06)",
      position:"relative", overflow:"hidden",
      fontFamily:'"Inter", sans-serif',
      color:"rgba(255,255,255,0.94)",
    }}>
      {/* Header */}
      <div style={{ position:"absolute", top: 28, left: 36, right: 36 }}>
        <div style={{ font:'500 22px "Lora", serif' }}>Pursuit panel · anatomy</div>
        <div style={{ font:'400 13px "Inter", sans-serif', color:"rgba(255,255,255,0.55)", marginTop: 4, maxWidth: 720, lineHeight:1.5 }}>
          Eight sections. Crumb · hero · provenance · milestones · moments · lineage · related · actions. Same glass system as hub panel — 480 wide, 18 px radius, 28 px blur.
        </div>
      </div>

      {/* The panel itself, centered-ish left */}
      <div style={{ position:"absolute", top: 82, left: 60 }}>
        <PFPursuitPanel data={PF_PANEL_SAMPLE} onClose={() => {}}/>
      </div>

      {/* Annotation callouts on right */}
      <div style={{
        position:"absolute", top: 92, right: 36, width: 380,
        display:"flex", flexDirection:"column", gap: 18,
      }}>
        {[
          { tag:"01 · Crumb", text:"Theme dot · theme › hub › ‘Pursuit’. Same crumb grammar as the hub panel — keeps navigation legible across surfaces." },
          { tag:"02 · State + weight", text:"State chip (active / on hold / done) · significance bar 1-5 segments in theme color. Weight is editable; state is changed via the footer." },
          { tag:"03 · Hero", text:"Hex glyph + title (24 / 600 / -0.018em). Title takes the state's appearance — strike-through if done, dim if on-hold." },
          { tag:"04 · Heard first", text:"The Stream excerpt that originated this pursuit. Italic Lora, amber left-rule. Click to jump back to the moment in the Stream." },
          { tag:"05 · Milestones", text:"Vertical checklist. Theme-colored check on done. Date right-aligned. ‘+ Add’ in section header." },
          { tag:"06 · Moments", text:"Amber-tinted entries — small reflections logged on this pursuit. Distinct from milestones (which are deliverables)." },
          { tag:"07 · Lineage", text:"Parent + child pursuits as linked hexes. State carries through (dashed = on hold, dim = complete)." },
          { tag:"08 · Related", text:"Sibling pursuits the AI thinks are conceptually adjacent. Cross-theme allowed — note Lifetime ISA on Money." },
          { tag:"09 · Actions", text:"Footer · Edit · Pause/Resume · Mark done · Open in Stream (primary). All actions persistent, no overflow menu." },
        ].map((a, i) => (
          <div key={i}>
            <div style={{
              font:'500 10.5px "JetBrains Mono", monospace',
              color:"rgba(255,255,255,0.85)",
              letterSpacing:"0.10em", textTransform:"uppercase",
              marginBottom: 4,
            }}>{a.tag}</div>
            <div style={{
              font:'400 12px "Inter", sans-serif',
              color:"rgba(255,255,255,0.55)", lineHeight: 1.5,
              textWrap:"pretty",
            }}>{a.text}</div>
          </div>
        ))}
      </div>

      {/* Spec strip bottom */}
      <div style={{
        position:"absolute", bottom: 24, left: 36, right: 36,
        padding:"12px 18px",
        background:"rgba(255,255,255,0.018)",
        border:"1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        display:"flex", gap: 28, alignItems:"center",
        font:'400 11px "JetBrains Mono", monospace',
        color:"rgba(255,255,255,0.55)", letterSpacing:"0.04em",
      }}>
        <span><strong style={{ color:"rgba(255,255,255,0.85)", fontWeight: 500 }}>width</strong> · 480 px</span>
        <span><strong style={{ color:"rgba(255,255,255,0.85)", fontWeight: 500 }}>radius</strong> · 18</span>
        <span><strong style={{ color:"rgba(255,255,255,0.85)", fontWeight: 500 }}>border</strong> · rgba(255,255,255,0.08)</span>
        <span><strong style={{ color:"rgba(255,255,255,0.85)", fontWeight: 500 }}>blur</strong> · 28 px · sat 1.1</span>
        <span><strong style={{ color:"rgba(255,255,255,0.85)", fontWeight: 500 }}>title</strong> · 24/600/-0.018em</span>
        <span><strong style={{ color:"rgba(255,255,255,0.85)", fontWeight: 500 }}>body</strong> · 14.5/400/1.55</span>
      </div>
    </div>
  );
}

// ─── 3 · Three states side-by-side ──────────────────────────────────
function PFPursuitStates() {
  // We'll render shorter "hero only" cards for the 3 states side-by-side.
  const states = [
    {
      label: "A · Active · current focus",
      data: { ...PF_PANEL_SAMPLE, state:"active", significance: 4 },
      desc: "Brightest. Body type in full opacity. Open milestones front-and-centre."
    },
    {
      label: "B · On hold · returning later",
      data: {
        ...PF_PANEL_SAMPLE,
        title:"Complete CeMAP qualification",
        hub:"Skills",
        state:"onhold",
        significance: 2,
        body:"Paused since November. The pivot is real, but the studying isn't yet. Will come back when the broker conversations land.",
        heardOn:"Nov 14, 2025",
        quote:"I'm not ready to study yet. I want to feel the pivot first.",
        milestones:[
          { id:"a", name:"Module 1 · UK regulation",      date:"done",       done:true },
          { id:"b", name:"Module 2 · Mortgage law",       date:"on hold",    done:false },
          { id:"c", name:"Module 3 · Practice paper",     date:"on hold",    done:false },
        ],
        moments:[],
        children:[],
        related:[
          { id:"r1", name:"Land first broker role", hub:"Income", themeColor:"#1D9E75" },
        ],
      },
      desc: "Dashed glyph stroke. Body type at 72%. Italic Lora highlights ‘on hold’ tone. Resume primary."
    },
    {
      label: "C · Complete · resolved",
      data: {
        ...PF_PANEL_SAMPLE,
        title:"Ship portfolio website v1",
        hub:"Builds & Launches",
        state:"complete",
        significance: 3,
        body:"Quiet but enabling. The site went live Apr 2 and is now the connective surface across the pivot.",
        heardOn:"Jan 8",
        quote:"I need something to point at. A small site, nothing fancy.",
        milestones:[
          { id:"a", name:"Domain pointed, hosting live", date:"Mar 18", done:true },
          { id:"b", name:"Three case studies",            date:"Mar 28", done:true },
          { id:"c", name:"Soft launch on LinkedIn",       date:"Apr 2",  done:true },
        ],
        moments:[
          { id:"m", text:"First inbound from a real lead", date:"Apr 18" },
        ],
        children:[],
        related:[],
      },
      desc: "Strike-through title. Hex internal check glyph. All milestone boxes filled. Footer swaps the four actions for a quiet ‘Completed Apr 2’ status + Archive."
    },
  ];

  return (
    <div style={{
      width: 1620, height: 920,
      background:"#07060A",
      borderRadius: 12,
      border:"1px solid rgba(255,255,255,0.06)",
      position:"relative", overflow:"hidden",
      fontFamily:'"Inter", sans-serif',
      color:"rgba(255,255,255,0.94)",
      padding: "28px 28px 32px",
    }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ font:'500 22px "Lora", serif' }}>Pursuit states</div>
        <div style={{ font:'400 13px "Inter", sans-serif', color:"rgba(255,255,255,0.55)", marginTop: 4, maxWidth: 720, lineHeight:1.5 }}>
          Same panel, three lives. Active · On hold · Complete.
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 26 }}>
        {states.map((s, i) => (
          <div key={i}>
            <div style={{
              font:'500 10.5px "JetBrains Mono", monospace',
              color:"rgba(255,255,255,0.55)", letterSpacing:"0.14em", textTransform:"uppercase",
              marginBottom: 12,
            }}>{s.label}</div>
            <PFPursuitPanel data={s.data} onClose={() => {}}/>
            <div style={{
              marginTop: 14,
              font:'italic 400 12.5px "Lora", serif',
              color:"rgba(255,255,255,0.55)", lineHeight: 1.55,
              textWrap:"pretty",
              maxWidth: 480,
            }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { PF_PANEL_SAMPLE, PFPursuitInContext, PFPursuitSpec, PFPursuitStates });
