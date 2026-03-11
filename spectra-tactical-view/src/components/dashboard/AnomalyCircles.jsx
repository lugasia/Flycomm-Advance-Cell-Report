import React, { useMemo } from "react";
import { Circle, Tooltip } from "react-leaflet";
import { useAlerts } from "../AlertContext";
import moment from "moment";

const SEVERITY_COLORS = {
  critical: "#FF2D55",
  high: "#FF6B35",
  medium: "#FFB020",
  low: "#4A9EFF",
};

// 20-50m radius for detected anomalies
const RADIUS_METERS = 35;

// Generate a stable random offset for each alert based on its id
function hashOffset(id) {
  let hash = 0;
  const str = String(id);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  // Small offset: up to ~5m in any direction (~0.000045 degrees)
  const angle = (hash % 360) * (Math.PI / 180);
  const dist = (((hash >> 8) % 100) / 100) * 0.000045;
  return { dlat: Math.sin(angle) * dist, dlng: Math.cos(angle) * dist };
}

export default function AnomalyCircles({ rsus }) {
  const { alerts } = useAlerts();

  const activeAlerts = useMemo(() => {
    return alerts.filter(a => a.status === "active" && a.latitude && a.longitude);
  }, [alerts]);

  // Build RSU lookup
  const rsuMap = useMemo(() => {
    const map = {};
    rsus.forEach(r => { map[r.id] = r; });
    return map;
  }, [rsus]);

  const circles = useMemo(() => {
    return activeAlerts.map(alert => {
      const lat = parseFloat(alert.latitude);
      const lng = parseFloat(alert.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      // Apply a small random offset so overlapping alerts don't stack perfectly
      const { dlat, dlng } = hashOffset(alert.id);
      const color = SEVERITY_COLORS[alert.severity] || "#4A9EFF";

      return {
        id: alert.id,
        lat: lat + dlat,
        lng: lng + dlng,
        color,
        severity: alert.severity,
        type: alert.type,
        confidence: alert.confidence,
        time: alert.created_date,
        rsuId: alert.rsu_id,
      };
    }).filter(Boolean);
  }, [activeAlerts]);

  if (circles.length === 0) return null;

  return circles.map(c => [
    <Circle
      key={`glow-${c.id}`}
      center={[c.lat, c.lng]}
      radius={RADIUS_METERS + 3}
      pathOptions={{
        fillColor: c.color,
        fillOpacity: 0.08,
        color: c.color,
        weight: 0,
        opacity: 0,
      }}
    />,
    <Circle
      key={`main-${c.id}`}
      center={[c.lat, c.lng]}
      radius={RADIUS_METERS}
      pathOptions={{
        fillColor: c.color,
        fillOpacity: 0.35,
        color: c.color,
        weight: 1.5,
        opacity: 0.7,
      }}
    >
      <Tooltip direction="top" offset={[0, -8]} className="spectra-tooltip">
        <div className="bg-[#141B2E] text-slate-200 px-2.5 py-1.5 rounded border border-white/10 text-[11px] min-w-[140px]">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            <span className="font-bold uppercase text-[10px]" style={{ color: c.color }}>
              {c.severity}
            </span>
          </div>
          <p className="font-medium text-slate-100">{c.type}</p>
          {c.confidence && (
            <p className="text-slate-400 text-[10px]">Confidence: {c.confidence}%</p>
          )}
          <p className="text-slate-500 text-[10px] mt-0.5 font-mono">
            {c.time ? moment(c.time).format("HH:mm:ss") : ""}
          </p>
        </div>
      </Tooltip>
    </Circle>,
  ]);
}