import React from "react";

const SEVERITY_CONFIG = {
  critical: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/40", dot: "bg-red-500" },
  high: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/40", dot: "bg-amber-500" },
  medium: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/40", dot: "bg-blue-500" },
  low: { bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/40", dot: "bg-slate-500" },
};

export default function SeverityBadge({ severity, className = "" }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${severity === "critical" ? "animate-pulse" : ""}`} />
      {severity}
    </span>
  );
}

export { SEVERITY_CONFIG };