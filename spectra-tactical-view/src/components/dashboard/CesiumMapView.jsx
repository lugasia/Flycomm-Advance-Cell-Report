import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";

// We load Cesium from CDN to avoid CESIUM_BASE_URL / Vite asset issues
const CESIUM_CDN_VERSION = "1.126";
const CESIUM_CDN_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_CDN_VERSION}/Build/Cesium`;

function loadCesiumFromCDN() {
  return new Promise((resolve, reject) => {
    if (window.Cesium) { resolve(window.Cesium); return; }

    // Load CSS
    if (!document.getElementById("cesium-css")) {
      const link = document.createElement("link");
      link.id = "cesium-css";
      link.rel = "stylesheet";
      link.href = `${CESIUM_CDN_BASE}/Widgets/widgets.css`;
      document.head.appendChild(link);
    }

    // Load JS
    if (!document.getElementById("cesium-js")) {
      const script = document.createElement("script");
      script.id = "cesium-js";
      script.src = `${CESIUM_CDN_BASE}/Cesium.js`;
      script.onload = () => resolve(window.Cesium);
      script.onerror = () => reject(new Error("Failed to load CesiumJS"));
      document.head.appendChild(script);
    } else {
      // Script already in DOM, wait for it
      const check = setInterval(() => {
        if (window.Cesium) { clearInterval(check); resolve(window.Cesium); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error("Cesium load timeout")); }, 15000);
    }
  });
}

export default function CesiumMapView({ rsus, clusters, alerts, onClose, onRsuClick }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const alertEntitiesRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Compute bounding box from RSUs + cluster polygons for proper centering
  const bounds = useMemo(() => {
    const allLats = [];
    const allLngs = [];

    // Add RSU positions
    rsus.forEach(r => {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
        allLats.push(lat);
        allLngs.push(lng);
      }
    });

    // Add cluster polygon points
    clusters.forEach(c => {
      if (c.polygon && Array.isArray(c.polygon)) {
        c.polygon.forEach(p => {
          if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
            allLats.push(p.lat);
            allLngs.push(p.lng);
          }
        });
      }
    });

    if (allLats.length === 0) return { lat: 32.075, lng: 34.775, minLat: 32.07, maxLat: 32.08, minLng: 34.77, maxLng: 34.78 };
    return {
      lat: allLats.reduce((a, b) => a + b, 0) / allLats.length,
      lng: allLngs.reduce((a, b) => a + b, 0) / allLngs.length,
      minLat: Math.min(...allLats),
      maxLat: Math.max(...allLats),
      minLng: Math.min(...allLngs),
      maxLng: Math.max(...allLngs),
    };
  }, [rsus, clusters]);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      try {
        const Cesium = await loadCesiumFromCDN();
        if (destroyed || !containerRef.current) return;

        // Cesium Ion default access token
        Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiMWI3MzYxNS1lMGJiLTRlNjktODczYi1hMjU3Y2I2NTc0MDkiLCJpZCI6MjU5LCJpYXQiOjE2MzIzNDk2NjB9.M9aZR-bG7gTER3AGoLeDdAPlnEbxSs-VnP0ucYJDEfM";

        const viewer = new Cesium.Viewer(containerRef.current, {
          imageryProvider: false,
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          creditContainer: document.createElement("div"),
          skyBox: false,
          skyAtmosphere: false,
          contextOptions: {
            webgl: { alpha: true }
          }
        });

        if (destroyed) { viewer.destroy(); return; }
        viewerRef.current = viewer;

        // Use lighter CARTO Voyager tiles for better visibility
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            subdomains: "abcd",
            maximumLevel: 19,
            credit: "CARTO",
          })
        );

        // Adjust imagery for a semi-dark but visible look
        const imageryLayer = viewer.imageryLayers.get(0);
        if (imageryLayer) {
          imageryLayer.brightness = 0.6;
          imageryLayer.contrast = 1.3;
          imageryLayer.saturation = 0.3;
        }

        // Styling
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0F1629");
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0F1629");
        viewer.scene.fog.enabled = true;
        viewer.scene.globe.enableLighting = false;
        viewer.scene.sun = undefined;
        viewer.scene.moon = undefined;

        // Add OSM 3D Buildings from Cesium Ion (asset 96188)
        try {
          const buildingTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
          if (destroyed) return;
          viewer.scene.primitives.add(buildingTileset);
          buildingTileset.style = new Cesium.Cesium3DTileStyle({
            color: {
              conditions: [
                ["true", "color('#7a9ac8', 0.9)"]
              ]
            }
          });
        } catch (e1) {
          console.warn("Ion 96188 failed, trying alternative approach:", e1);
          // Fallback: fetch buildings from OSM Overpass and create extruded polygons
          try {
            const lat = bounds.lat;
            const lng = bounds.lng;
            const delta = 0.01;
            const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;
            const query = `[out:json][timeout:15];way["building"](${bbox});out body;>;out skel qt;`;
            const resp = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            const data = await resp.json();
            if (destroyed) return;
            
            const nodes = {};
            data.elements.filter(e => e.type === "node").forEach(n => { nodes[n.id] = n; });
            const buildings = data.elements.filter(e => e.type === "way" && e.nodes);
            
            buildings.forEach(bldg => {
              const coords = bldg.nodes
                .map(nid => nodes[nid])
                .filter(Boolean)
                .flatMap(n => [n.lon, n.lat]);
              if (coords.length < 6) return;
              
              const levels = parseInt(bldg.tags?.["building:levels"]) || Math.floor(Math.random() * 4) + 2;
              const height = levels * 3.5;
              
              viewer.entities.add({
                polygon: {
                  hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
                  extrudedHeight: height,
                  height: 0,
                  material: Cesium.Color.fromCssColorString("#7a9ac8").withAlpha(0.85),
                  outline: true,
                  outlineColor: Cesium.Color.fromCssColorString("#9ab8e0").withAlpha(0.5),
                }
              });
            });
            console.log(`Loaded ${buildings.length} buildings from OSM`);
          } catch (e2) {
            console.warn("Could not load buildings from OSM either:", e2);
          }
        }

        // Add RSU markers
        const validRsus = rsus.filter(r => {
          const lat = parseFloat(r.latitude);
          const lng = parseFloat(r.longitude);
          return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
        });

        validRsus.forEach(rsu => {
          const lat = parseFloat(rsu.latitude);
          const lng = parseFloat(rsu.longitude);
          const color = rsu.status === "online"
            ? Cesium.Color.fromCssColorString("#00E5A0")
            : rsu.status === "error"
              ? Cesium.Color.fromCssColorString("#FF2D55")
              : Cesium.Color.fromCssColorString("#475569");

          viewer.entities.add({
            name: `rsu-${rsu.id}`,
            properties: { rsuData: rsu, entityType: "rsu" },
            position: Cesium.Cartesian3.fromDegrees(lng, lat, 15),
            point: {
              pixelSize: 14,
              color: color,
              outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: rsu.device_id || "",
              font: "bold 13px monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.fromCssColorString("#0A0F1E"),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -22),
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              eyeOffset: new Cesium.Cartesian3(0, 0, -100),
              scale: 0.9,
            },
          });
        });

        // Click handler for RSU entities
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
          const picked = viewer.scene.pick(click.position);
          if (Cesium.defined(picked) && picked.id && picked.id.properties) {
            const props = picked.id.properties;
            const entityType = props.entityType?.getValue?.() || props.entityType;
            if (entityType === "rsu") {
              const rsuData = props.rsuData?.getValue?.() || props.rsuData;
              if (rsuData && onRsuClick) {
                onRsuClick(rsuData);
              }
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Cursor change on hover
        handler.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.endPosition);
          if (Cesium.defined(picked) && picked.id && picked.id.properties) {
            const entityType = picked.id.properties.entityType?.getValue?.() || picked.id.properties.entityType;
            viewer.scene.canvas.style.cursor = entityType === "rsu" ? "pointer" : "default";
          } else {
            viewer.scene.canvas.style.cursor = "default";
          }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // Add cluster polygons
        clusters.forEach(cluster => {
          let coords = [];
          if (cluster.polygon && Array.isArray(cluster.polygon) && cluster.polygon.length >= 3) {
            coords = cluster.polygon;
          } else {
            const clusterRsus = rsus.filter(r => r.cluster_id === cluster.id).filter(r => {
              const lat = parseFloat(r.latitude);
              const lng = parseFloat(r.longitude);
              return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
            });
            if (clusterRsus.length >= 3) {
              coords = clusterRsus.map(r => ({ lat: parseFloat(r.latitude), lng: parseFloat(r.longitude) }));
            }
          }
          if (coords.length < 3) return;

          const clusterColor = Cesium.Color.fromCssColorString(cluster.color || "#4A9EFF");
          const positions = coords.flatMap(c => [c.lng, c.lat]);

          viewer.entities.add({
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
              material: clusterColor.withAlpha(0.15),
              outline: true,
              outlineColor: clusterColor.withAlpha(0.7),
              outlineWidth: 2,
              height: 0,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        });

        // Fly to center of all data, computing altitude from extent
        const latSpan = bounds.maxLat - bounds.minLat;
        const lngSpan = bounds.maxLng - bounds.minLng;
        const maxSpan = Math.max(latSpan, lngSpan);
        // Altitude based on extent: roughly 111km per degree, view at ~45° pitch
        const altitude = Math.max(maxSpan * 111000 * 1.8, 800);
        // Offset center southward to compensate for the 45° pitch perspective
        const pitchOffset = (maxSpan * 0.35) + 0.002;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            bounds.lng,
            bounds.lat - pitchOffset,
            altitude
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
          duration: 1.5,
        });

        setLoading(false);
      } catch (err) {
        console.error("Cesium init error:", err);
        if (!destroyed) setError(err.message);
        setLoading(false);
      }
    }

    init();

    return () => {
      destroyed = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rsus, clusters, JSON.stringify(bounds)]);

  // Update alert markers without re-creating the viewer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const Cesium = window.Cesium;
    if (!Cesium) return;

    // Remove previous alert entities
    alertEntitiesRef.current.forEach(entity => {
      try { viewer.entities.remove(entity); } catch {}
    });
    alertEntitiesRef.current = [];

    // Add active alert markers
    const activeAlerts = (alerts || []).filter(a => a.status === "active");
    activeAlerts.forEach(alert => {
      const lat = parseFloat(alert.latitude);
      const lng = parseFloat(alert.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return;

      const isCritical = alert.severity === "critical";
      const alertColor = isCritical
        ? Cesium.Color.fromCssColorString("#FF2D55")
        : alert.severity === "high"
          ? Cesium.Color.fromCssColorString("#FF6B35")
          : Cesium.Color.fromCssColorString("#FFB020");

      const cylinder = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        cylinder: {
          length: isCritical ? 80 : 50,
          topRadius: isCritical ? 15 : 10,
          bottomRadius: 1,
          material: alertColor.withAlpha(0.6),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      alertEntitiesRef.current.push(cylinder);

      const ellipse = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        ellipse: {
          semiMajorAxis: isCritical ? 40 : 25,
          semiMinorAxis: isCritical ? 40 : 25,
          material: alertColor.withAlpha(0.2),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      alertEntitiesRef.current.push(ellipse);
    });
  }, [alerts]);

  return (
    <div className="absolute inset-0 z-[2000]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070d1e]/80 z-10">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Loading Cesium 3D Globe...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070d1e]/90 z-10">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-sm text-red-400">Failed to load 3D view</p>
            <p className="text-xs text-slate-500">{error}</p>
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded text-xs text-slate-200 hover:bg-slate-600">
              Back to 2D
            </button>
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute bottom-10 right-4 z-20 px-3 py-2 bg-[#141B2E]/90 border border-white/10 rounded-lg text-sm text-slate-200 hover:bg-white/10 transition-colors backdrop-blur-md flex items-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        2D Map
      </button>

      {/* Controls hint */}
      <div className="absolute bottom-8 left-4 z-20 bg-[#141B2E]/80 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-md">
        <p className="text-[10px] text-slate-500">
          <span className="text-slate-400">Left drag</span> Rotate • <span className="text-slate-400">Right drag</span> Zoom • <span className="text-slate-400">Middle drag</span> Pan
        </p>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-20 bg-[#141B2E]/90 border border-white/10 rounded-lg px-3 py-2.5 backdrop-blur-md space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Legend</p>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
          <span className="text-slate-300">RSU Online</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-slate-500 rounded-full" />
          <span className="text-slate-300">RSU Offline</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
          <span className="text-slate-300">RSU Error / Alert</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-blue-500/60 rounded-sm" />
          <span className="text-slate-300">Cluster Zone</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-[#3a4a6a] rounded-sm border border-[#5a6a8a]" />
          <span className="text-slate-300">3D Building</span>
        </div>
      </div>
    </div>
  );
}