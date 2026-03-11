import React from "react";
import { Marker, Polygon, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Check, X, Undo2, Trash2, Pencil } from "lucide-react";

function vertexIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,0.5);cursor:grab;"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function DrawClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

export function DrawPolygonOverlay({ points, color, onMapClick }) {
  const icon = vertexIcon(color);

  return (
    <>
      <DrawClickHandler onMapClick={onMapClick} />
      {points.length >= 3 && (
        <Polygon
          positions={points.map(p => [p.lat, p.lng])}
          pathOptions={{
            fillColor: color,
            fillOpacity: 0.15,
            color: color,
            weight: 2,
            opacity: 0.8,
          }}
        />
      )}
      {points.length >= 1 && points.length < 3 && (
        // Draw lines between points when < 3
        points.map((p, i) => {
          if (i === 0) return null;
          return (
            <Polygon
              key={`line-${i}`}
              positions={[
                [points[i - 1].lat, points[i - 1].lng],
                [p.lat, p.lng],
              ]}
              pathOptions={{ color, weight: 2, opacity: 0.6, fill: false }}
            />
          );
        })
      )}
      {points.map((p, i) => (
        <Marker key={`vertex-${i}`} position={[p.lat, p.lng]} icon={icon} draggable
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onMapClick(lat, lng, i); // index = replace mode
            }
          }}
        />
      ))}
    </>
  );
}

export function DrawPolygonToolbar({ points, onUndo, onClear, onConfirm, onCancel, clusterName }) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-[#141B2E]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl px-4 py-2.5 flex items-center gap-3">
      <div className="flex items-center gap-2 border-r border-white/10 pr-3">
        <Pencil className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[12px] text-slate-200 font-medium">
          {clusterName ? `Drawing: ${clusterName}` : "Draw Cluster Polygon"}
        </span>
        <span className="text-[10px] text-slate-500 ml-1">({points.length} pts)</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onUndo} disabled={points.length === 0}
        className="h-7 px-2 text-[11px]" style={{ color: "#94a3b8" }}>
        <Undo2 className="w-3.5 h-3.5 mr-1" /> Undo
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={points.length === 0}
        className="h-7 px-2 text-[11px]" style={{ color: "#f87171" }}>
        <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
      </Button>
      <div className="border-l border-white/10 pl-3 flex gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}
          className="h-7 px-3 text-[11px]" style={{ color: "#94a3b8" }}>
          <X className="w-3.5 h-3.5 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={points.length < 3}
          className="h-7 px-3 text-[11px] bg-blue-600 hover:bg-blue-700 text-white">
          <Check className="w-3.5 h-3.5 mr-1" /> Done ({points.length >= 3 ? "save" : "need 3+ pts"})
        </Button>
      </div>
    </div>
  );
}