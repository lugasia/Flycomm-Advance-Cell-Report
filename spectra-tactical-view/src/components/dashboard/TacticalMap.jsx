import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, Marker, Popup, Polygon, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useAlerts } from "../AlertContext";
import StatusDot from "../spectra/StatusDot";
import SeverityBadge from "../spectra/SeverityBadge";
import { Radio, Satellite, Map } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import AnomalyCircles from "./AnomalyCircles";
import AddClusterDialog from "./AddClusterDialog";
import ClusterEditPopup from "./ClusterEditPopup";
import MapContextMenuPopup from "./MapContextMenuPopup";
import MapLayerControl from "./MapLayerControl";
import ClusterSearchPanel from "./ClusterSearchPanel";
import GeoSearch from "./GeoSearch";
import { DrawPolygonOverlay, DrawPolygonToolbar } from "./DrawPolygonMode";
// ThreeBuildings removed - using Cesium 3D instead
import ClusterInfoPopup from "./ClusterInfoPopup";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
import L from "leaflet";
delete L.Icon.Default.prototype._getIconUrl;

const RSU_ICON_ONLINE = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;position:relative;">
    <div style="position:absolute;inset:0;background:#00E5A0;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);opacity:0.9;"></div>
    <div style="position:absolute;inset:3px;background:#0A0F1E;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);"></div>
    <div style="position:absolute;inset:5px;background:#00E5A0;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);opacity:0.7;"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const RSU_ICON_OFFLINE = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;position:relative;">
    <div style="position:absolute;inset:0;background:#475569;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);opacity:0.6;"></div>
    <div style="position:absolute;inset:3px;background:#0A0F1E;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const RSU_ICON_ERROR = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;position:relative;">
    <div style="position:absolute;inset:0;background:#FF2D55;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);animation:pulse 1.5s ease-in-out infinite;"></div>
    <div style="position:absolute;inset:3px;background:#0A0F1E;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);"></div>
    <div style="position:absolute;inset:5px;background:#FF2D55;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);opacity:0.7;"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function getIcon(status) {
  if (status === "online") return RSU_ICON_ONLINE;
  if (status === "error") return RSU_ICON_ERROR;
  return RSU_ICON_OFFLINE;
}

