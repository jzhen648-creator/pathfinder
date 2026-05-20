// ─── Pathfinder · interactive desktop (poster brief) ─────────────────
// 3 connected states inside one frame:
//   A · Default     · tree poster, minimal chrome
//   B · Hub selected · left panel, hub & branch highlighted
//   C · Stream active · map dimmed, composer + ONE card, preview hex pulsing

const PFIcon = ({ name, size = 14, color = "currentColor", stroke = 1.5 }) => {
  const props = { width:size, height:size, viewBox:"0 0 16 16", fill:"none",
    stroke:color, strokeWidth:stroke, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "close":    return <svg {...props}><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>;
    case "chevron":  return <svg {...props}><path d="M6 4 L10 8 L6 12"/></svg>;
    case "back":     return <svg {...props}><path d="M10 4 L6 8 L10 12"/></svg>;
    case "mic":      return <svg {...props}><rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3.5 8 a4.5 4.5 0 0 0 9 0"/><line x1="8" y1="12.5" x2="8" y2="14.5"/></svg>;
    case "send":     return <svg {...props}><path d="M3 8 L13 8 M9 4 L13 8 L9 12"/></svg>;
    case "plus":     return <svg {...props}><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>;
    case "zoom-in":  return <svg {...props}><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="7" y1="5" x2="7" y2="9"/></svg>;
    case "zoom-out": return <svg {...props}><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/></svg>;
    case "fit":      return <svg {...props}><path d="M3 6 L3 3 L6 3 M10 3 L13 3 L13 6 M13 10 L13 13 L10 13 M6 13 L3 13 L3 10"/></svg>;
    case "check":    return <svg {...props}><path d="M3 8.5 L6.5 12 L13 4.5"/></svg>;
    case "stream":   return <svg {...props}><path d="M3 4 L13 4 M3 8 L11 8 M3 12 L12 12"/></svg>;
    case "diamond":  return <svg {...props}><path d="M8 2 L14 8 L8 14 L2 8 Z"/></svg>;
    default: return null;
  }
};

