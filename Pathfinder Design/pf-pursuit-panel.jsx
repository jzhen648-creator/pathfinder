// ─── Pathfinder · Pursuit side panel ────────────────────────────────
// Opens when a goal/pursuit node is clicked on the tree.
// 480px wide · dark glass · 16px radius · matches Hub panel system.

function PFIconSm({ name, size = 14, color = "currentColor", stroke = 1.4 }) {
  const p = { width:size, height:size, viewBox:"0 0 16 16", fill:"none",
    stroke:color, strokeWidth:stroke, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "close":   return <svg {...p}><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>;
    case "plus":    return <svg {...p}><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>;
    case "check":   return <svg {...p}><path d="M3 8.5 L6.5 12 L13 4.5"/></svg>;
    case "stream":  return <svg {...p}><path d="M3 4 L13 4 M3 8 L11 8 M3 12 L12 12"/></svg>;
    case "edit":    return <svg {...p}><path d="M3 13 L3 10 L11 2 L14 5 L6 13 Z"/></svg>;
    case "pause":   return <svg {...p}><line x1="6" y1="4" x2="6" y2="12"/><line x1="10" y1="4" x2="10" y2="12"/></svg>;
    case "archive": return <svg {...p}><rect x="2" y="3" width="12" height="3"/><rect x="3" y="6" width="10" height="8"/><line x1="6.5" y1="9" x2="9.5" y2="9"/></svg>;
    case "more":    return <svg {...p}><circle cx="3" cy="8" r="0.9" fill="currentColor"/><circle cx="8" cy="8" r="0.9" fill="currentColor"/><circle cx="13" cy="8" r="0.9" fill="currentColor"/></svg>;
    case "spark":   return <svg {...p}><path d="M8 2 L9 6 L13 7 L9 8 L8 12 L7 8 L3 7 L7 6 Z"/></svg>;
    case "quote":   return <svg {...p}><path d="M4 6 L4 11 M3 6 L6 6 M3 11 L6 11 M10 6 L10 11 M9 6 L12 6 M9 11 L12 11" strokeLinecap="round"/></svg>;
    case "link":    return <svg {...p}><path d="M7 9 L9 7 M6 6 a3 3 0 1 1 4 0 L9 7 M10 10 a3 3 0 1 1 -4 0 L7 9"/></svg>;
    default: return null;
  }
}

// Section header
function PFSection({ label, count, action, children }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        font:'500 10.5px "JetBrains Mono", monospace',
        color:"rgba(255,255,255,0.42)", letterSpacing:"0.16em", textTransform:"uppercase",
        marginBottom: 10,
      }}>
        <span>{label}{count != null && <span style={{ color:"rgba(255,255,255,0.28)" }}> · {count}</span>}</span>
        {action && (
          <button style={{
            background:"transparent", border:"none", padding:0,
            color:"rgba(255,255,255,0.55)", cursor:"pointer",
            font:'500 10.5px "JetBrains Mono", monospace',
            letterSpacing:"0.10em", textTransform:"uppercase",
            display:"inline-flex", alignItems:"center", gap:5,
          }}>
            <PFIconSm name="plus" size={11}/> {action}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// Significance bar — 5-segment, theme color
function PFSignificance({ value = 4, color = "#EF9F27" }) {
  return (
    <div style={{ display:"inline-flex", gap: 3, alignItems:"center" }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{
          width: 14, height: 4, borderRadius: 2,
          background: n <= value ? color : "rgba(255,255,255,0.10)",
          boxShadow: n <= value ? `0 0 6px ${color}80` : "none",
        }}/>
      ))}
    </div>
  );
}

function PFStateTabs({ state, color, completedDate }) {
  const tabs = [
    { id: "active",   label: "Active"   },
    { id: "onhold",   label: "On hold"  },
    { id: "complete", label: "Complete" },
  ];
  return (
    <div style={{
      display:"flex", gap: 2,
      padding: 3,
      background:"rgba(255,255,255,0.025)",
      border:"1px solid rgba(255,255,255,0.06)",
      borderRadius: 8,
    }}>
      {tabs.map(t => {
        const isSel = t.id === state;
        return (
          <div key={t.id} style={{
            flex: 1,
            padding:"5px 0",
            textAlign:"center",
            font:'500 11.5px "Inter", sans-serif',
            color: isSel ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.45)",
            background: isSel ? "rgba(255,255,255,0.06)" : "transparent",
            borderRadius: 6,
            position:"relative",
            cursor:"pointer",
            letterSpacing:"0.005em",
          }}>
            {isSel && t.id === "active" && (
              <span style={{
                position:"absolute", left: 8, top:"50%",
                transform:"translateY(-50%)",
                width: 6, height: 6, borderRadius:"50%",
                background: color, boxShadow: `0 0 6px ${color}`,
              }}/>
            )}
            {t.label}
          </div>
        );
      })}
    </div>
  );
}

