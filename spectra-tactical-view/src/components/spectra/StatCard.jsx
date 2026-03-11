import React from "react";

export default function StatCard({ label, value, icon: Icon, accent = "blue", trend, className = "" }) {
  const accents = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    purple: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  };
  const accentClass = accents[accent] || accents.blue;
  return (
    <div className={`rounded-lg border border-white/[0.06] bg-[#0F1629] p-4 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className={`p-1.5 rounded-md border ${accentClass}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <div className="font-mono text-2xl font-bold text-slate-100 tracking-tight">{value}</div>
      {trend && <p className="text-[11px] text-slate-500 mt-1">{trend}</p>}
    </div>
  );
}