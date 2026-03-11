import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Radio, MapPin } from "lucide-react";
import StatusDot from "../spectra/StatusDot";
import moment from "moment";

export default function OrgRsuList({ organizationId, onRsuClick, selectedRsuId }) {
  const [rsus, setRsus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    const loadRsus = async () => {
      try {
        setLoading(true);
        const data = await base44.entities.RSU.filter({ organization_id: organizationId });
        setRsus(data);
      } catch (error) {
        console.error("Failed to load RSUs:", error);
      } finally {
        setLoading(false);
      }
    };
    loadRsus();
  }, [organizationId]);

  return (
    <div className="flex flex-col h-full bg-[#0F1629] border-r border-white/[0.06]">
      <div className="p-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-blue-400" /> RSUs
        </h3>
        <p className="text-[10px] text-slate-500 mt-1">{rsus.length} devices</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 text-xs text-slate-500">Loading...</div>
        ) : rsus.length === 0 ? (
          <div className="p-3 text-xs text-slate-500">No RSUs in this organization</div>
        ) : (
          <div className="space-y-1 p-2">
            {rsus.map(rsu => (
              <button
                key={rsu.id}
                onClick={() => onRsuClick(rsu)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all duration-150 ${
                  selectedRsuId === rsu.id
                    ? "bg-blue-500/10 border-blue-500/30 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]"
                    : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <StatusDot status={rsu.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-mono font-bold text-slate-200 truncate">{rsu.device_id}</p>
                    <p className="text-[10px] text-slate-400 truncate">{rsu.location_name || "—"}</p>
                    <div className="flex items-center gap-1 text-[9px] text-slate-500 mt-1">
                      <MapPin className="w-2.5 h-2.5" />
                      <span className="font-mono">{rsu.latitude?.toFixed(4)}, {rsu.longitude?.toFixed(4)}</span>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-0.5">
                      {rsu.last_heartbeat ? moment(rsu.last_heartbeat).fromNow() : "Never"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}