// ─── The panel ─────────────────────────────────────────────────────
function PFPursuitPanel({ data, onClose, position = "right" }) {
  // `data` shape: { theme, hub, pursuit, state, significance, body,
  //   heardOn, quote, milestones[], moments[], children[], related[] }
  const theme = data.theme;
  const themeColor = theme.color;
  const isOnHold = data.state === "onhold";
  const isComplete = data.state === "complete";

  return (
    <aside style={{
      width: 480,
      background: "linear-gradient(to right, rgba(11,10,15,0.92), rgba(11,10,15,0.78))",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18,
      backdropFilter:"blur(28px) saturate(1.1)",
      WebkitBackdropFilter:"blur(28px) saturate(1.1)",
      boxShadow:"0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)",
      color:"rgba(255,255,255,0.94)",
      fontFamily:'"Inter", sans-serif',
      display:"flex", flexDirection:"column",
      maxHeight: 840,
      overflow:"hidden",
    }}>
      {/* ─── Crumb ─── */}
      <div style={{ padding:"18px 22px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{
          display:"flex", alignItems:"center", gap: 8,
          font:'500 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.14em", textTransform:"uppercase",
          minWidth: 0,
        }}>
          <span style={{
            width:8, height:8, borderRadius:"50%",
            background:"#0B0A11",
            border:`1px solid ${themeColor}`,
            boxShadow:`0 0 8px ${themeColor}`,
            flexShrink:0,
          }}/>
          <span>{theme.short}</span>
          <span style={{ color:"rgba(255,255,255,0.20)" }}>›</span>
          <span style={{ color:"rgba(255,255,255,0.62)" }}>{data.hub}</span>
          <span style={{ color:"rgba(255,255,255,0.20)" }}>›</span>
          <span style={{ color:"rgba(255,255,255,0.85)" }}>Pursuit</span>
        </div>
        <button onClick={onClose} style={{
          background:"transparent", border:"none", color:"rgba(255,255,255,0.42)",
          cursor:"pointer", padding: 6, borderRadius: 6, flexShrink:0,
        }}><PFIconSm name="close" size={13}/></button>
      </div>

      {/* ─── Hero ─── */}
      <div style={{ padding:"4px 22px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        {/* state tabs row */}
        <PFStateTabs state={data.state} color={themeColor}/>
        {/* significance row */}
        <div style={{
          display:"flex", alignItems:"center", gap: 10,
          marginTop: 12, marginBottom: 14,
        }}>
          <span style={{
            font:'500 10.5px "JetBrains Mono", monospace',
            color:"rgba(255,255,255,0.42)", letterSpacing:"0.14em", textTransform:"uppercase",
          }}>Weight</span>
          <PFSignificance value={data.significance} color={themeColor}/>
          <span style={{
            font:'400 10.5px "JetBrains Mono", monospace',
            color:"rgba(255,255,255,0.42)", letterSpacing:"0.06em", marginLeft:"auto",
          }}>{data.significance} of 5</span>
        </div>

        {/* Pursuit hex + title */}
        <div style={{ display:"flex", gap: 14, alignItems:"flex-start" }}>
          <div style={{ flexShrink:0, marginTop: 4 }}>
            <svg width="32" height="32" viewBox="-16 -16 32 32">
              <path d={pfHexTop(0,0,13)} fill={themeColor} opacity="0.18"/>
              <path d={pfHexTop(0,0,9)} fill="#0A0911" stroke={themeColor} strokeWidth="1.4"
                strokeDasharray={isOnHold ? "2 2" : "0"}/>
              {isComplete && <path d="M-3 0 L-1 2 L4 -3" fill="none" stroke={themeColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
          </div>
          <h2 style={{
            margin: 0,
            font:'600 24px "Inter", sans-serif',
            letterSpacing:"-0.018em", lineHeight: 1.18,
            color: isComplete || isOnHold ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.96)",
            textDecoration: isComplete ? "line-through" : "none",
            textDecorationColor: "rgba(255,255,255,0.30)",
            flex: 1,
          }}>{data.title}</h2>
        </div>

        {data.parentName && (
          <div style={{ marginTop: 10, font:'400 12px "Inter", sans-serif', color:"rgba(255,255,255,0.42)" }}>
            nested under <span style={{ color:"rgba(255,255,255,0.78)" }}>{data.parentName}</span>
          </div>
        )}

        {data.body && (
          <p style={{
            margin:"14px 0 0",
            font:'400 14.5px "Inter", sans-serif',
            color: isOnHold ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.66)",
            opacity: isOnHold ? 0.72 : 1,
            lineHeight: 1.55,
            textWrap:"pretty", letterSpacing:"0.001em",
          }}>{data.body}</p>
        )}
      </div>

      {/* ─── Body (scrolls) ─── */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 22px 16px" }}>

        {/* Heard first */}
        {data.quote && (
          <PFSection label="Heard first" action={null}>
            <div style={{
              padding:"12px 14px 12px 16px",
              background:"rgba(255,255,255,0.018)",
              border:"1px solid rgba(255,255,255,0.05)",
              borderLeft:`2px solid ${PF_MARK}`,
              borderRadius: 10,
            }}>
              <div style={{
                font:'italic 400 14px "Lora", serif',
                color:"rgba(255,255,255,0.85)", lineHeight: 1.55,
                textWrap:"pretty",
              }}>
                "{data.quote}"
              </div>
              <div style={{
                marginTop: 7,
                font:'400 10.5px "JetBrains Mono", monospace',
                color:"rgba(255,255,255,0.42)", letterSpacing:"0.06em",
                display:"flex", alignItems:"center", gap: 6,
              }}>
                <PFIconSm name="stream" size={10}/>
                from Stream · {data.heardOn}
              </div>
            </div>
          </PFSection>
        )}

        {/* Milestones */}
        {data.milestones && data.milestones.length > 0 && (
          <PFSection label="Milestones" count={data.milestones.length} action="Add">
            {data.milestones.map(m => (
              <div key={m.id} style={{
                display:"flex", alignItems:"flex-start", gap: 11,
                padding:"8px 0",
                borderBottom:"1px solid rgba(255,255,255,0.04)",
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius:"50%",
                  background: m.done ? themeColor : "transparent",
                  border: m.done ? "none" : `1px solid ${themeColor}80`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  flexShrink: 0, marginTop: 2,
                }}>
                  {m.done && <PFIconSm name="check" size={9} color="#0A0911" stroke={2.2}/>}
                </div>
                <div style={{ flex:1, minWidth: 0 }}>
                  <div style={{
                    font:'400 13.5px "Inter", sans-serif',
                    color: m.done ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.92)",
                    textDecoration: m.done ? "line-through" : "none",
                    textDecorationColor:"rgba(255,255,255,0.20)",
                    lineHeight: 1.4,
                  }}>{m.name}</div>
                </div>
                <div style={{
                  font:'400 10.5px "JetBrains Mono", monospace',
                  color:"rgba(255,255,255,0.42)", letterSpacing:"0.04em",
                  flexShrink:0, marginTop: 3,
                }}>{m.date}</div>
              </div>
            ))}
          </PFSection>
        )}

        {/* Moments */}
        {data.moments && data.moments.length > 0 && (
          <PFSection label="Moments" count={data.moments.length} action="Log">
            {data.moments.map(m => (
              <div key={m.id} style={{
                display:"flex", gap: 11, alignItems:"flex-start",
                padding:"10px 12px 10px 14px",
                marginLeft: -2,
                background:"rgba(201,162,39,0.04)",
                borderLeft:`2px solid ${PF_MARK}`,
                borderRadius:"0 8px 8px 0",
                marginBottom: 6,
              }}>
                <div style={{ flex:1, minWidth: 0 }}>
                  <div style={{
                    font:'400 13.5px "Inter", sans-serif',
                    color:"rgba(255,255,255,0.92)", lineHeight: 1.45,
                    textWrap:"pretty",
                  }}>{m.text}</div>
                  <div style={{
                    marginTop: 3,
                    font:'400 10.5px "JetBrains Mono", monospace',
                    color:"rgba(255,255,255,0.42)", letterSpacing:"0.06em",
                  }}>{m.date}</div>
                </div>
              </div>
            ))}
          </PFSection>
        )}

        {/* Lineage — children + parent */}
        {((data.children && data.children.length) || data.parentName) && (
          <PFSection label="Lineage" count={(data.children || []).length + (data.parentName ? 1 : 0)}>
            {data.parentName && (
              <PFLineageRow name={data.parentName} role="parent" theme={theme}/>
            )}
            {(data.children || []).map(child => (
              <PFLineageRow key={child.id} name={child.name} role={child.role || "child"}
                state={child.state} theme={theme}/>
            ))}
          </PFSection>
        )}

        {/* Related */}
        {data.related && data.related.length > 0 && (
          <PFSection label="Related" count={data.related.length}>
            {data.related.map(r => (
              <div key={r.id} style={{
                display:"flex", alignItems:"center", gap: 10,
                padding:"8px 0",
              }}>
                <svg width="13" height="13" viewBox="-7 -7 14 14" style={{ flexShrink: 0 }}>
                  <path d={pfHexTop(0,0, 5)} fill="none" stroke={r.themeColor || theme.color} strokeWidth="1"/>
                </svg>
                <span style={{ flex:1, font:'400 13px "Inter", sans-serif', color:"rgba(255,255,255,0.85)" }}>
                  {r.name}
                </span>
                <span style={{ font:'400 10.5px "JetBrains Mono", monospace', color:"rgba(255,255,255,0.42)", letterSpacing:"0.04em" }}>
                  {r.hub}
                </span>
              </div>
            ))}
          </PFSection>
        )}
      </div>

      {/* ─── Actions ─── */}
      <div style={{
        padding:"12px 14px",
        borderTop:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(7,6,10,0.4)",
        display:"flex", gap: 4, alignItems:"center",
      }}>
        {isComplete ? (
          <div style={{
            flex:1,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"4px 6px",
          }}>
            <span style={{
              display:"inline-flex", alignItems:"center", gap: 8,
              font:'500 11.5px "JetBrains Mono", monospace',
              color: themeColor, letterSpacing:"0.12em", textTransform:"uppercase",
            }}>
              <PFIconSm name="check" size={12}/>
              Completed {data.completedDate || "—"}
            </span>
            <button style={{
              background:"transparent", border:"none", color:"rgba(255,255,255,0.42)",
              cursor:"pointer", padding:"5px 8px",
              font:'500 11px "Inter", sans-serif',
              display:"inline-flex", alignItems:"center", gap:5,
            }}>
              <PFIconSm name="archive" size={11}/> Archive
            </button>
          </div>
        ) : (
          <>
            <button style={pfBtnGhost}><PFIconSm name="edit" size={12}/> Edit</button>
            <button style={pfBtnGhost}>
              {data.state === "onhold"
                ? <><PFIconSm name="check" size={12}/> Resume</>
                : <><PFIconSm name="pause" size={12}/> Pause</>}
            </button>
            <button style={pfBtnGhost}><PFIconSm name="check" size={12}/> Mark done</button>
            <button style={{ ...pfBtnGhost, marginLeft:"auto" }}>
              <PFIconSm name="stream" size={12}/> Open in Stream
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function PFLineageRow({ name, role, state, theme }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap: 11,
      padding:"9px 12px",
      marginLeft: -8, marginRight: -4,
      borderRadius: 8,
      cursor:"pointer",
    }}>
      <svg width="14" height="14" viewBox="-7.5 -7.5 15 15" style={{ flexShrink: 0 }}>
        <path d={pfHexTop(0,0, 5.5)} fill="none" stroke={theme.color} strokeWidth="1.2"
          strokeDasharray={state === "onhold" ? "1.5 1.5" : "0"}
          opacity={state === "complete" ? 0.6 : 1}/>
      </svg>
      <div style={{ flex:1, minWidth: 0 }}>
        <div style={{ font:'500 13px "Inter", sans-serif', color:"rgba(255,255,255,0.92)" }}>{name}</div>
        <div style={{
          font:'400 10.5px "JetBrains Mono", monospace',
          color:"rgba(255,255,255,0.42)", letterSpacing:"0.06em", marginTop: 1,
        }}>
          {role}{state ? ` · ${state}` : ""}
        </div>
      </div>
    </div>
  );
}

const pfBtnGhost = {
  display:"inline-flex", alignItems:"center", gap: 6,
  background:"transparent", color:"rgba(255,255,255,0.72)",
  border:"1px solid rgba(255,255,255,0.08)", borderRadius: 8,
  padding:"7px 11px",
  font:'500 12px "Inter", sans-serif', cursor:"pointer",
  letterSpacing:"0.002em",
};
const pfBtnSecondary = pfBtnGhost; // alias kept for compat
const pfBtnPrimary = {
  display:"inline-flex", alignItems:"center", gap: 6,
  background:"rgba(255,255,255,0.94)", color:"#0A0911",
  border:"none", borderRadius: 8,
  padding:"7px 12px",
  font:'500 12px "Inter", sans-serif', cursor:"pointer",
};

Object.assign(window, { PFPursuitPanel, PFSignificance, PFStateTabs, PFIconSm });
