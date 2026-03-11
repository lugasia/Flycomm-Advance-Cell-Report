import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { generateSpectrumData } from "../components/mockData";
import { useAlerts } from "../components/AlertContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { BarChart3 } from "lucide-react";
import moment from "moment";

function WaterfallDisplay({ band }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const initial = [];
    for (let i = 0; i < 30; i++) {
      initial.push({
        time: moment().subtract(30 - i, "minutes").format("HH:mm"),
        data: generateSpectrumData(band, Math.random() > 0.85),
      });
    }
    setRows(initial);
  }, [band]);

  useEffect(() => {
    const iv = setInterval(() => {
      setRows(prev => [
        ...prev.slice(1),
        { time: moment().format("HH:mm"), data: generateSpectrumData(band, Math.random() > 0.85) },
      ]);
    }, 5000);
    return () => clearInterval(iv);
  }, [band]);

  const getColor = (power) => {
    if (power > -40) return "#FF2D55";
    if (power > -60) return "#FFB020";
    if (power > -80) return "#4A9EFF";
    if (power > -100) return "#1e3a5f";
    return "#0A0F1E";
  };

  return (
    <div className="bg-[#0A0F1E] rounded-lg border border-white/[0.06] p-3 overflow-hidden">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] text-slate-500">← Frequency →</span>
        <span className="text-[10px] text-slate-500">Power (dBm)</span>
      </div>
      <div className="flex gap-px">
        <div className="flex flex-col justify-between pr-1 text-[9px] font-mono text-slate-600 py-0.5">
          {rows.filter((_, i) => i % 5 === 0).map(r => (
            <span key={r.time}>{r.time}</span>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {rows.map((row, ri) => (
            <div key={ri} className="flex h-[6px]">
              {row.data.filter((_, di) => di % 3 === 0).map((d, di) => (
                <div key={di} className="flex-1" style={{ backgroundColor: getColor(d.realtime) }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between mt-1 px-6">
        <span className="text-[9px] font-mono text-slate-600">{rows[0]?.data[0]?.frequency || 0} MHz</span>
        <span className="text-[9px] font-mono text-slate-600">{rows[0]?.data[rows[0]?.data.length - 1]?.frequency || 0} MHz</span>
      </div>
      <div className="flex items-center gap-2 mt-2 justify-center">
        {[
          { c: "#0A0F1E", l: "< -100" },
          { c: "#1e3a5f", l: "-100" },
          { c: "#4A9EFF", l: "-80" },
          { c: "#FFB020", l: "-60" },
          { c: "#FF2D55", l: "> -40" },
        ].map(item => (
          <span key={item.l} className="flex items-center gap-1 text-[9px] text-slate-500">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: item.c }} />
            {item.l}
          </span>
        ))}
        <span className="text-[9px] text-slate-600 ml-1">dBm</span>
      </div>
    </div>
  );
}

function ClusterHealthChart({ clusters }) {
  const { alerts } = useAlerts();
  const data = useMemo(() => {
    if (!clusters || clusters.length === 0) return [];
    const hours = [];
    for (let i = 23; i >= 0; i--) {
      const h = moment().subtract(i, "hours");
      const entry = { hour: h.format("HH:00") };
      clusters.forEach(c => {
        const clusterAlerts = alerts.filter(a =>
          a.cluster_id === c.id && moment(a.created_date).isSame(h, "hour")
        ).length;
        entry[c.name] = Math.max(0, 100 - clusterAlerts * 12);
      });
      hours.push(entry);
    }
    return hours;
  }, [alerts, clusters]);

  const colors = ["#4A9EFF", "#00E5A0", "#8B5CF6", "#FFB020", "#FF2D55"];

  if (!clusters || clusters.length === 0) {
    return <p className="text-xs text-slate-600">No clusters configured</p>;
  }

  return (
    <div className="bg-[#0A0F1E] rounded-lg border border-white/[0.06] p-3">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} interval={3} />
          <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: "#141B2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#94A3B8" }}
          />
          {clusters.map((c, i) => (
            <Line key={c.id} type="monotone" dataKey={c.name} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-2">
        {clusters.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2.5 h-[2px] rounded" style={{ backgroundColor: colors[i % colors.length] }} /> {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function SpectrumComparison({ band }) {
  const data = useMemo(() => generateSpectrumData(band, false), [band]);
  return (
    <div className="bg-[#0A0F1E] rounded-lg border border-white/[0.06] p-2">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
          <defs>
            <linearGradient id="compBase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A9EFF" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#4A9EFF" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="compReal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5A0" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#00E5A0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="frequency" tick={{ fontSize: 9, fill: "#475569", fontFamily: "monospace" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "#475569", fontFamily: "monospace" }} tickLine={false} axisLine={false} domain={[-120, -20]} />
          <Tooltip contentStyle={{ background: "#141B2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
          <Area type="monotone" dataKey="baseline" stroke="#4A9EFF" strokeWidth={1} fill="url(#compBase)" isAnimationActive={false} />
          <Area type="monotone" dataKey="realtime" stroke="#00E5A0" strokeWidth={1.5} fill="url(#compReal)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-1 text-[10px]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-blue-500 rounded" /> Baseline</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-emerald-400 rounded" /> Current</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [rsus, setRsus] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedRsu, setSelectedRsu] = useState("");
  const [band, setBand] = useState("cellular");

  useEffect(() => {
    const loadData = async () => {
      const user = await base44.auth.me();
      const orgId = user.organization_id;
      const isSuperAdmin = user.is_super_admin || user.role === 'admin';
      
      const [fetchedRsus, fetchedClusters] = await Promise.all([
        orgId ? base44.entities.RSU.filter({ organization_id: orgId }) : (isSuperAdmin ? base44.entities.RSU.list() : []),
        orgId ? base44.entities.Cluster.filter({ organization_id: orgId }) : (isSuperAdmin ? base44.entities.Cluster.list() : []),
      ]);
      setRsus(fetchedRsus);
      setClusters(fetchedClusters);
      if (fetchedRsus.length > 0) setSelectedRsu(fetchedRsus[0].id);
    };
    loadData();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-400" /> RF Trend Analysis
      </h1>

      {/* Waterfall / Spectrogram */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1629] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Spectrogram (Waterfall)</h3>
          <div className="flex gap-2">
            <Select value={selectedRsu} onValueChange={setSelectedRsu}>
              <SelectTrigger className="w-44 h-7 bg-[#1A2238] border-white/[0.06] text-slate-300 text-[11px]"><SelectValue placeholder="Select RSU" /></SelectTrigger>
              <SelectContent className="bg-[#141B2E] border-white/10">
                {rsus.map(r => <SelectItem key={r.id} value={r.id} className="text-slate-300 text-xs">{r.device_id}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={band} onValueChange={setBand}>
              <SelectTrigger className="w-28 h-7 bg-[#1A2238] border-white/[0.06] text-slate-300 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#141B2E] border-white/10">
                <SelectItem value="cellular" className="text-slate-300 text-xs">Cellular</SelectItem>
                <SelectItem value="wifi" className="text-slate-300 text-xs">Wi-Fi</SelectItem>
                <SelectItem value="gnss" className="text-slate-300 text-xs">GNSS</SelectItem>
                <SelectItem value="full" className="text-slate-300 text-xs">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <WaterfallDisplay band={band} />
      </div>

      {/* Cluster Health */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1629] p-4">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Cluster Health Score (24h)</h3>
        <ClusterHealthChart clusters={clusters} />
      </div>

      {/* Comparative Spectrum */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1629] p-4">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Baseline vs Current Snapshot</h3>
        <SpectrumComparison band={band} />
      </div>
    </div>
  );
}