// ─── Top bar (minimal: wordmark + soft sub-label) ────────────────────
function PFTopBar({ persona }) {
  return (
    <div style={{
      position:"absolute", top:0, left:0, right:0, height: 52,
      display:"flex", alignItems:"center", padding:"0 22px",
      background:"linear-gradient(to bottom, rgba(7,6,10,0.92), rgba(7,6,10,0.5))",
      borderBottom:"1px solid rgba(255,255,255,0.05)",
      backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
      zIndex: 30,
    }}>
      <div style={{ display:"flex", alignItems:"baseline", gap: 14 }}>
        <div style={{ font:'500 19px "Lora", serif', color:"rgba(255,255,255,0.94)", letterSpacing:"0.005em" }}>
          Pathfinder
        </div>
        <div style={{ font:'italic 400 13px "Lora", serif', color:"rgba(255,255,255,0.42)", letterSpacing:"0.005em" }}>
          life map
        </div>
      </div>

      <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
        <div style={{
          display:"flex", alignItems:"center", gap: 14,
          font:'400 11.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)",
          letterSpacing:"0.10em", textTransform:"uppercase",
        }}>
          <span>{PF_THEME_ORDER.length} themes</span>
          <span style={{ color:"rgba(255,255,255,0.18)" }}>·</span>
          <span>{PF_HUBS.length} hubs</span>
          <span style={{ color:"rgba(255,255,255,0.18)" }}>·</span>
          <span>{PF_PURSUITS.length} pursuits</span>
          <span style={{ color:"rgba(255,255,255,0.18)" }}>·</span>
          <span>{PF_AMBIGUOUS.length} unresolved</span>
        </div>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
        <a href="#" style={{
          font:'400 12.5px "Inter", sans-serif',
          color:"rgba(255,255,255,0.55)",
          textDecoration:"none",
          padding:"6px 10px",
        }}>Issues</a>
        <div style={{ width:1, height:14, background:"rgba(255,255,255,0.08)" }}/>
        <div style={{
          display:"flex", alignItems:"center", gap:9,
          padding:"4px 11px 4px 4px",
          borderRadius:999,
          cursor:"pointer",
        }}>
          <div style={{
            width:24, height:24, borderRadius:"50%",
            background:"linear-gradient(135deg, #EF9F27, #D85A30)",
            display:"flex", alignItems:"center", justifyContent:"center",
            font:'500 12px "Inter", sans-serif', color:"#1A1108",
          }}>{persona.initial}</div>
          <span style={{ font:'400 12.5px "Inter", sans-serif', color:"rgba(255,255,255,0.62)" }}>
            {persona.name.split(" ")[0]}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Hub panel (left rail when hub or pursuit selected) ──────────────
function PFHubPanel({ hubId, pursuitId, onClose, onStartStream, onAddMark, onSelectPursuit }) {
  if (!hubId) return null;
  const hub = PF_HUBS.find(h => h.id === hubId);
  const theme = PF_THEMES[hub.theme];
  const pursuits = PF_PURSUITS.filter(p => p.hub === hub.id);
  const sortedPursuits = [...pursuits].sort((a, b) => {
    const order = { active: 0, onhold: 1, complete: 2 };
    return order[a.state] - order[b.state];
  });
  const marks = PF_MARKS.filter(m => m.hub === hubId);
  const selectedPursuit = pursuitId ? pursuits.find(p => p.id === pursuitId) : null;
  const selectedMilestones = selectedPursuit ? PF_MILESTONES.filter(m => m.pursuit === selectedPursuit.id) : [];

  return (
    <div style={{
      position:"absolute", top:52, left:0, bottom:0, width: 360,
      background:"linear-gradient(to right, rgba(11,10,15,0.86), rgba(11,10,15,0.50))",
      borderRight:"1px solid rgba(255,255,255,0.08)",
      backdropFilter:"blur(26px) saturate(1.1)",
      WebkitBackdropFilter:"blur(26px) saturate(1.1)",
      display:"flex", flexDirection:"column",
      zIndex: 25,
    }}>
      {/* Crumb */}
      <div style={{ padding:"18px 24px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{
          display:"flex", alignItems:"center", gap: 9,
          font:'500 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.14em", textTransform:"uppercase",
        }}>
          <span style={{ width:8, height:8, borderRadius:"50%",
            background:"#0B0A11", border:`1px solid ${theme.color}`,
            boxShadow:`0 0 8px ${theme.color}` }}/>
          <span>{theme.name}</span>
          <span style={{ color:"rgba(255,255,255,0.20)" }}>›</span>
          <span style={{ color:"rgba(255,255,255,0.78)" }}>{hub.name}</span>
        </div>
        <button onClick={onClose} style={{
          background:"transparent", border:"none", color:"rgba(255,255,255,0.42)",
          cursor:"pointer", padding:6, borderRadius:6,
        }}><PFIcon name="close" size={13}/></button>
      </div>

      {/* Hub catalog */}
      <div style={{ padding:"4px 24px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <h2 style={{
          margin:"6px 0 10px",
          font:'600 26px "Inter", sans-serif',
          letterSpacing:"-0.022em", lineHeight: 1.15,
          color:"rgba(255,255,255,0.96)",
        }}>{hub.name}</h2>
        <p style={{
          margin:"0 0 16px",
          font:'400 14px "Inter", sans-serif',
          color:"rgba(255,255,255,0.62)", lineHeight: 1.55,
          textWrap:"pretty",
          letterSpacing:"0.001em",
        }}>{hub.about}</p>
        <div style={{ display:"flex", gap: 6 }}>
          <button onClick={onStartStream} style={{
            display:"inline-flex", alignItems:"center", gap: 8,
            background:"rgba(255,255,255,0.94)", color:"#0A0911",
            border:"none", borderRadius: 10, padding:"9px 14px",
            font:'500 13px "Inter", sans-serif', cursor:"pointer",
            letterSpacing:"0.002em",
          }}>
            <PFIcon name="stream" size={13}/>
            Tell me about this
          </button>
          <button onClick={onAddMark} style={{
            display:"inline-flex", alignItems:"center", gap: 7,
            background:"transparent", color:"rgba(255,255,255,0.62)",
            border:"1px solid rgba(255,255,255,0.10)", borderRadius:10,
            padding:"9px 13px",
            font:'500 13px "Inter", sans-serif', cursor:"pointer",
          }}>
            <PFIcon name="diamond" size={11} color={PF_MARK}/>
            Add mark
          </button>
        </div>
      </div>

      {/* Pursuits + marks list */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 24px 24px" }}>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          font:'500 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.16em", textTransform:"uppercase",
          marginBottom: 10,
        }}>
          <span>Pursuits · {pursuits.length}</span>
          <button style={{
            background:"transparent", border:"none", color:"rgba(255,255,255,0.55)",
            cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5,
            font:'500 10.5px "JetBrains Mono", monospace', letterSpacing:"0.10em",
            padding: 0, textTransform:"uppercase",
          }}>
            <PFIcon name="plus" size={11}/> Add
          </button>
        </div>

        {sortedPursuits.length === 0 && (
          <div style={{
            padding:"22px 0",
            font:'italic 400 13.5px "Lora", serif',
            color:"rgba(255,255,255,0.42)",
            textWrap:"pretty", lineHeight: 1.55,
          }}>
            No pursuits on this hub yet. Tell Pathfinder about this part of your life — it'll surface what's there.
          </div>
        )}

        {sortedPursuits.map(p => {
          const isSel = pursuitId === p.id;
          const labelColor = p.state === "active" ? "rgba(255,255,255,0.94)"
                          : p.state === "onhold" ? "rgba(255,255,255,0.55)"
                          : "rgba(255,255,255,0.50)";
          const stateBadge =
            p.state === "active" ? null :
            p.state === "onhold" ? <span style={{
                font:'500 9.5px "JetBrains Mono", monospace',
                color:"rgba(255,255,255,0.40)",
                textTransform:"uppercase", letterSpacing:"0.14em",
                border:"1px solid rgba(255,255,255,0.10)",
                padding:"2px 6px", borderRadius:4,
              }}>on hold</span> :
            p.state === "complete" ? <span style={{
                font:'500 9.5px "JetBrains Mono", monospace',
                color: theme.color,
                textTransform:"uppercase", letterSpacing:"0.14em",
                padding:"2px 0",
              }}>✓ done</span> : null;
          return (
            <div key={p.id}
              onClick={() => onSelectPursuit(p.id)}
              style={{
                padding:"12px 12px",
                marginLeft: -10, marginRight: -10,
                borderRadius: 10,
                background: isSel ? "rgba(255,255,255,0.04)" : "transparent",
                cursor:"pointer",
                marginBottom: 4,
              }}>
              <div style={{ display:"flex", alignItems:"center", gap: 11 }}>
                <svg width="13" height="13" viewBox="-7.5 -7.5 15 15" style={{ flexShrink: 0 }}>
                  <path d={pfHexTop(0,0,5.5)} fill={p.state === "complete" ? theme.color : "transparent"}
                    stroke={theme.color} strokeWidth="1.1"
                    strokeDasharray={p.state === "onhold" ? "1.5 1.5" : "0"}
                    opacity={p.state === "complete" ? 0.7 : 1}/>
                </svg>
                <span style={{
                  flex:1, font:'500 13.5px "Inter", sans-serif',
                  color: labelColor,
                  letterSpacing:"-0.005em",
                  textDecoration: p.state === "complete" ? "line-through" : "none",
                  textDecorationColor: "rgba(255,255,255,0.30)",
                }}>{p.name}</span>
                {stateBadge}
              </div>
              {isSel && p.body && (
                <p style={{
                  margin:"8px 0 0 24px",
                  font:'400 12.5px "Inter", sans-serif',
                  color:"rgba(255,255,255,0.55)", lineHeight: 1.55,
                  textWrap:"pretty",
                }}>{p.body}</p>
              )}
              {isSel && selectedMilestones.length > 0 && (
                <div style={{ marginTop:10, marginLeft:24 }}>
                  {selectedMilestones.map(m => (
                    <div key={m.id} style={{
                      display:"flex", alignItems:"center", gap: 8,
                      padding:"3px 0",
                    }}>
                      <div style={{
                        width: 9, height: 9, borderRadius:"50%",
                        background: m.done ? theme.color : "transparent",
                        border: `1px solid ${theme.color}80`,
                        flexShrink:0,
                      }}/>
                      <span style={{
                        font:'400 12px "Inter", sans-serif',
                        color: m.done ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.78)",
                        textDecoration: m.done ? "line-through" : "none",
                        textDecorationColor: "rgba(255,255,255,0.30)",
                      }}>{m.name}</span>
                      <span style={{
                        marginLeft:"auto",
                        font:'400 10.5px "JetBrains Mono", monospace',
                        color:"rgba(255,255,255,0.32)",
                      }}>{m.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {marks.length > 0 && (
          <>
            <div style={{
              marginTop: 18, marginBottom: 8,
              font:'500 10.5px "JetBrains Mono", monospace',
              color:"rgba(255,255,255,0.42)", letterSpacing:"0.16em", textTransform:"uppercase",
            }}>Marks · {marks.length}</div>
            {marks.map(m => (
              <div key={m.id} style={{
                padding:"10px 12px",
                marginLeft: -10, marginRight: -10,
                borderLeft:`2px solid ${PF_MARK}`,
                paddingLeft: 12,
                marginBottom: 4,
              }}>
                <div style={{ font:'400 13px "Inter", sans-serif', color:"rgba(255,255,255,0.92)", lineHeight: 1.45 }}>
                  {m.text}
                </div>
                <div style={{
                  marginTop: 3,
                  font:'400 10.5px "JetBrains Mono", monospace',
                  color:"rgba(255,255,255,0.42)", letterSpacing:"0.06em",
                }}>{m.date}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Confirmation card (single, max 480) ─────────────────────────────
function PFConfirmCard({ proposal, onConfirm, onSkip }) {
  if (!proposal) return null;
  const theme = PF_THEMES[proposal.themeId];
  const hub = PF_HUBS.find(h => h.id === proposal.hub);
  return (
    <div style={{
      maxWidth: 480, width: "100%",
      background:"rgba(11,10,15,0.84)",
      border:"1px solid rgba(255,255,255,0.10)",
      borderRadius: 16,
      padding: "26px 26px 22px",
      boxShadow:"0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)",
      backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
    }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom: 12,
      }}>
        <div style={{
          display:"inline-flex", alignItems:"center", gap: 8,
          font:'500 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.10em", textTransform:"uppercase",
        }}>
          <span>{proposal.label}</span>
        </div>
        <div style={{
          font:'400 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.32)", letterSpacing:"0.06em",
        }}>
          2 of 4
        </div>
      </div>
      <div style={{
        display:"inline-flex", alignItems:"center", gap: 7,
        font:'500 11.5px "Inter", sans-serif',
        color:"rgba(255,255,255,0.78)",
        background:"rgba(255,255,255,0.035)",
        border:"1px solid rgba(255,255,255,0.10)",
        padding:"4px 11px 4px 9px", borderRadius:999, height: 22,
        marginBottom: 12,
      }}>
        <span style={{ width:7, height:7, borderRadius:"50%",
          background: theme.color, boxShadow:`0 0 7px ${theme.color}` }}/>
        {theme.name}
        <span style={{ color:"rgba(255,255,255,0.32)" }}>· {hub.name}</span>
      </div>
      <h3 style={{
        margin:"6px 0 8px",
        font:'600 20px "Inter", sans-serif',
        letterSpacing:"-0.014em", color:"rgba(255,255,255,0.96)",
        lineHeight: 1.25,
      }}>{proposal.title}</h3>
      <p style={{
        margin:"0 0 18px",
        font:'400 14px "Inter", sans-serif',
        color:"rgba(255,255,255,0.66)", lineHeight: 1.55,
        textWrap:"pretty", letterSpacing:"0.001em",
      }}>{proposal.body}</p>
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <button onClick={onConfirm} style={{
          background:"rgba(255,255,255,0.94)", color:"#0A0911",
          border:"none", borderRadius: 10, padding:"9px 16px",
          font:'500 13px "Inter", sans-serif', cursor:"pointer",
        }}>Confirm</button>
        <button onClick={onSkip} style={{
          background:"transparent", color:"rgba(255,255,255,0.55)",
          border:"none", padding:"9px 14px",
          font:'500 13px "Inter", sans-serif', cursor:"pointer",
        }}>Skip</button>
        <span style={{
          marginLeft:"auto",
          font:'400 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.32)", letterSpacing:"0.06em",
        }}>⌘↵</span>
      </div>
    </div>
  );
}

// ─── Bottom composer (only in stream mode) ───────────────────────────
function PFComposer({ hub, value, onChange }) {
  return (
    <div style={{
      maxWidth: 720, width: "100%",
      background:"rgba(11,10,15,0.86)",
      border:"1px solid rgba(255,255,255,0.14)",
      borderRadius: 18,
      padding: "16px 14px 14px 18px",
      backdropFilter:"blur(22px)",
      WebkitBackdropFilter:"blur(22px)",
      boxShadow:"0 20px 60px rgba(0,0,0,0.55)",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap: 12 }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`What's been happening in ${hub ? hub.name : "Money & Finance"}…`}
          style={{
            flex: 1,
            background:"transparent", border:"none", outline:"none",
            color:"rgba(255,255,255,0.92)",
            font:'400 15px "Lora", serif', lineHeight: 1.6,
            resize:"none",
            minHeight: 110,
            letterSpacing:"0.003em",
          }}/>
        <div style={{ display:"flex", flexDirection:"column", gap: 6, alignItems:"flex-end" }}>
          <button style={{
            width:36, height:36, borderRadius:10,
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.10)",
            color:"rgba(255,255,255,0.62)",
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer",
          }}><PFIcon name="mic" size={15}/></button>
          <button style={{
            width:36, height:36, borderRadius:10,
            background:"rgba(239,159,39,0.14)",
            border:"1px solid rgba(239,159,39,0.34)",
            color:"#EF9F27",
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer",
          }}><PFIcon name="send" size={15}/></button>
        </div>
      </div>
      <div style={{
        marginTop: 8,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        font:'400 10.5px "JetBrains Mono", monospace',
        color:"rgba(255,255,255,0.32)", letterSpacing:"0.08em", textTransform:"uppercase",
      }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap: 8 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"#1D9E75",
            boxShadow:"0 0 6px #1D9E75",
            animation:"pf-pulse 1.8s ease-in-out infinite" }}/>
          Listening · 4 proposals so far
        </span>
        <span>⌘↵ send · ⎋ exit</span>
      </div>
    </div>
  );
}

// ─── State badge (which frame we're in) ──────────────────────────────
function PFStateBadge({ state }) {
  const labels = { default:"A · Default", hub:"B · Hub selected", stream:"C · Stream active" };
  return (
    <div style={{
      position:"absolute", top: 64, right: 22,
      display:"inline-flex", alignItems:"center", gap: 8,
      padding:"4px 10px",
      background:"rgba(11,10,15,0.55)",
      border:"1px solid rgba(255,255,255,0.08)",
      borderRadius: 6,
      font:'500 10.5px "JetBrains Mono", monospace',
      color:"rgba(255,255,255,0.55)", letterSpacing:"0.14em", textTransform:"uppercase",
      backdropFilter:"blur(10px)",
      WebkitBackdropFilter:"blur(10px)",
      zIndex: 26,
    }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.55)" }}/>
      {labels[state]}
    </div>
  );
}

// ─── Main interactive app ────────────────────────────────────────────
function DesktopPathfinder() {
  // state: "default" | "hub" | "stream"
  const [view, setView] = React.useState("hub");
  const [selectedHubId, setSelectedHubId] = React.useState("assets");
  const [selectedPursuitId, setSelectedPursuitId] = React.useState("lisa");
  const [streamText, setStreamText] = React.useState(PF_STREAM);
  const [proposalIndex, setProposalIndex] = React.useState(1);
  const [showCard, setShowCard] = React.useState(true);

  const onHubClick = (hid) => {
    setSelectedHubId(hid);
    setSelectedPursuitId(null);
    setView("hub");
  };
  const onPursuitClick = (pid) => {
    const p = PF_PURSUITS.find(x => x.id === pid);
    if (!p) return;
    setSelectedHubId(p.hub);
    setSelectedPursuitId(pid);
    setView("hub");
  };
  const onGatewayClick = () => { /* could open theme panel — out of scope here */ };
  const onCloseHubPanel = () => {
    setSelectedHubId(null);
    setSelectedPursuitId(null);
    setView("default");
  };
  const onStartStream = () => {
    setView("stream");
    setShowCard(true);
  };
  const onExitStream = () => {
    setView("hub");
  };

  const treeDim = view === "stream" ? 0.65 : 0;

  // Preview hex in stream mode (where the proposal would land)
  const previewHex = view === "stream" && showCard
    ? { hub: PF_PROPOSAL.hub, order: 1 }
    : null;

  return (
    <div style={{
      position:"relative", width:"100%", height:"100%", overflow:"hidden",
      background:"#07060A",
      fontFamily:'"Inter", sans-serif',
    }}>
      {/* Tree (always-on background) */}
      <div style={{
        position:"absolute", top:52, left: 0, right: 0, bottom: 0,
      }}>
        <TrunkPoster
          selectedHubId={selectedHubId}
          selectedGoalId={selectedPursuitId}
          dim={treeDim}
          showStreamPreview={previewHex}
          onHubClick={onHubClick}
          onGoalClick={onPursuitClick}
          onGatewayClick={onGatewayClick}
          showGoalLabels="active"
        />
      </div>

      <PFTopBar persona={PF_PERSONA}/>
      <PFStateBadge state={view}/>

      {view !== "default" && view !== "stream" && (
        <PFHubPanel
          hubId={selectedHubId}
          pursuitId={selectedPursuitId}
          onClose={onCloseHubPanel}
          onStartStream={onStartStream}
          onAddMark={() => {}}
          onSelectPursuit={(pid) => setSelectedPursuitId(pid)}
        />
      )}

      {/* Zoom controls (bottom-left) */}
      {view !== "stream" && (
        <div style={{
          position:"absolute", bottom: 22, left: view === "hub" ? 376 : 22,
          display:"flex", gap: 3,
          background:"rgba(11,10,15,0.65)",
          border:"1px solid rgba(255,255,255,0.08)",
          borderRadius: 8, padding: 4,
          backdropFilter:"blur(12px)",
          WebkitBackdropFilter:"blur(12px)",
          zIndex: 22, transition:"left 240ms ease",
        }}>
          <button style={pfMini}><PFIcon name="zoom-in" size={13}/></button>
          <button style={pfMini}><PFIcon name="zoom-out" size={13}/></button>
          <button style={pfMini}><PFIcon name="fit" size={13}/></button>
        </div>
      )}

      {/* Frame nav (bottom-center) */}
      <div style={{
        position:"absolute", bottom: 22, left: "50%", transform:"translateX(-50%)",
        display:"flex", gap: 6,
        background:"rgba(11,10,15,0.55)",
        border:"1px solid rgba(255,255,255,0.08)",
        borderRadius: 999, padding: 4,
        backdropFilter:"blur(12px)",
        WebkitBackdropFilter:"blur(12px)",
        zIndex: 24,
        pointerEvents: view === "stream" ? "none" : "auto",
        opacity: view === "stream" ? 0.35 : 1,
        transition:"opacity 240ms",
      }}>
        {[
          { id: "default", label: "A · Default" },
          { id: "hub",     label: "B · Hub selected" },
          { id: "stream",  label: "C · Stream active" },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => {
              if (f.id === "stream") onStartStream();
              else if (f.id === "hub") { setSelectedHubId("assets"); setSelectedPursuitId("lisa"); setView("hub"); }
              else { onCloseHubPanel(); }
            }}
            style={{
              padding:"6px 12px",
              background: view === f.id ? "rgba(255,255,255,0.10)" : "transparent",
              border: "none", borderRadius: 999,
              color: view === f.id ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.55)",
              font:'500 11.5px "Inter", sans-serif',
              letterSpacing:"0.01em", cursor:"pointer",
            }}>{f.label}</button>
        ))}
      </div>

      {/* Stream overlay: composer + card */}
      {view === "stream" && (
        <>
          {/* Exit button top-left */}
          <button onClick={onExitStream} style={{
            position:"absolute", top: 68, left: 22,
            display:"flex", alignItems:"center", gap:7,
            background:"rgba(11,10,15,0.6)",
            border:"1px solid rgba(255,255,255,0.10)",
            color:"rgba(255,255,255,0.78)",
            font:'500 12.5px "Inter", sans-serif',
            padding:"7px 12px 7px 9px", borderRadius: 8,
            cursor:"pointer", backdropFilter:"blur(10px)",
            WebkitBackdropFilter:"blur(10px)",
            zIndex: 40,
          }}>
            <PFIcon name="back" size={13}/> Back to map
          </button>

          {/* Card — anchored upper right */}
          {showCard && (
            <div style={{
              position:"absolute", right: 36, top: 110, width: 480,
              zIndex: 35,
            }}>
              <PFConfirmCard
                proposal={PF_PROPOSAL}
                onConfirm={() => { setShowCard(false); /* land on tree */ }}
                onSkip={() => { setShowCard(false); }}
              />
            </div>
          )}

          {/* If card dismissed: brief end state */}
          {!showCard && (
            <div style={{
              position:"absolute", right: 36, top: 130, width: 380,
              padding:"18px 20px",
              background:"rgba(11,10,15,0.7)",
              border:"1px dashed rgba(255,255,255,0.14)",
              borderRadius: 14,
              zIndex: 35,
              font:'italic 400 14px "Lora", serif',
              color:"rgba(255,255,255,0.62)",
              lineHeight: 1.6, textWrap:"pretty",
            }}>
              Landed on Money · Assets. Next proposal in queue: <span style={{ fontStyle:"normal", color:"rgba(255,255,255,0.85)" }}>"Open Lifetime ISA before April"</span> — already on the map. Pathfinder will rejoin in a moment.
            </div>
          )}

          {/* Composer — bottom centre */}
          <div style={{
            position:"absolute", bottom: 28, left:"50%", transform:"translateX(-50%)",
            width:"min(720px, calc(100% - 96px))",
            zIndex: 36,
          }}>
            <PFComposer
              hub={PF_HUBS.find(h => h.id === selectedHubId)}
              value={streamText}
              onChange={setStreamText}
            />
          </div>
        </>
      )}
    </div>
  );
}

const pfMini = {
  width: 26, height: 26, borderRadius: 6,
  background:"transparent", border:"none",
  color:"rgba(255,255,255,0.62)", cursor:"pointer",
  display:"inline-flex", alignItems:"center", justifyContent:"center", padding: 0,
};

Object.assign(window, { DesktopPathfinder, PFConfirmCard, PFComposer, PFHubPanel, PFTopBar, PFIcon });
