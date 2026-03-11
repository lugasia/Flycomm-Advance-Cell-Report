import React from "react";

const STATUS_COLORS = {
  online: "bg-emerald-400",
  offline: "bg-slate-500",
  error: "bg-red-500",
};

export default function StatusDot({ status, size = "w-2 h-2", showLabel = false, className = "" }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`${size} rounded-full ${color} ${status === "online" ? "shadow-[0_0_6px_rgba(16,185,129,0.6)]" : status === "error" ? "animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" : ""}`} />
      {showLabel && (
        <span className={`text-xs font-medium uppercase tracking-wide ${status === "online" ? "text-emerald-400" : status === "error" ? "text-red-400" : "text-slate-500"}`}>
          {status}
        </span>
      )}
    </span>
  );
}