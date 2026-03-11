import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, X, Plus } from "lucide-react";

export default function ClusterRsuManager({ clusterId, organizationId }) {
  const [allRsus, setAllRsus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      setLoading(true);
      const rsus = await base44.entities.RSU.filter({ organization_id: organizationId });
      setAllRsus(rsus);
      setLoading(false);
    };
    load();
  }, [organizationId]);

  const assignedRsus = allRsus.filter(r => r.cluster_id === clusterId);
  const unassignedRsus = allRsus.filter(r => !r.cluster_id || r.cluster_id === "");

  const handleAssign = async (rsuId) => {
    await base44.entities.RSU.update(rsuId, { cluster_id: clusterId });
    setAllRsus(prev => prev.map(r => r.id === rsuId ? { ...r, cluster_id: clusterId } : r));
  };

  const handleRemove = async (rsuId) => {
    await base44.entities.RSU.update(rsuId, { cluster_id: "" });
    setAllRsus(prev => prev.map(r => r.id === rsuId ? { ...r, cluster_id: "" } : r));
  };

  if (loading) return <p className="text-[11px] text-slate-500">Loading RSUs...</p>;

  return (
    <div>
      <Label className="text-slate-200 font-medium">RSUs in Cluster</Label>
      {assignedRsus.length > 0 ? (
        <div className="mt-1.5 space-y-1 max-h-[120px] overflow-y-auto">
          {assignedRsus.map(rsu => (
            <div key={rsu.id} className="flex items-center justify-between gap-2 bg-[#1A2238] rounded px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Radio className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] text-slate-200 font-mono">{rsu.device_id}</span>
                {rsu.location_name && <span className="text-[10px] text-slate-500">({rsu.location_name})</span>}
              </div>
              <button onClick={() => handleRemove(rsu.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 mt-1">No RSUs assigned</p>
      )}

      {unassignedRsus.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <Select onValueChange={handleAssign}>
            <SelectTrigger className="bg-[#1A2238] border-white/20 text-slate-100 h-7 text-[11px] flex-1">
              <SelectValue placeholder="Add RSU..." />
            </SelectTrigger>
            <SelectContent className="bg-[#0F1629] border-white/20 z-[10001] text-slate-100">
              {unassignedRsus.map(rsu => (
                <SelectItem key={rsu.id} value={rsu.id} className="text-slate-100 text-[11px]">
                  {rsu.device_id} {rsu.location_name ? `(${rsu.location_name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}