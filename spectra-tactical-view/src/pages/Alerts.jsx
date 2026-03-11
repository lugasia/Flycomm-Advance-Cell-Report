import React, { useState, useMemo } from "react";
import { useAlerts } from "../components/AlertContext";
import SeverityBadge from "../components/spectra/SeverityBadge";
import StatCard from "../components/spectra/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle, ShieldAlert, Clock, Zap, Search, Download, Eye, CheckCircle2 } from "lucide-react";
import moment from "moment";

const SEVERITY_COLORS = { critical: "#FF2D55", high: "#FFB020", medium: "#4A9EFF", low: "#475569" };

export default function AlertsPage() {
  const { alerts, acknowledgeAlert, resolveAlert } = useAlerts();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const last24h = alerts.filter(a => moment(a.created_date || a.timestamp).isAfter(moment().subtract(24, "hours")));
    const critActive = alerts.filter(a => a.severity === "critical" && a.status === "active");
    const types = {};
    last24h.forEach(a => { types[a.type] = (types[a.type] || 0) + 1; });
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    return {
      total24h: last24h.length,
      criticalActive: critActive.length,
      avgResponse: "4m 12s",
      topType: topType ? topType[0] : "—",
    };
  }, [alerts]);

  const timeline = useMemo(() => {
    const hours = {};
    for (let i = 23; i >= 0; i--) {
      const h = moment().subtract(i, "hours").format("HH");
      hours[h] = { hour: h + ":00", critical: 0, high: 0, medium: 0, low: 0 };
    }
    alerts.forEach(a => {
      const h = moment(a.created_date || a.timestamp).format("HH");
      if (hours[h]) hours[h][a.severity] = (hours[h][a.severity] || 0) + 1;
    });
    return Object.values(hours);
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      const ms = severityFilter === "all" || a.severity === severityFilter;
      const st = statusFilter === "all" || a.status === statusFilter;
      const sr = !search || a.type.toLowerCase().includes(search.toLowerCase()) || a.device_id?.toLowerCase().includes(search.toLowerCase());
      return ms && st && sr;
    });
  }, [alerts, severityFilter, statusFilter, search]);

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-red-400" /> Alert History & Analytics
      </h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Alerts (24h)" value={stats.total24h} icon={AlertTriangle} accent="blue" />
        <StatCard label="Critical Active" value={stats.criticalActive} icon={Zap} accent="red" />
        <StatCard label="Avg Response Time" value={stats.avgResponse} icon={Clock} accent="amber" />
        <StatCard label="Top Threat Type" value={stats.topType} icon={ShieldAlert} accent="purple" />
      </div>

      {/* Threat Timeline */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1629] p-4">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">24h Threat Timeline</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={timeline} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} interval={2} />
            <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#141B2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#94A3B8" }}
            />
            <Bar dataKey="critical" stackId="a" fill="#FF2D55" radius={[0, 0, 0, 0]} />
            <Bar dataKey="high" stackId="a" fill="#FFB020" />
            <Bar dataKey="medium" stackId="a" fill="#4A9EFF" />
            <Bar dataKey="low" stackId="a" fill="#475569" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input placeholder="Search alerts..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs placeholder:text-slate-600" />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-32 h-8 bg-[#1A2238] border-white/[0.06] text-slate-300 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#141B2E] border-white/10">
            <SelectItem value="all" className="text-slate-300 text-xs">All Severity</SelectItem>
            <SelectItem value="critical" className="text-slate-300 text-xs">Critical</SelectItem>
            <SelectItem value="high" className="text-slate-300 text-xs">High</SelectItem>
            <SelectItem value="medium" className="text-slate-300 text-xs">Medium</SelectItem>
            <SelectItem value="low" className="text-slate-300 text-xs">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 bg-[#1A2238] border-white/[0.06] text-slate-300 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#141B2E] border-white/10">
            <SelectItem value="all" className="text-slate-300 text-xs">All Status</SelectItem>
            <SelectItem value="active" className="text-slate-300 text-xs">Active</SelectItem>
            <SelectItem value="acknowledged" className="text-slate-300 text-xs">Acknowledged</SelectItem>
            <SelectItem value="resolved" className="text-slate-300 text-xs">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto bg-transparent border-white/10 text-slate-300 hover:bg-white/5 text-xs">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export
        </Button>
      </div>

      {/* Alert Table */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#0F1629] border-b border-white/[0.06] hover:bg-[#0F1629]">
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Timestamp</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Severity</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Type</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Cluster</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">RSU</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Confidence</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 50).map((alert, i) => (
              <TableRow key={alert.id} className={`border-b border-white/[0.04] hover:bg-white/[0.03] ${i % 2 === 0 ? "bg-[#0F1629]" : "bg-[#141B2E]"} ${alert.status === "active" && alert.severity === "critical" ? "border-l-2 border-l-red-500" : ""}`}>
                <TableCell className="font-mono text-[11px] text-slate-400">{moment(alert.created_date || alert.timestamp).format("MMM D HH:mm:ss")}</TableCell>
                <TableCell><SeverityBadge severity={alert.severity} /></TableCell>
                <TableCell className="text-xs text-slate-200 font-medium">{alert.type}</TableCell>
                <TableCell className="text-xs text-slate-400">{alert.cluster_name}</TableCell>
                <TableCell className="font-mono text-[11px] text-slate-400">{alert.device_id}</TableCell>
                <TableCell className="font-mono text-[11px] text-slate-300">{alert.confidence}%</TableCell>
                <TableCell>
                  <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                    alert.status === "active" ? "bg-red-500/10 text-red-400" :
                    alert.status === "acknowledged" ? "bg-blue-500/10 text-blue-400" :
                    "bg-emerald-500/10 text-emerald-400"
                  }`}>
                    {alert.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {alert.status === "active" && (
                      <button onClick={() => acknowledgeAlert(alert.id)} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-[10px] font-medium" title="Acknowledge">
                        <Eye className="w-3 h-3" />
                        ACK
                      </button>
                    )}
                    {alert.status !== "resolved" && (
                      <button onClick={() => resolveAlert(alert.id)} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-[10px] font-medium" title="Resolve">
                        <CheckCircle2 className="w-3 h-3" />
                        RESOLVE
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}