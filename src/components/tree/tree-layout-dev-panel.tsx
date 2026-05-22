"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { signIn, useSession } from "next-auth/react";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import { FLAGS } from "@/lib/flags";
import type { DensityLevel } from "./tree-density";
import type { AreaData } from "./tree-types";
import type { AreaForkSpec } from "./tree-forks";
import {
  buildTreeGeometryExportPayload,
  getDefaultLayoutOverrides,
  parseLayoutOverridesFromJson,
  saveLayoutOverrides,
  type AreaLayoutOverride,
  type LayoutOverrides,
} from "./tree-layout-edit";
import {
  clearAllMomentPositionOverrides,
  clearAreaLayoutOverride,
  distributeAllMomentsEvenly,
  formatLayoutOverrideSummary,
  summarizeLayoutOverrides,
} from "./tree-layout-dev-actions";
import { hasAreaOverride, upsertAreaLayout } from "./tree-view-layout-overrides";
import { TREE_RENDER_STATS_ENABLED } from "./tree-view-constants";

const btnBase: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  fontSize: 13,
  cursor: "pointer",
};

const btnNeutral: CSSProperties = {
  ...btnBase,
  background: "rgba(255,255,255,0.06)",
  color: "#FAFAF9",
};

const btnAccent: CSSProperties = {
  ...btnBase,
  background: "rgba(52, 211, 153, 0.12)",
  color: "#A7F3D0",
};

const sectionBox: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 9px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const DEV_ACCOUNTS = [
  "jeremy@pathfinder.test",
  "alex.carter@pathfinder.test",
  "nelson.mandela@pathfinder.test",
  "fulltree@pathfinder.test",
] as const;

const DEV_ACCOUNT_PASSWORD = "password123";