function FlyToHandler({ flyTarget }) {
  const map = useMap();
  const lastFlyId = useRef(null);
  useEffect(() => {
    if (!flyTarget || flyTarget.id === lastFlyId.current) return;
    lastFlyId.current = flyTarget.id;
    const timer = setTimeout(() => {
      try {
        const container = map.getContainer();
        if (!map || !container || container.clientWidth === 0) return;
        const size = map.getSize();
        if (!size || size.x === 0 || size.y === 0) return;

        if (flyTarget.bounds && flyTarget.bounds.length > 0) {
          // Fly to fit bounds (cluster polygon)
          const leafletBounds = L.latLngBounds(flyTarget.bounds);
          map.flyToBounds(leafletBounds, { padding: [60, 60], duration: 1.5, maxZoom: 17 });
        } else {
          const lat = parseFloat(flyTarget.latitude);
          const lng = parseFloat(flyTarget.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return;
          map.flyTo([lat, lng], flyTarget.zoom || 16, { duration: 1.5 });
        }
      } catch {
        // silently ignore - map may not be ready yet
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [flyTarget, map]);
  return null;
}

// Convex hull (Graham scan)
function convexHull(points) {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function bufferPolygon(hull, bufferDeg, segments = 8) {
  const buffered = [];
  for (let i = 0; i < hull.length; i++) {
    const prev = hull[(i - 1 + hull.length) % hull.length];
    const curr = hull[i];
    const next = hull[(i + 1) % hull.length];
    const a1 = Math.atan2(curr[0] - prev[0], curr[1] - prev[1]);
    const a2 = Math.atan2(next[0] - curr[0], next[1] - curr[1]);
    const n1 = a1 + Math.PI / 2;
    const n2 = a2 + Math.PI / 2;
    let startAngle = n1;
    let endAngle = n2;
    if (endAngle < startAngle) endAngle += 2 * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const angle = startAngle + (endAngle - startAngle) * (s / segments);
      buffered.push([
        curr[0] + bufferDeg * Math.sin(angle),
        curr[1] + bufferDeg * Math.cos(angle),
      ]);
    }
  }
  return buffered;
}

function computeClusterPolygons(clusters, rsus) {
  const BUFFER_DEG = 0.00045;
  return clusters.map(cluster => {
    const clusterRsus = rsus.filter(r => r.cluster_id === cluster.id);

    if (cluster.polygon && Array.isArray(cluster.polygon) && cluster.polygon.length >= 3) {
      const positions = cluster.polygon
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map(p => [p.lat, p.lng]);
      // Ensure polygon is closed
      if (positions.length >= 3) {
        const first = positions[0];
        const last = positions[positions.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          positions.push([...first]);
        }
      }
      return { cluster, rsus: clusterRsus, positions };
    }

    if (clusterRsus.length === 0) return null;
    const validRsus = clusterRsus.filter(r => {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
    });
    if (validRsus.length === 0) return null;
    const rsuPoints = validRsus.map(r => [parseFloat(r.latitude), parseFloat(r.longitude)]);

    if (rsuPoints.length === 1) {
      const [lat, lng] = rsuPoints[0];
      const positions = [];
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * 2 * Math.PI;
        positions.push([lat + BUFFER_DEG * Math.sin(angle), lng + BUFFER_DEG * Math.cos(angle)]);
      }
      return { cluster, rsus: clusterRsus, positions };
    }

    if (rsuPoints.length === 2) {
      const [p1, p2] = rsuPoints;
      const positions = [];
      for (let i = 0; i < 16; i++) {
        const angle = -Math.PI / 2 + (i / 15) * Math.PI;
        const dx = p2[1] - p1[1], dy = p2[0] - p1[0];
        const a = Math.atan2(dy, dx);
        positions.push([p2[0] + BUFFER_DEG * Math.sin(a + angle), p2[1] + BUFFER_DEG * Math.cos(a + angle)]);
      }
      for (let i = 0; i < 16; i++) {
        const angle = Math.PI / 2 + (i / 15) * Math.PI;
        const dx = p2[1] - p1[1], dy = p2[0] - p1[0];
        const a = Math.atan2(dy, dx);
        positions.push([p1[0] + BUFFER_DEG * Math.sin(a + angle), p1[1] + BUFFER_DEG * Math.cos(a + angle)]);
      }
      return { cluster, rsus: clusterRsus, positions };
    }

    const hull = convexHull(rsuPoints);
    const positions = bufferPolygon(hull, BUFFER_DEG);
    return { cluster, rsus: clusterRsus, positions };
  }).filter(Boolean);
}

function MapZoomDisplay({ onZoomChange }) {
  const map = useMap();
  useEffect(() => {
    onZoomChange(map.getZoom());
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    return () => map.off('zoomend', handler);
  }, [map, onZoomChange]);
  return null;
}

function MapContextMenuHandler({ onContextMenu, drawingMode }) {
  useMapEvents({
    contextmenu: (e) => {
      if (drawingMode) return; // Don't show context menu while drawing
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      onContextMenu(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
    },
    click: () => {
      if (!drawingMode) onContextMenu(null);
    }
  });
  return null;
}

export default function TacticalMap({ flyTarget, onRsuClick, selectedRsuId, organizationId, editingRsuId, isAdmin, isSuperAdmin }) {
  const { alerts } = useAlerts();
  const [rsus, setRsus] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [allClusters, setAllClusters] = useState([]); // all clusters for search (super admin)
  const [organizations, setOrganizations] = useState([]);
  const [showRsus, setShowRsus] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [show3DBuildings, setShow3DBuildings] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddClusterDialog, setShowAddClusterDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuLatLng, setContextMenuLatLng] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(13);

  const [mapStyle, setMapStyle] = useState("default"); // "default" | "satellite"

  // Drawing mode state
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [drawingColor, setDrawingColor] = useState("#4A9EFF");
  const [drawnPolygonPoints, setDrawnPolygonPoints] = useState(null);
  
  // Cluster info/edit state
  const [viewingCluster, setViewingCluster] = useState(null); // single click - info
  const [editingCluster, setEditingCluster] = useState(null); // double click - edit
  const [editDrawingForCluster, setEditDrawingForCluster] = useState(null); // cluster id when redrawing polygon for existing cluster
  const clusterClickTimer = useRef(null);
  // Track a "highlighted" cluster from search that may not be in the current org filter
  const [highlightedCluster, setHighlightedCluster] = useState(null);

  const [newRsu, setNewRsu] = useState({
    device_id: "",
    organization_id: "",
    location_name: "",
    latitude: 0,
    longitude: 0,
    status: "online",
    firmware: "",
    hardware_rev: ""
  });

  useEffect(() => {
    const loadData = async () => {
      const [fetchedRsus, fetchedAllClusters, fetchedOrgs] = await Promise.all([
        organizationId 
          ? base44.entities.RSU.filter({ organization_id: organizationId })
          : base44.entities.RSU.list(),
        base44.entities.Cluster.list(),
        base44.entities.Organization.list()
      ]);
      setRsus(fetchedRsus);
      // For map display, filter clusters by org; for search, keep all
      const orgClusters = organizationId 
        ? fetchedAllClusters.filter(c => c.organization_id === organizationId)
        : fetchedAllClusters;
      setClusters(orgClusters);
      setAllClusters(fetchedAllClusters);
      setOrganizations(fetchedOrgs);
    };
    loadData();
  }, [organizationId]);

  useEffect(() => {
    const unsubRsu = base44.entities.RSU.subscribe((event) => {
      if (event.type === 'update') setRsus(prev => prev.map(r => r.id === event.id ? event.data : r));
      else if (event.type === 'create') setRsus(prev => [...prev, event.data]);
      else if (event.type === 'delete') setRsus(prev => prev.filter(r => r.id !== event.id));
    });
    const unsubCluster = base44.entities.Cluster.subscribe((event) => {
      if (event.type === 'update') {
        setClusters(prev => prev.map(c => c.id === event.id ? event.data : c));
        setAllClusters(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === 'create') {
        setClusters(prev => [...prev, event.data]);
        setAllClusters(prev => [...prev, event.data]);
      } else if (event.type === 'delete') {
        setClusters(prev => prev.filter(c => c.id !== event.id));
        setAllClusters(prev => prev.filter(c => c.id !== event.id));
      }
    });
    return () => { unsubRsu(); unsubCluster(); };
  }, []);

  // Merge highlighted cluster into clusters for polygon rendering
  const displayClusters = useMemo(() => {
    if (!highlightedCluster || clusters.some(c => c.id === highlightedCluster.id)) return clusters;
    return [...clusters, highlightedCluster];
  }, [clusters, highlightedCluster]);

  const polygons = useMemo(() => computeClusterPolygons(displayClusters, rsus), [displayClusters, rsus]);

  const getClusterActiveAlerts = useCallback((clusterId) => {
    return alerts.filter(a => a.cluster_id === clusterId && a.status === "active");
  }, [alerts]);

  const handleAddRsu = useCallback((lat, lng) => {
    setNewRsu({
      device_id: "",
      organization_id: organizationId || "",
      cluster_id: "",
      location_name: "",
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lng.toFixed(6)),
      status: "online",
      firmware: "",
      hardware_rev: ""
    });
    setShowAddDialog(true);
  }, [organizationId]);

  const handleCreateRsu = async () => {
    if (!newRsu.device_id || !newRsu.organization_id) {
      alert("Device ID and Organization are required");
      return;
    }
    const created = await base44.entities.RSU.create(newRsu);
    setRsus(prev => [...prev, created]);
    setShowAddDialog(false);
  };

  const handleRsuDragEnd = async (rsu, newLat, newLng) => {
    if (editingRsuId !== rsu.id) return;
    await base44.entities.RSU.update(rsu.id, {
      latitude: parseFloat(newLat.toFixed(6)),
      longitude: parseFloat(newLng.toFixed(6))
    });
    setRsus(prev => prev.map(r => 
      r.id === rsu.id ? { ...r, latitude: newLat, longitude: newLng } : r
    ));
  };

  const mapCenter = useMemo(() => {
    if (rsus.length === 0) return [32.075, 34.775];
    const validRsus = rsus.filter(r => {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    });
    if (validRsus.length === 0) return [32.075, 34.775];
    const avgLat = validRsus.reduce((sum, r) => sum + parseFloat(r.latitude), 0) / validRsus.length;
    const avgLng = validRsus.reduce((sum, r) => sum + parseFloat(r.longitude), 0) / validRsus.length;
    return [avgLat, avgLng];
  }, [rsus]);

  // --- Drawing mode handlers ---
  const startDrawing = useCallback((color) => {
    setDrawingMode(true);
    setDrawingPoints([]);
    setDrawingColor(color || "#4A9EFF");
  }, []);

  const handleDrawClick = useCallback((lat, lng, replaceIndex) => {
    if (typeof replaceIndex === 'number') {
      // Dragging existing vertex
      setDrawingPoints(prev => prev.map((p, i) => i === replaceIndex ? { lat, lng } : p));
    } else {
      setDrawingPoints(prev => [...prev, { lat, lng }]);
    }
  }, []);

  const handleDrawConfirm = useCallback(async () => {
    if (drawingPoints.length < 3) return;
    
    if (editDrawingForCluster) {
      // Saving polygon for existing cluster
      const updated = await base44.entities.Cluster.update(editDrawingForCluster, { polygon: drawingPoints });
      setClusters(prev => prev.map(c => c.id === editDrawingForCluster ? { ...c, ...updated } : c));
      setEditDrawingForCluster(null);
    } else {
      // New cluster flow — save points and open dialog
      setDrawnPolygonPoints(drawingPoints);
      setShowAddClusterDialog(true);
    }
    setDrawingMode(false);
    setDrawingPoints([]);
  }, [drawingPoints, editDrawingForCluster]);

  const handleDrawCancel = useCallback(() => {
    setDrawingMode(false);
    setDrawingPoints([]);
    setEditDrawingForCluster(null);
  }, []);

  // Fly to cluster polygon center
  const [internalFlyTarget, setInternalFlyTarget] = useState(null);
  const internalFlyTimeRef = useRef(0);
  const externalFlyTimeRef = useRef(0);

  const handleFlyToCluster = useCallback(async (cluster) => {
    // If this cluster isn't in the current org-filtered list, highlight it so it renders
    const isInCurrentOrg = clusters.some(c => c.id === cluster.id);
    if (!isInCurrentOrg) {
      setHighlightedCluster(cluster);
    }

    let points = [];
    if (cluster.polygon && Array.isArray(cluster.polygon) && cluster.polygon.length >= 3) {
      points = cluster.polygon.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    } else {
      let clusterRsus = rsus.filter(r => r.cluster_id === cluster.id);
      if (clusterRsus.length === 0) {
        clusterRsus = await base44.entities.RSU.filter({ cluster_id: cluster.id });
      }
      const valid = clusterRsus.filter(r => Number.isFinite(parseFloat(r.latitude)) && parseFloat(r.latitude) !== 0);
      points = valid.map(r => ({ lat: parseFloat(r.latitude), lng: parseFloat(r.longitude) }));
    }
    if (points.length === 0) return;
    const bounds = points.map(p => [p.lat, p.lng]);
    const now = Date.now();
    internalFlyTimeRef.current = now;
    setInternalFlyTarget({ bounds, id: `cluster-${cluster.id}-${now}` });
  }, [rsus, clusters]);

  // Track when external flyTarget changes
  const prevExternalFlyRef = useRef(flyTarget);
  if (flyTarget !== prevExternalFlyRef.current) {
    prevExternalFlyRef.current = flyTarget;
    if (flyTarget) externalFlyTimeRef.current = Date.now();
  }

  // Combined fly target - use whichever was set most recently
  const activeFlyTarget = useMemo(() => {
    if (!internalFlyTarget && !flyTarget) return null;
    if (!internalFlyTarget) return flyTarget;
    if (!flyTarget) return internalFlyTarget;
    return internalFlyTimeRef.current >= externalFlyTimeRef.current ? internalFlyTarget : flyTarget;
  }, [internalFlyTarget, flyTarget]);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={mapCenter}
        zoom={13}
        className="w-full h-full"
        zoomControl={false}
        style={{ background: "#0A0F1E" }}
      >
        {mapStyle === "satellite" ? (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; Esri'
            maxZoom={19}
          />
        ) : (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            className="map-grayscale"
          />
        )}
        {activeFlyTarget && <FlyToHandler flyTarget={activeFlyTarget} />}
        <MapZoomDisplay onZoomChange={setCurrentZoom} />
        <GeoSearch />
        {/* 3D Buildings layer removed - using Cesium 3D view */}
        {isAdmin && <MapContextMenuHandler drawingMode={drawingMode} onContextMenu={(lat, lng, x, y) => {
          if (lat === null) { setContextMenu(null); return; }
          setContextMenuLatLng({ lat, lng });
          setContextMenu({ x, y });
        }} />}

        {/* Drawing mode overlay */}
        {drawingMode && (
          <DrawPolygonOverlay
            points={drawingPoints}
            color={drawingColor}
            onMapClick={handleDrawClick}
          />
        )}

        {/* Cluster Polygons */}
        {showClusters && !drawingMode && polygons.map(({ cluster, positions, rsus: clusterRsus }) => {
          const activeAlerts = getClusterActiveAlerts(cluster.id);
          const hasThreat = activeAlerts.some(a => a.severity === "critical" || a.severity === "high");
          return (
            <Polygon
              key={cluster.id}
              positions={positions}
              pathOptions={{
                fillColor: hasThreat ? "#FF2D55" : (cluster.color || "#4A9EFF"),
                fillOpacity: hasThreat ? 0.12 : 0.06,
                color: hasThreat ? "#FF2D55" : (cluster.color || "#4A9EFF"),
                weight: hasThreat ? 3 : 2.5,
                opacity: hasThreat ? 0.7 : 0.5,
                dashArray: hasThreat ? "" : "6 4",
              }}
              eventHandlers={{
                click: () => {
                  if (clusterClickTimer.current) {
                    // Double click - edit mode
                    clearTimeout(clusterClickTimer.current);
                    clusterClickTimer.current = null;
                    if (isAdmin) setEditingCluster(cluster);
                  } else {
                    // Single click - wait to see if it's a double click
                    clusterClickTimer.current = setTimeout(() => {
                      clusterClickTimer.current = null;
                      setViewingCluster(cluster);
                    }, 300);
                  }
                },
              }}
            >
            </Polygon>
          );
        })}

        <AnomalyCircles rsus={rsus} />

        {/* RSU Markers */}
        {showRsus && rsus.filter(r => Number.isFinite(parseFloat(r.latitude)) && Number.isFinite(parseFloat(r.longitude)) && parseFloat(r.latitude) !== 0).map(rsu => (
          <Marker
            key={rsu.id}
            position={[rsu.latitude, rsu.longitude]}
            icon={getIcon(rsu.status)}
            draggable={editingRsuId === rsu.id}
            eventHandlers={{
              click: () => onRsuClick?.(rsu),
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                handleRsuDragEnd(rsu, lat, lng);
              }
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} className="spectra-tooltip">
              <div className="bg-[#141B2E] text-slate-200 px-2.5 py-1.5 rounded border border-white/10 text-[11px]">
                <p className="font-mono font-bold">{rsu.device_id}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusDot status={rsu.status} />
                  <span className="text-slate-400 capitalize">{rsu.status}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">{clusters.find(c => c.id === rsu.cluster_id)?.name}</span>
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* Drawing toolbar */}
      {drawingMode && (
        <DrawPolygonToolbar
          points={drawingPoints}
          clusterName={editDrawingForCluster ? clusters.find(c => c.id === editDrawingForCluster)?.name : null}
          onUndo={() => setDrawingPoints(prev => prev.slice(0, -1))}
          onClear={() => setDrawingPoints([])}
          onConfirm={handleDrawConfirm}
          onCancel={handleDrawCancel}
        />
      )}

      {/* Context Menu */}
      {contextMenu && !drawingMode && (
        <MapContextMenuPopup
          position={contextMenu}
          onAddRsu={() => {
            if (contextMenuLatLng) handleAddRsu(contextMenuLatLng.lat, contextMenuLatLng.lng);
          }}
          onAddCluster={() => setShowAddClusterDialog(true)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Map Controls Overlay */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        <button
          onClick={() => setMapStyle(prev => prev === "default" ? "satellite" : "default")}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border backdrop-blur-md transition-colors flex items-center gap-1.5 ${
            mapStyle === "satellite"
              ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
              : "bg-[#141B2E]/90 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
          }`}
        >
          {mapStyle === "satellite" ? <Satellite className="w-3.5 h-3.5" /> : <Map className="w-3.5 h-3.5" />}
          {mapStyle === "satellite" ? "Satellite" : "Map"}
        </button>
        <MapLayerControl
          showRsus={showRsus}
          setShowRsus={setShowRsus}
          showClusters={showClusters}
          setShowClusters={setShowClusters}
        />
      </div>

      {/* Bottom Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-[#0F1629]/90 backdrop-blur-md border-t border-white/[0.06] px-4 py-2 flex items-center gap-6 text-[11px]">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">RSUs Online:</span>
          <span className="font-mono text-emerald-400 font-bold">{rsus.filter(r => r.status === "online").length}/{rsus.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-slate-400">Active Threats:</span>
          <span className="font-mono text-red-400 font-bold">
            {alerts?.filter(a => a.status === "active" && (a.severity === "critical" || a.severity === "high")).length || 0}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-slate-500">{mapCenter[0].toFixed(3)}°N {mapCenter[1].toFixed(3)}°E</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-500">Zoom {currentZoom}</span>
        </div>
      </div>

      {/* Add RSU Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#0F1629] border-white/[0.1] text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto z-[10000]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-lg font-bold">Add New RSU</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-200 font-medium">Device ID *</Label>
              <Input value={newRsu.device_id} onChange={(e) => setNewRsu(prev => ({ ...prev, device_id: e.target.value }))} placeholder="RSU-XXXXX-XX" className="bg-[#1A2238] border-white/20 text-slate-100 placeholder:text-slate-500 mt-1.5" />
            </div>
            <div>
              <Label className="text-slate-200 font-medium">Organization *</Label>
              <Select value={newRsu.organization_id} onValueChange={(val) => setNewRsu(prev => ({ ...prev, organization_id: val }))}>
                <SelectTrigger className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5"><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent className="bg-[#0F1629] border-white/20 text-slate-100" style={{ zIndex: 10001 }}>
                  {organizations?.map(org => (<SelectItem key={`org-${org.id}`} value={org.id} className="text-slate-100">{org.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200 font-medium">Cluster</Label>
              <Select value={newRsu.cluster_id || "__none__"} onValueChange={(val) => setNewRsu(prev => ({ ...prev, cluster_id: val === "__none__" ? "" : val }))}>
                <SelectTrigger className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5"><SelectValue placeholder="Select cluster (optional)" /></SelectTrigger>
                <SelectContent className="bg-[#0F1629] border-white/20 text-slate-100" style={{ zIndex: 10001 }}>
                  <SelectItem value="__none__" className="text-slate-100">None</SelectItem>
                  {clusters.filter(c => !newRsu.organization_id || c.organization_id === newRsu.organization_id).map(c => (
                    <SelectItem key={`cluster-${c.id}`} value={c.id} className="text-slate-100">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color || '#4A9EFF' }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200 font-medium">Location Name</Label>
              <Input value={newRsu.location_name} onChange={(e) => setNewRsu(prev => ({ ...prev, location_name: e.target.value }))} placeholder={`${newRsu.latitude.toFixed(4)}, ${newRsu.longitude.toFixed(4)}`} className="bg-[#1A2238] border-white/20 text-slate-100 placeholder:text-slate-500 mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-200 font-medium">Latitude</Label>
                <Input type="number" step="0.000001" value={newRsu.latitude} onChange={(e) => setNewRsu(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))} className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5" />
              </div>
              <div>
                <Label className="text-slate-200 font-medium">Longitude</Label>
                <Input type="number" step="0.000001" value={newRsu.longitude} onChange={(e) => setNewRsu(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))} className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5" />
              </div>
            </div>
            <div>
              <Label className="text-slate-200 font-medium">Status</Label>
              <Select value={newRsu.status} onValueChange={(val) => setNewRsu(prev => ({ ...prev, status: val }))}>
                <SelectTrigger className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0F1629] border-white/20 text-slate-100" style={{ zIndex: 10001 }}>
                  <SelectItem value="online" className="text-slate-100">Online</SelectItem>
                  <SelectItem value="offline" className="text-slate-100">Offline</SelectItem>
                  <SelectItem value="error" className="text-slate-100">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-200 font-medium">Firmware</Label>
                <Input value={newRsu.firmware} onChange={(e) => setNewRsu(prev => ({ ...prev, firmware: e.target.value }))} placeholder="v3.2.1" className="bg-[#1A2238] border-white/20 text-slate-100 placeholder:text-slate-500 mt-1.5" />
              </div>
              <div>
                <Label className="text-slate-200 font-medium">Hardware Rev</Label>
                <Input value={newRsu.hardware_rev} onChange={(e) => setNewRsu(prev => ({ ...prev, hardware_rev: e.target.value }))} placeholder="A3" className="bg-[#1A2238] border-white/20 text-slate-100 placeholder:text-slate-500 mt-1.5" />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-white/[0.06] pt-4">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} style={{ color: "#94a3b8", background: "#1e293b" }} className="border-white/20 hover:bg-white/10">Cancel</Button>
            <Button onClick={handleCreateRsu} className="bg-blue-600 hover:bg-blue-700 text-white">Create RSU</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Cluster Dialog */}
      <AddClusterDialog
        open={showAddClusterDialog}
        onOpenChange={setShowAddClusterDialog}
        organizationId={organizationId}
        polygonPoints={drawnPolygonPoints}
        onCreated={(created) => {
          setClusters(prev => [...prev, created]);
          setDrawnPolygonPoints(null);
        }}
        onStartDrawing={(color) => {
          startDrawing(color);
        }}
      />

      {/* Cluster Info Dialog (single click) */}
      <ClusterInfoPopup
        cluster={viewingCluster}
        rsus={rsus}
        alerts={alerts}
        open={!!viewingCluster}
        onOpenChange={(open) => { if (!open) setViewingCluster(null); }}
        onEdit={isAdmin ? (cluster) => { setViewingCluster(null); setEditingCluster(cluster); } : null}
      />

      {/* Edit Cluster Dialog (double click) */}
      <ClusterEditPopup
        cluster={editingCluster}
        open={!!editingCluster}
        onOpenChange={(open) => { if (!open) setEditingCluster(null); }}
        onUpdated={(updated) => {
          setClusters(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
        }}
        onDeleted={(id) => {
          setClusters(prev => prev.filter(c => c.id !== id));
        }}
      />
    </div>
  );
}