import React, { useMemo, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Radio, Clock, Cpu, MapPinned, Pencil } from "lucide-react";
import { useAlerts } from "../AlertContext";
import StatusDot from "../spectra/StatusDot";
import SeverityBadge from "../spectra/SeverityBadge";
import SpectrumGraph from "./SpectrumGraph";
import SignalMetrics from "./SignalMetrics";
import NetworkMetrics from "./NetworkMetrics";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import moment from "moment";
import { motion } from "framer-motion";

export default function RSUDetailPanel({ rsu, onClose, organizationId, isEditing, onEditChange, isAdmin }) {
  const { alerts } = useAlerts();
  const [cluster, setCluster] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [editRsu, setEditRsu] = useState(rsu);
  const [currentRsu, setCurrentRsu] = useState(rsu);

  useEffect(() => {
    const loadClusters = async () => {
      // Super admin sees all clusters, regular users see only their org's clusters
      const allClusters = await base44.entities.Cluster.list();
      setClusters(allClusters);
      if (rsu.cluster_id) {
        const found = allClusters.find(c => c.id === rsu.cluster_id);
        if (found) setCluster(found);
      }
    };
    loadClusters();
  }, [rsu.cluster_id, rsu.organization_id]);

  useEffect(() => {
    setCurrentRsu(rsu);
    setEditRsu(rsu);
  }, [rsu.id]);

  // Subscribe to RSU updates
  useEffect(() => {
    const unsubscribe = base44.entities.RSU.subscribe((event) => {
      if (event.id === rsu.id) {
        setCurrentRsu(event.data);
      }
    });
    return unsubscribe;
  }, [rsu.id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setEditRsu({ ...editRsu, status: newStatus });
      await base44.entities.RSU.update(rsu.id, { status: newStatus });
    } catch (error) {
      console.error("Failed to update RSU status:", error);
    }
  };

  const handleSaveEdit = async () => {
    const updateData = {
      device_id: editRsu.device_id,
      location_name: editRsu.location_name,
      status: editRsu.status,
      cluster_id: editRsu.cluster_id || ""
    };
    await base44.entities.RSU.update(rsu.id, updateData);
    onEditChange(null);
  };
  
  const rsuAlerts = useMemo(() => 
    alerts.filter(a => a.rsu_id === rsu.id).slice(0, 10),
    [alerts, rsu.id]
  );

  const hasActiveAnomaly = rsuAlerts.some(a => a.status === "active" && (a.severity === "critical" || a.severity === "high"));

  const uptimeStr = (() => {
    const h = rsu.uptime_hours || 0;
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return `${d}d ${hr}h`;
  })();

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-[360px] h-full bg-[#0F1629] border-l border-white/[0.06] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400" />
                <h2 className="font-mono text-base font-bold text-slate-100">{currentRsu.device_id}</h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Cluster: <span className="text-slate-300">{cluster?.name || "—"}</span></p>
          </div>
          <div className="flex gap-1">
            {isAdmin && (
              <button onClick={() => onEditChange(isEditing ? null : rsu.id)} className={`p-1 transition-colors ${isEditing ? "text-blue-400" : "text-slate-500 hover:text-blue-400"}`}>
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-2 text-[11px]">
            <StatusDot status={currentRsu.status} showLabel />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />
            <span>Uptime: <span className="font-mono text-slate-200">{uptimeStr}</span></span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Cpu className="w-3 h-3" />
            <span className="font-mono text-slate-300">FW {currentRsu.firmware} | {currentRsu.hardware_rev}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <MapPinned className="w-3 h-3" />
            <span className="font-mono text-slate-300">{currentRsu.latitude?.toFixed(4)}°N {currentRsu.longitude?.toFixed(3)}°E</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Last heartbeat: <span className="font-mono text-slate-300">{currentRsu.last_heartbeat ? moment(currentRsu.last_heartbeat).fromNow() : "—"}</span>
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <SpectrumGraph rsuId={rsu.id} hasAnomaly={hasActiveAnomaly} />
        <SignalMetrics rsuStatus={currentRsu.status} />
        <NetworkMetrics rsuStatus={currentRsu.status} />

        {/* Alert History */}
        <div>
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Alerts</h3>
          {rsuAlerts.length === 0 ? (
            <p className="text-[11px] text-slate-600">No recent alerts</p>
          ) : (
            <div className="space-y-1">
              {rsuAlerts.map(a => (
                <div key={a.id} className="flex items-center gap-2 p-1.5 rounded bg-white/[0.02] text-[10px]">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-slate-300 flex-1 truncate">{a.type}</span>
                  <span className="font-mono text-slate-500">{moment(a.timestamp).format("HH:mm")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Mode Panel */}
      {isEditing && (
        <div className="border-t border-white/[0.06] p-4 space-y-3 flex-shrink-0 bg-blue-500/5">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Edit Location</h3>
          <div className="space-y-2.5">
            <div>
              <Label className="text-[10px] text-slate-400">Device ID</Label>
              <Input
                value={editRsu.device_id}
                onChange={(e) => setEditRsu({ ...editRsu, device_id: e.target.value })}
                className="bg-[#1A2238] border-white/20 text-slate-100 mt-1 h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-slate-400">Location Name</Label>
              <Input
                value={editRsu.location_name || ""}
                onChange={(e) => setEditRsu({ ...editRsu, location_name: e.target.value })}
                placeholder={`${rsu.latitude?.toFixed(4)}, ${rsu.longitude?.toFixed(4)}`}
                className="bg-[#1A2238] border-white/20 text-slate-100 mt-1 h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-slate-400">Status</Label>
              <Select value={editRsu.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="bg-[#1A2238] border-white/20 text-slate-100 mt-1 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0F1629] border-white/20 z-[9999] text-slate-100">
                  <SelectItem value="online" className="text-slate-100 text-xs">Online</SelectItem>
                  <SelectItem value="offline" className="text-slate-100 text-xs">Offline</SelectItem>
                  <SelectItem value="error" className="text-slate-100 text-xs">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-slate-400">Cluster</Label>
              <Select value={editRsu.cluster_id || "__none__"} onValueChange={(val) => setEditRsu({ ...editRsu, cluster_id: val === "__none__" ? "" : val })}>
                <SelectTrigger className="bg-[#1A2238] border-white/20 text-slate-100 mt-1 h-7 text-xs">
                  <SelectValue placeholder="Select cluster" />
                </SelectTrigger>
                <SelectContent className="bg-[#0F1629] border-white/20 z-[9999] text-slate-100">
                  <SelectItem value="__none__" className="text-slate-100 text-xs">None</SelectItem>
                  {clusters.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-slate-100 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color || '#4A9EFF' }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-slate-500 italic">Drag the RSU on the map to change location</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onEditChange(null)} className="flex-1 bg-[#1e293b] border-white/20 text-slate-300 hover:bg-white/10 h-7 text-xs">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 h-7 text-xs">
              Save
            </Button>
          </div>
        </div>
      )}
      </motion.div>
      );
      }