import React from "react";
import { Radio, FolderPlus } from "lucide-react";

export default function MapContextMenuPopup({ position, onAddRsu, onAddCluster, onClose }) {
  if (!position) return null;

  return (
    <div
      className="fixed z-[10001] bg-[#141B2E] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
      onMouseLeave={onClose}
    >
      <button
        onClick={() => { onAddRsu(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-200 hover:bg-white/[0.06] transition-colors"
      >
        <Radio className="w-3.5 h-3.5 text-emerald-400" />
        <span>Add RSU Here</span>
      </button>
      <button
        onClick={() => { onAddCluster(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-200 hover:bg-white/[0.06] transition-colors"
      >
        <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
        <span>Add Cluster</span>
      </button>
    </div>
  );
}