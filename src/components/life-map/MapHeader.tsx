"use client";

type MapHeaderProps = {
  userName: string;
  activeView: "map" | "timeline";
  onViewChange: (view: "map" | "timeline") => void;
  onAddMoment: () => void;
};

export function MapHeader({ userName, activeView, onViewChange, onAddMoment }: MapHeaderProps) {
  return (
    <div className="ui-overlay" style={{ position: "absolute", top: 16, left: 16, zIndex: 60 }}>
      <button onClick={onAddMoment} style={{ display: "none" }}>
        Add
      </button>
      <button onClick={() => onViewChange(activeView)} style={{ display: "none" }}>
        Toggle
      </button>
      <span style={{ display: "none" }}>{userName}</span>
    </div>
  );
}
