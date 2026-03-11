import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export default function ClusterInfoPopup({ cluster, rsus, alerts, open, onOpenChange, onEdit }) {
  if (!cluster) return null;

  const clusterRsus = rsus.filter(r => r.cluster_id === cluster.id);
  const activeAlerts = alerts.filter(a => a.cluster_id === cluster.id && a.status === "active");
  const onlineCount = clusterRsus.filter(r => r.status === "online").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0F1629] border-white/[0.1] text-slate-100 max-w-sm z-[10000]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cluster.color || "#4A9EFF" }} />
            <DialogTitle className="text-slate-100 text-lg font-bold">{cluster.name}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {cluster.description && (
            <p className="text-[12px] text-slate-400">{cluster.description}</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#1A2238] rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-100">{clusterRsus.length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">RSUs</p>
            </div>
            <div className="bg-[#1A2238] rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-emerald-400">{onlineCount}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Online</p>
            </div>
            <div className="bg-[#1A2238] rounded-lg p-3 text-center">
              <p className={`text-lg font-bold ${activeAlerts.length > 0 ? "text-red-400" : "text-slate-400"}`}>{activeAlerts.length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Alerts</p>
            </div>
          </div>
          {clusterRsus.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">RSUs in cluster</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {clusterRsus.map(rsu => (
                  <div key={rsu.id} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded bg-[#1A2238]/50">
                    <span className={`w-1.5 h-1.5 rounded-full ${rsu.status === "online" ? "bg-emerald-400" : rsu.status === "error" ? "bg-red-400" : "bg-slate-500"}`} />
                    <span className="font-mono text-slate-300">{rsu.device_id}</span>
                    <span className="text-slate-500 ml-auto capitalize">{rsu.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cluster.polygon && cluster.polygon.length >= 3 && (
            <p className="text-[10px] text-slate-500">{cluster.polygon.length} polygon vertices</p>
          )}
        </div>
        {onEdit && (
          <div className="border-t border-white/[0.06] pt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onOpenChange(false); onEdit(cluster); }}
              className="border-slate-500 bg-slate-700 hover:bg-slate-600 text-slate-200 gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              Edit Cluster
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}