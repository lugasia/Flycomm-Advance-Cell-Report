import React, { useState, useEffect, useRef } from "react";
import { generateSignalMetrics } from "../mockData";
import { LineChart, Line, ResponsiveContainer } from "recharts";

function Sparkline({ dataKey, data, color }) {
  return (
    <div className="w-20 h-5">
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function NetworkMetrics({ rsuStatus = "online" }) {
  const [current, setCurrent] = useState(generateSignalMetrics);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const iv = setInterval(() => {
      const m = generateSignalMetrics();
      setCurrent(m);
      setHistory(prev => [...prev.slice(-19), { latency: m.latency, jitter: m.jitter }]);
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  if (rsuStatus !== "online") {
    return (
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">QoE Network</h3>
        <p className="text-[11px] text-slate-600">N/A</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">QoE Network</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Latency</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-slate-200">{current.latency}ms</span>
            <Sparkline dataKey="latency" data={history} color="#4A9EFF" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Jitter</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-slate-200">{current.jitter}ms</span>
            <Sparkline dataKey="jitter" data={history} color="#8B5CF6" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Packet Loss</span>
          <span className="font-mono text-[13px] text-slate-200">{current.packet_loss}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Throughput</span>
          <span className="font-mono text-[13px] text-slate-200">
            <span className="text-emerald-400">↓</span> {current.throughput_down} Mbps 
            <span className="text-blue-400 ml-2">↑</span> {current.throughput_up} Mbps
          </span>
        </div>
      </div>
    </div>
  );
}