import React, { useState } from "react";
import { Search, Hexagon, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ClusterSearchPanel({ clusters, onFlyToCluster }) {
  const [search, setSearch] = useState("");

  const filtered = clusters.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="absolute top-14 left-3 z-[1000]">
      <div className="bg-[#141B2E]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl w-[220px]">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clusters..."
              className="h-7 pl-7 text-[11px] bg-[#1A2238] border-white/10 text-slate-200 placeholder:text-slate-600"
            />
          </div>
        </div>
        {search && (
          <div className="max-h-[200px] overflow-y-auto border-t border-white/[0.06]">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-slate-500 px-3 py-2">No clusters found</p>
            ) : (
              filtered.map(cluster => (
                <button
                  key={cluster.id}
                  onClick={() => { onFlyToCluster(cluster); setSearch(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-slate-300 hover:bg-white/[0.06] transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cluster.color || '#4A9EFF' }} />
                  <span className="flex-1 text-left truncate">{cluster.name}</span>
                  <Navigation className="w-3 h-3 text-slate-500" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}