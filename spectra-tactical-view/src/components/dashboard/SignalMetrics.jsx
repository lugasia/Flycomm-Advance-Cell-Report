import React, { useState, useEffect } from "react";
import { generateSignalMetrics } from "../mockData";

function MetricGauge({ label, value, unit, min, max, status }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const statusColors = {
    good: "bg-emerald-400",
    warning: "bg-amber-400",
    poor: "bg-red-400",
  };
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-500 w-12 text-right">{label}</span>
      <span className="font-mono text-slate-200 w-20 text-right">{value} {unit}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${statusColors[status] || statusColors.good} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] capitalize ${status === "good" ? "text-emerald-400" : status === "warning" ? "text-amber-400" : "text-red-400"}`}>
        {status}
      </span>
    </div>
  );
}

function getStatus(val, goodRange, warnRange) {
  if (val >= goodRange[0] && val <= goodRange[1]) return "good";
  if (val >= warnRange[0] && val <= warnRange[1]) return "warning";
  return "poor";
}

export default function SignalMetrics({ rsuStatus = "online" }) {
  const [metrics, setMetrics] = useState(generateSignalMetrics);

  useEffect(() => {
    const iv = setInterval(() => setMetrics(generateSignalMetrics()), 2000);
    return () => clearInterval(iv);
  }, []);

  if (rsuStatus !== "online") {
    return (
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Signal Quality</h3>
        <p className="text-[11px] text-slate-600">N/A</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Signal Quality</h3>
      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-blue-400 font-medium mb-1.5">Cellular</p>
          <div className="space-y-1.5">
            <MetricGauge label="RSRP" value={metrics.rsrp} unit="dBm" min={-120} max={-60} status={getStatus(metrics.rsrp, [-90, -60], [-105, -90])} />
            <MetricGauge label="RSRQ" value={metrics.rsrq} unit="dB" min={-20} max={-3} status={getStatus(metrics.rsrq, [-12, -3], [-16, -12])} />
            <MetricGauge label="SINR" value={metrics.sinr} unit="dB" min={-5} max={30} status={getStatus(metrics.sinr, [10, 30], [3, 10])} />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-purple-400 font-medium mb-1.5">Wi-Fi (2.4 GHz)</p>
          <MetricGauge label="RSSI" value={metrics.wifi_rssi} unit="dBm" min={-90} max={-30} status={getStatus(metrics.wifi_rssi, [-67, -30], [-75, -67])} />
        </div>
        <div>
          <p className="text-[10px] text-violet-400 font-medium mb-1.5">GNSS</p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white/[0.03] rounded px-2 py-1.5">
              <span className="text-slate-500">Fix:</span> <span className="font-mono text-emerald-400">{metrics.gnss_fix}</span>
            </div>
            <div className="bg-white/[0.03] rounded px-2 py-1.5">
              <span className="text-slate-500">Sats:</span> <span className="font-mono text-slate-200">{metrics.gnss_satellites_visible}/{metrics.gnss_satellites_total}</span>
            </div>
            <div className="bg-white/[0.03] rounded px-2 py-1.5">
              <span className="text-slate-500">HDOP:</span> <span className="font-mono text-slate-200">{metrics.hdop}</span>
            </div>
            <div className="bg-white/[0.03] rounded px-2 py-1.5">
              <span className="text-slate-500">PDOP:</span> <span className="font-mono text-slate-200">{metrics.pdop}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}