import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAlerts } from "../AlertContext";
import SeverityBadge from "../spectra/SeverityBadge";
import { Radio, Eye, MapPin, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import moment from "moment";

const FILTER_TABS = ["all", "critical", "high", "medium", "low", "acknowledged"];

export default function AlertStreamPanel({ onFlyTo }) {
  const { alerts, unacknowledgedCount, acknowledgeAlert } = useAlerts();
  const [activeFilter, setActiveFilter] = useState("all");
  const [clusterMap, setClusterMap] = useState({});
  const [rsuMap, setRsuMap] = useState({});

  // Load clusters and RSUs for name resolution
  useEffect(() => {
    const load = async () => {
      const [clusters, rsus] = await Promise.all([
        base44.entities.Cluster.list(),
        base44.entities.RSU.list()
      ]);
      const cMap = {};
      clusters.forEach(c => { cMap[c.id] = c.name; });
      setClusterMap(cMap);
      const rMap = {};
      rsus.forEach(r => { rMap[r.id] = r.device_id; });
      setRsuMap(rMap);
    };
    load();
  }, []);

  // Enrich alerts with cluster_name and device_id if missing
  const enrichedAlerts = useMemo(() => {
    return alerts.map(a => ({
      ...a,
      cluster_name: a.cluster_name || clusterMap[a.cluster_id] || "",
      device_id: a.device_id || rsuMap[a.rsu_id] || "",
    }));
  }, [alerts, clusterMap, rsuMap]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return enrichedAlerts.filter(a => a.status !== "resolved");
    if (activeFilter === "acknowledged") return enrichedAlerts.filter(a => a.status === "acknowledged");
    return enrichedAlerts.filter(a => a.severity === activeFilter && a.status !== "resolved");
  }, [enrichedAlerts, activeFilter]);

  return (
    <div className="flex flex-col h-full bg-[#0F1629] border-r border-white/[0.06]">
      {/* Header */}
      <div className="p-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Live Threat Feed</h2>
          <span className="ml-auto text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded-full">
            {unacknowledgedCount} active
          </span>
        </div>
        {/* Filter Tabs */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors whitespace-nowrap ${
                activeFilter === tab
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "text-slate-500 hover:text-slate-300 border border-transparent"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {filtered.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <AlertCard alert={alert} onFlyTo={onFlyTo} onAcknowledge={acknowledgeAlert} />
            </motion.div>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-slate-600 text-xs">No alerts in this category</div>
        )}
      </div>
    </div>
  );
}

function AlertCard({ alert, onFlyTo, onAcknowledge }) {
  const isAcked = alert.status === "acknowledged";
  const isCritical = alert.severity === "critical";

  return (
    <div className={`p-3 border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] ${
      isCritical && !isAcked ? "border-l-2 border-l-red-500 shadow-[inset_0_0_20px_rgba(255,45,85,0.05)]" : "border-l-2 border-l-transparent"
    } ${isAcked ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between mb-1.5">
        <SeverityBadge severity={alert.severity} />
        <span className="text-[10px] font-mono text-slate-500">
          {moment(alert.timestamp).format("HH:mm:ss")}
        </span>
      </div>
      <p className="text-[13px] font-semibold text-slate-200 mb-1 leading-tight">{alert.type}</p>
      <p className="text-[11px] text-slate-500 mb-0.5">
        <span className="text-slate-400">Cluster:</span> {alert.cluster_name}
      </p>
      <p className="text-[11px] text-slate-500 mb-0.5">
        <span className="text-slate-400">RSU:</span> {alert.device_id}
      </p>
      {alert.deviation_db && (
        <p className="text-[11px] text-slate-500">
          <span className="text-slate-400">Deviation:</span>{" "}
          <span className="font-mono text-amber-400">+{alert.deviation_db} dB</span>
          {alert.affected_band && <span> above baseline in {alert.affected_band}</span>}
        </p>
      )}
      <div className="flex gap-1.5 mt-2">
        {alert.latitude && alert.longitude && (
          <button
            onClick={() => onFlyTo?.(alert)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded hover:bg-blue-500/20 transition-colors"
          >
            <MapPin className="w-3 h-3" /> FLY TO
          </button>
        )}
        {!isAcked && (
          <button
            onClick={() => onAcknowledge?.(alert.id)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-400 bg-white/[0.04] border border-white/[0.08] rounded hover:bg-white/[0.08] transition-colors"
          >
            <Eye className="w-3 h-3" /> ACK
          </button>
        )}
        {isAcked && (
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded">
            <Eye className="w-3 h-3" /> ACKNOWLEDGED
          </span>
        )}
      </div>
    </div>
  );
}