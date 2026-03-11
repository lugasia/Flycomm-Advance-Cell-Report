import React, { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { generateSpectrumData } from "../mockData";

const BANDS = [
  { key: "cellular", label: "Cellular", range: "700-2700 MHz" },
  { key: "wifi", label: "Wi-Fi", range: "2.4 GHz" },
  { key: "gnss", label: "GNSS", range: "1550-1600 MHz" },
  { key: "full", label: "Full Spectrum", range: "400-3000 MHz" },
];

export default function SpectrumGraph({ rsuId, hasAnomaly = false }) {
  const [band, setBand] = useState("cellular");
  const [data, setData] = useState(() => generateSpectrumData("cellular", hasAnomaly));

  useEffect(() => {
    setData(generateSpectrumData(band, hasAnomaly));
  }, [band, hasAnomaly]);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => prev.map(d => ({
        ...d,
        realtime: parseFloat((d.realtime + (Math.random() - 0.5) * 1.5).toFixed(1)),
      })));
    }, 600);
    return () => clearInterval(interval);
  }, [band]);

  const CustomTooltip = useCallback(({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-[#141B2E] border border-white/10 rounded px-2.5 py-1.5 text-[11px]">
        <p className="font-mono text-slate-300">{d.frequency} MHz</p>
        <p className="text-blue-400">Baseline: <span className="font-mono">{d.baseline} dBm</span></p>
        <p className="text-emerald-400">Real-time: <span className="font-mono">{d.realtime} dBm</span></p>
        {d.realtime - d.baseline > 5 && (
          <p className="text-red-400 font-bold">⚠ Δ {(d.realtime - d.baseline).toFixed(1)} dB</p>
        )}
      </div>
    );
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">RF Spectrum</h3>
        <div className="flex gap-1">
          {BANDS.map(b => (
            <button
              key={b.key}
              onClick={() => setBand(b.key)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                band === b.key ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-slate-500 hover:text-slate-300 border border-transparent"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-[#0A0F1E] rounded-lg border border-white/[0.06] p-2">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
            <defs>
              <linearGradient id="baselineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4A9EFF" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#4A9EFF" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="realtimeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hasAnomaly ? "#FF2D55" : "#00E5A0"} stopOpacity={0.3} />
                <stop offset="100%" stopColor={hasAnomaly ? "#FF2D55" : "#00E5A0"} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="frequency"
              tick={{ fontSize: 9, fill: "#475569", fontFamily: "monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#475569", fontFamily: "monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              domain={[-120, -20]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="baseline"
              stroke="#4A9EFF"
              strokeWidth={1}
              strokeOpacity={0.6}
              fill="url(#baselineGrad)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="realtime"
              stroke={hasAnomaly ? "#FF2D55" : "#00E5A0"}
              strokeWidth={1.5}
              fill="url(#realtimeGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-4 mt-1 text-[10px]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-blue-500 rounded opacity-60" /> Digital Twin Baseline</span>
          <span className="flex items-center gap-1.5"><span className={`w-3 h-[2px] rounded ${hasAnomaly ? "bg-red-500" : "bg-emerald-400"}`} /> Real-Time</span>
        </div>
      </div>
    </div>
  );
}