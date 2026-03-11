import React, { useState } from "react";
import { Layers, Radio, Hexagon, Eye, EyeOff } from "lucide-react";

export default function MapLayerControl({ showRsus, setShowRsus, showClusters, setShowClusters }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`p-2 rounded-lg border backdrop-blur-md transition-colors ${
          open ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-[#141B2E]/80 border-white/10 text-slate-400 hover:text-slate-200"
        }`}
        title="Map Layers"
      >
        <Layers className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 bg-[#141B2E] border border-white/10 rounded-lg shadow-2xl py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100">
          <p className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Layers</p>
          
          <button
            onClick={() => setShowRsus(!showRsus)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span className="flex-1 text-left">RSUs</span>
            {showRsus ? <Eye className="w-3.5 h-3.5 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
          </button>

          <button
            onClick={() => setShowClusters(!showClusters)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            <Hexagon className="w-3.5 h-3.5 text-blue-400" />
            <span className="flex-1 text-left">Clusters</span>
            {showClusters ? <Eye className="w-3.5 h-3.5 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
          </button>


        </div>
      )}
    </div>
  );
}