export type TreeLayoutDevPanelProps = {
  areas: AreaData[];
  allAreasForForkGeometry: AreaData[];
  layoutOverrides: LayoutOverrides;
  setLayoutOverrides: Dispatch<SetStateAction<LayoutOverrides>>;
  resolvedForks: Record<string, AreaForkSpec>;
  layoutEditByAreaId: Record<string, boolean>;
  onToggleAreaLayoutEdit: (areaId: string, enabled: boolean) => void;
  onSetAllLayoutEdit: (enabled: boolean) => void;
  onFocusLimb: (areaId: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

export function TreeLayoutDevPanel({
  areas,
  allAreasForForkGeometry,
  layoutOverrides,
  setLayoutOverrides,
  resolvedForks,
  layoutEditByAreaId,
  onToggleAreaLayoutEdit,
  onSetAllLayoutEdit,
  onFocusLimb,
  collapsed,
  onCollapsedChange,
}: TreeLayoutDevPanelProps) {
  const { data: session } = useSession();
  const geometryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [saveDefaultGeomStatus, setSaveDefaultGeomStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [densityLevel, setDensityLevel] = useState<DensityLevel>(FLAGS.TREE_DENSITY);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const densityLevels: DensityLevel[] = ["MIN", "MED", "EXTENSIVE"];

  const summary = useMemo(
    () => summarizeLayoutOverrides(layoutOverrides, layoutEditByAreaId),
    [layoutOverrides, layoutEditByAreaId],
  );
  const summaryLabel = formatLayoutOverrideSummary(summary);
  const activeAccountEmail = session?.user?.email ?? "not signed in";

  const flashStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimerRef.current != null) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 3200);
  }, []);

  const setTreeDensity = useCallback(
    (level: DensityLevel) => {
      (FLAGS as { TREE_DENSITY: DensityLevel }).TREE_DENSITY = level;
      setDensityLevel(level);
      window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
      flashStatus(`Tree density: ${level}`);
    },
    [flashStatus],
  );

  const switchDevAccount = useCallback(
    async (email: string) => {
      setSwitchingAccount(email);
      try {
        await signIn("credentials", {
          email,
          password: DEV_ACCOUNT_PASSWORD,
          callbackUrl: "/tree",
        });
      } catch {
        flashStatus(`Sign-in failed for ${email}`);
        setSwitchingAccount(null);
      }
    },
    [flashStatus],
  );

  useEffect(() => {
    return () => {
      if (statusTimerRef.current != null) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const importOverrides = useCallback(
    (parsed: unknown): boolean => {
      const ov = parseLayoutOverridesFromJson(parsed);
      if (!ov) {
        flashStatus("Import failed — expected layoutOverrides object");
        console.warn("[tree layout] Import: expected layoutOverrides or export object");
        return false;
      }
      setLayoutOverrides(ov);
      flashStatus(`Imported ${Object.keys(ov).length} area override(s)`);
      return true;
    },
    [flashStatus, setLayoutOverrides],
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        top: TREE_RENDER_STATS_ENABLED ? 52 : 10,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: collapsed ? "8px 10px" : "10px 12px",
        borderRadius: 12,
        background: "rgba(15, 14, 20, 0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
        maxWidth: 420,
        fontSize: 14,
        color: "#E7E5E4",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: "#FBBF24" }}>Map controls</span>
          <span style={{ fontSize: 12, color: "#A8A29E", lineHeight: 1.35 }} title="Press L to toggle panel">
            {summaryLabel}
            {statusMessage ? (
              <span style={{ display: "block", color: "#A7F3D0", marginTop: 2 }}>{statusMessage}</span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={!collapsed ? "tree-layout-dev-panel-body" : undefined}
          onClick={() => onCollapsedChange(!collapsed)}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "#FAFAF9",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed ? (
        <div id="tree-layout-dev-panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              style={btnAccent}
              onClick={() => {
                setLayoutOverrides((prev) => distributeAllMomentsEvenly(areas, prev, allAreasForForkGeometry));
                flashStatus("Distributed timeline marks evenly");
              }}
            >
              Distribute all evenly
            </button>
            <button
              type="button"
              style={btnNeutral}
              onClick={() => {
                setLayoutOverrides((prev) => clearAllMomentPositionOverrides(areas, prev));
                flashStatus("Cleared custom mark positions");
              }}
            >
              Reset all chains
            </button>
          </div>

          <div style={sectionBox}>
            <span style={{ fontSize: 14, color: "#A8A29E", letterSpacing: "0.03em", textTransform: "uppercase" }}>
              Tree density
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {densityLevels.map((level) => {
                const active = densityLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    style={active ? btnAccent : btnNeutral}
                    onClick={() => setTreeDensity(level)}
                    aria-pressed={active}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 12, color: "#A8A29E" }}>{`Active: ${densityLevel}`}</span>
          </div>

          <div style={sectionBox}>
            <span style={{ fontSize: 13, color: "#A8A29E", lineHeight: 1.45 }}>
              Enable <strong style={{ color: "#E7E5E4", fontWeight: 600 }}>Edit layout</strong> per limb to show handles:
              green gateway, blue stem bend, yellow fork, purple rotate, teal bends, orange hubs, cyan marks. Drag on the
              tree; ° rotates the whole limb. Overrides auto-save locally (<kbd style={{ fontSize: 11 }}>L</kbd> toggles
              this panel).
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" style={btnNeutral} onClick={() => onSetAllLayoutEdit(true)}>
                Enable all limbs
              </button>
              <button type="button" style={btnNeutral} onClick={() => onSetAllLayoutEdit(false)}>
                Disable all limbs
              </button>
            </div>
          </div>

          <div style={{ ...sectionBox, maxHeight: 280, overflowY: "auto", gap: 8 }}>
            <span style={{ fontSize: 14, color: "#A8A29E", letterSpacing: "0.03em", textTransform: "uppercase" }}>
              Limb layout
            </span>
            {areas.map((a, limbIdx) => {
              const hasOverride = layoutOverrides[a.id] != null && hasAreaOverride(layoutOverrides[a.id]!);
              return (
                <div
                  key={`limb-layout-${a.id}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingBottom: limbIdx < areas.length - 1 ? 6 : 0,
                    borderBottom: limbIdx < areas.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(layoutEditByAreaId[a.id])}
                        onChange={(e) => onToggleAreaLayoutEdit(a.id, e.target.checked)}
                      />
                      <span style={{ color: "#FAFAF9", fontWeight: 500 }}>{a.label}</span>
                      {hasOverride ? (
                        <span style={{ color: "#FBBF24", fontSize: 11 }} title="Has layout overrides">
                          ●
                        </span>
                      ) : null}
                    </label>
                    <button type="button" title="Pan/zoom to this limb" onClick={() => onFocusLimb(a.id)} style={{ ...btnNeutral, padding: "3px 8px", fontSize: 12 }}>
                      Focus
                    </button>
                    {hasOverride ? (
                      <button
                        type="button"
                        title="Remove all overrides for this limb"
                        onClick={() => {
                          setLayoutOverrides((prev) => clearAreaLayoutOverride(prev, a.id));
                          flashStatus(`Reset ${a.label} overrides`);
                        }}
                        style={{ ...btnNeutral, padding: "3px 8px", fontSize: 12, color: "#FECACA" }}
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  {layoutEditByAreaId[a.id] ? (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 13,
                        paddingLeft: 22,
                      }}
                    >
                      <span style={{ color: "#D6D3D1", flex: 1, minWidth: 0 }}>Limb rotation °</span>
                      <input
                        type="number"
                        step={1}
                        value={layoutOverrides[a.id]?.limbRotateDeg ?? ""}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLayoutOverrides((prev) => {
                            const cur = { ...(prev[a.id] ?? {}) } as AreaLayoutOverride;
                            if (raw === "") delete cur.limbRotateDeg;
                            else {
                              const n = Number(raw);
                              if (!Number.isNaN(n)) cur.limbRotateDeg = n;
                            }
                            return upsertAreaLayout(prev, a.id, cur);
                          });
                        }}
                        style={{
                          width: 72,
                          padding: "4px 6px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: "rgba(0,0,0,0.35)",
                          color: "#FAFAF9",
                          fontSize: 13,
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div style={{ ...sectionBox, gap: 8 }}>
            <span style={{ fontSize: 14, color: "#A8A29E", letterSpacing: "0.03em", textTransform: "uppercase" }}>
              Data and transfer
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                type="button"
                style={btnNeutral}
                onClick={() => {
                  setLayoutOverrides({});
                  saveLayoutOverrides({});
                  flashStatus("Cleared all layout overrides");
                }}
              >
                Reset layout
              </button>
              <button
                type="button"
                style={btnNeutral}
                onClick={async () => {
                  try {
                    const payload = buildTreeGeometryExportPayload(layoutOverrides, resolvedForks);
                    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                    flashStatus("Copied geometry JSON to clipboard");
                  } catch {
                    flashStatus("Copy failed");
                  }
                }}
              >
                Copy geometry
              </button>
              <button
                type="button"
                style={btnNeutral}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    importOverrides(JSON.parse(text) as unknown);
                  } catch (err) {
                    flashStatus("Paste failed — invalid JSON in clipboard");
                    console.warn("[tree layout] Paste import failed", err);
                  }
                }}
              >
                Paste geometry
              </button>
              <input
                ref={geometryFileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const text = await file.text();
                    importOverrides(JSON.parse(text) as unknown);
                  } catch (err) {
                    flashStatus("Import failed");
                    console.warn("[tree layout] Import failed", err);
                  }
                }}
              />
              <button type="button" style={btnNeutral} onClick={() => geometryFileInputRef.current?.click()}>
                Import file…
              </button>
              <button
                type="button"
                style={{ ...btnNeutral, background: "rgba(251, 191, 36, 0.12)", color: "#FDE68A" }}
                onClick={() => {
                  const ov = getDefaultLayoutOverrides();
                  setLayoutOverrides(ov);
                  saveLayoutOverrides(ov);
                  flashStatus("Loaded shipped default geometry");
                }}
              >
                Shipped default
              </button>
              <button
                type="button"
                style={btnAccent}
                onClick={() => {
                  const payload = buildTreeGeometryExportPayload(layoutOverrides, resolvedForks);
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "pathfinder-tree-geometry.json";
                  a.rel = "noopener";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  flashStatus("Downloaded pathfinder-tree-geometry.json");
                }}
              >
                Save geometry
              </button>
              <button
                type="button"
                disabled={saveDefaultGeomStatus === "saving"}
                title="Writes src/data/pathfinder-tree-geometry.json (dev only; sign in required)"
                onClick={async () => {
                  setSaveDefaultGeomStatus("saving");
                  try {
                    const res = await fetch("/api/dev/save-tree-geometry", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(buildTreeGeometryExportPayload(layoutOverrides, resolvedForks)),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(typeof err.error === "string" ? err.error : res.statusText);
                    }
                    setSaveDefaultGeomStatus("ok");
                    flashStatus("Saved as repo default");
                    window.setTimeout(() => setSaveDefaultGeomStatus("idle"), 4000);
                  } catch (err) {
                    console.warn("[tree layout] Save as default failed", err);
                    setSaveDefaultGeomStatus("err");
                    flashStatus("Save as default failed");
                    window.setTimeout(() => setSaveDefaultGeomStatus("idle"), 5000);
                  }
                }}
                style={{
                  ...btnBase,
                  background:
                    saveDefaultGeomStatus === "ok"
                      ? "rgba(52, 211, 153, 0.22)"
                      : saveDefaultGeomStatus === "err"
                        ? "rgba(248, 113, 113, 0.18)"
                        : "rgba(96, 165, 250, 0.14)",
                  color:
                    saveDefaultGeomStatus === "ok"
                      ? "#A7F3D0"
                      : saveDefaultGeomStatus === "err"
                        ? "#FECACA"
                        : "#BFDBFE",
                  cursor: saveDefaultGeomStatus === "saving" ? "wait" : "pointer",
                }}
              >
                {saveDefaultGeomStatus === "saving"
                  ? "Saving…"
                  : saveDefaultGeomStatus === "ok"
                    ? "Saved as default"
                    : saveDefaultGeomStatus === "err"
                      ? "Save failed"
                      : "Save as default"}
              </button>
            </div>
          </div>
          {process.env.NODE_ENV === "development" ? (
            <div style={sectionBox}>
              <span style={{ fontSize: 14, color: "#A8A29E", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                Dev accounts
              </span>
              <span style={{ fontSize: 12, color: "#A8A29E" }}>{`Current: ${activeAccountEmail}`}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {DEV_ACCOUNTS.map((email) => {
                  const active = activeAccountEmail === email;
                  const switching = switchingAccount === email;
                  return (
                    <button
                      key={email}
                      type="button"
                      disabled={switchingAccount != null}
                      style={{
                        ...(active ? btnAccent : btnNeutral),
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        opacity: switchingAccount != null && !switching ? 0.55 : 1,
                        cursor: switchingAccount != null ? "wait" : "pointer",
                      }}
                      onClick={() => void switchDevAccount(email)}
                      aria-pressed={active}
                    >
                      <span>{email}</span>
                      {switching ? <span>Signing in...</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}