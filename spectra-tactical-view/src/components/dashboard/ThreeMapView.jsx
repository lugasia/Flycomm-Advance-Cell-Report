import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import * as THREE from "three";

// OrbitControls implementation (minimal, inline)
function createOrbitControls(camera, domElement) {
  let isDown = false;
  let prevX = 0, prevY = 0;
  let theta = Math.PI / 4; // azimuth
  let phi = Math.PI / 3;   // polar (from top)
  let distance = 800;
  let targetX = 0, targetY = 0, targetZ = 0;

  function update() {
    const x = distance * Math.sin(phi) * Math.cos(theta);
    const y = distance * Math.cos(phi);
    const z = distance * Math.sin(phi) * Math.sin(theta);
    camera.position.set(targetX + x, y, targetZ + z);
    camera.lookAt(targetX, targetY, targetZ);
  }

  function onPointerDown(e) {
    isDown = true;
    prevX = e.clientX;
    prevY = e.clientY;
  }

  function onPointerMove(e) {
    if (!isDown) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;

    if (e.buttons === 1) {
      // Left click: rotate
      theta -= dx * 0.005;
      phi -= dy * 0.005;
      phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, phi));
    } else if (e.buttons === 2) {
      // Right click: pan
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      camera.getWorldDirection(right);
      right.cross(up).normalize();
      const forward = new THREE.Vector3();
      forward.crossVectors(right, up).normalize();
      targetX -= (dx * right.x + dy * forward.x) * distance * 0.001;
      targetZ -= (dx * right.z + dy * forward.z) * distance * 0.001;
    }
    update();
  }

  function onPointerUp() { isDown = false; }

  function onWheel(e) {
    e.preventDefault();
    distance *= e.deltaY > 0 ? 1.08 : 0.92;
    distance = Math.max(50, Math.min(20000, distance));
    update();
  }

  function onContextMenu(e) { e.preventDefault(); }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContextMenu);

  update();

  return {
    update,
    setTarget(x, y, z) { targetX = x; targetY = y; targetZ = z; update(); },
    setDistance(d) { distance = d; update(); },
    dispose() {
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContextMenu);
    }
  };
}

// Convert lat/lng to 3D world coords (flat projection centered on centroid)
function latLngTo3D(lat, lng, centerLat, centerLng, scale = 10000) {
  const x = (lng - centerLng) * Math.cos(centerLat * Math.PI / 180) * scale;
  const z = -(lat - centerLat) * scale;
  return { x, z };
}

// Building data cache (shared across component mounts)
const buildingCache3D = new Map();
const CACHE_TTL_3D = 30 * 60 * 1000;

const OVERPASS_ENDPOINT_3D = "https://overpass-api.de/api/interpreter";

async function fetchBuildings(centerLat, centerLng, radius = 0.005) {
  const s = (centerLat - radius).toFixed(4);
  const w = (centerLng - radius * 1.5).toFixed(4);
  const n = (centerLat + radius).toFixed(4);
  const e = (centerLng + radius * 1.5).toFixed(4);
  const cacheKey = `${s},${w},${n},${e}`;

  const cached = buildingCache3D.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_3D) return cached.data;

  const query = `[out:json][timeout:8];way["building"](${s},${w},${n},${e});out body;>;out skel qt;`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${OVERPASS_ENDPOINT_3D}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return cached?.data || [];
    const data = await res.json();
    const nodes = {};
    data.elements.forEach(el => { if (el.type === "node") nodes[el.id] = { lat: el.lat, lng: el.lon }; });
    const buildings = [];
    data.elements.forEach(el => {
      if (el.type === "way" && el.tags?.building) {
        const coords = el.nodes.map(nid => nodes[nid]).filter(Boolean);
        if (coords.length >= 3) {
          const levels = parseInt(el.tags["building:levels"]) || Math.ceil(Math.random() * 4 + 1);
          buildings.push({ coords, levels, id: el.id });
        }
      }
    });
    buildingCache3D.set(cacheKey, { data: buildings, time: Date.now() });
    return buildings;
  } catch {
    return cached?.data || [];
  }
}

export default function ThreeMapView({ rsus, clusters, alerts, onClose }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const frameRef = useRef(null);
  const labelsRef = useRef([]);
  const tooltipRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [hoveredObj, setHoveredObj] = useState(null);

  // Compute center from RSUs
  const center = useMemo(() => {
    const valid = rsus.filter(r => {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
    });
    if (valid.length === 0) return { lat: 32.075, lng: 34.775 };
    const lat = valid.reduce((s, r) => s + parseFloat(r.latitude), 0) / valid.length;
    const lng = valid.reduce((s, r) => s + parseFloat(r.longitude), 0) / valid.length;
    return { lat, lng };
  }, [rsus]);

  // Store alerts in a ref so we don't rebuild the whole scene when they change
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return; // container not visible yet

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0f1a2e);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0f1a2e, 0.00002);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, w / h, 1, 50000);
    cameraRef.current = camera;

    // Controls
    const controls = createOrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    // Lighting
    const ambient = new THREE.AmbientLight(0x6688aa, 2.0);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x8899bb, 1.5);
    dirLight.position.set(300, 600, 200);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
    const hemiLight = new THREE.HemisphereLight(0x6688bb, 0x223355, 0.8);
    scene.add(hemiLight);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20000, 20000);
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: 0x141e30, 
      roughness: 0.9,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridSize = 12000;
    const gridDivisions = 120;
    const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x2a3a58, 0x1e2d48);
    grid.position.y = 0;
    scene.add(grid);

    const SCALE = 15000;

    // --- Compute bounding box of all RSU positions to auto-fit camera ---
    const validRsus = rsus.filter(r => {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
    });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    validRsus.forEach(r => {
      const p = latLngTo3D(parseFloat(r.latitude), parseFloat(r.longitude), center.lat, center.lng, SCALE);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    // Also consider cluster polygons
    clusters.forEach(cluster => {
      if (cluster.polygon && cluster.polygon.length >= 3) {
        cluster.polygon.forEach(pt => {
          const p = latLngTo3D(pt.lat, pt.lng, center.lat, center.lng, SCALE);
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
        });
      }
    });
    const spreadX = maxX - minX;
    const spreadZ = maxZ - minZ;
    const spread = Math.max(spreadX, spreadZ, 100);
    const idealDistance = Math.max(spread * 1.2, 200);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    controls.setDistance(idealDistance);
    controls.setTarget(centerX, 0, centerZ);

    // --- Add RSU markers ---
    const rsuMeshes = [];
    validRsus.forEach(rsu => {
      const pos = latLngTo3D(parseFloat(rsu.latitude), parseFloat(rsu.longitude), center.lat, center.lng, SCALE);

      // RSU base - tiny pin marker
      const color = rsu.status === "online" ? 0x00e5a0 : rsu.status === "error" ? 0xff2d55 : 0x475569;
      
      // Small vertical cylinder as pin
      const pinGeo = new THREE.CylinderGeometry(1, 1, 8, 6);
      const pinMat = new THREE.MeshPhongMaterial({ 
        color, 
        emissive: color, 
        emissiveIntensity: 0.5,
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.set(pos.x, 4, pos.z);
      pinMesh.userData = { type: "rsu", data: rsu };
      scene.add(pinMesh);
      rsuMeshes.push(pinMesh);

      // Small sphere on top
      const topGeo = new THREE.SphereGeometry(1.8, 8, 8);
      const topMat = new THREE.MeshPhongMaterial({ 
        color, emissive: color, emissiveIntensity: 0.6 
      });
      const topMesh = new THREE.Mesh(topGeo, topMat);
      topMesh.position.set(pos.x, 9, pos.z);
      scene.add(topMesh);

      // Subtle ground ring
      const ringGeo = new THREE.RingGeometry(2, 3, 6);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.3, pos.z);
      scene.add(ring);
    });

    // --- Add Cluster polygons (extruded boundaries) ---
    clusters.forEach(cluster => {
      let coords = [];
      if (cluster.polygon && cluster.polygon.length >= 3) {
        coords = cluster.polygon.map(p => latLngTo3D(p.lat, p.lng, center.lat, center.lng, SCALE));
      } else {
        // Use RSU positions to create boundary
        const clusterRsus = rsus.filter(r => r.cluster_id === cluster.id).filter(r => {
          const lat = parseFloat(r.latitude);
          const lng = parseFloat(r.longitude);
          return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
        });
        if (clusterRsus.length < 2) return;
        coords = clusterRsus.map(r => latLngTo3D(parseFloat(r.latitude), parseFloat(r.longitude), center.lat, center.lng, SCALE));
      }
      if (coords.length < 3) return;

      const clusterColor = new THREE.Color(cluster.color || "#4A9EFF");

      // Wall polygon
      const shape = new THREE.Shape();
      shape.moveTo(coords[0].x, coords[0].z);
      for (let i = 1; i < coords.length; i++) {
        shape.lineTo(coords[i].x, coords[i].z);
      }
      shape.lineTo(coords[0].x, coords[0].z);

      // Floor fill
      const floorGeo = new THREE.ShapeGeometry(shape);
      const floorMat = new THREE.MeshBasicMaterial({ color: clusterColor, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.5;
      scene.add(floor);

      // Walls (extruded thin boundary)
      const wallHeight = 3;
      for (let i = 0; i < coords.length; i++) {
        const a = coords[i];
        const b = coords[(i + 1) % coords.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 1) continue;

        const wallGeo = new THREE.PlaneGeometry(len, wallHeight);
        const wallMat = new THREE.MeshBasicMaterial({ color: clusterColor, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set((a.x + b.x) / 2, wallHeight / 2, (a.z + b.z) / 2);
        wall.rotation.y = -Math.atan2(dz, dx);
        scene.add(wall);
      }

      // Border lines on ground
      const linePoints = coords.map(c => new THREE.Vector3(c.x, 1, c.z));
      linePoints.push(linePoints[0].clone());
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: clusterColor, transparent: true, opacity: 0.6 });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
    });

    // --- Add Alert markers ---
    const activeAlerts = (alertsRef.current || []).filter(a => a.status === "active");
    activeAlerts.forEach(alert => {
      const lat = parseFloat(alert.latitude);
      const lng = parseFloat(alert.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return;
      const pos = latLngTo3D(lat, lng, center.lat, center.lng, SCALE);
      const isCritical = alert.severity === "critical";
      const alertColor = isCritical ? 0xff2d55 : alert.severity === "high" ? 0xff6b35 : 0xffb020;

      // Pulsing sphere - tiny
      const sphereGeo = new THREE.SphereGeometry(isCritical ? 2.5 : 1.5, 12, 12);
      const sphereMat = new THREE.MeshPhongMaterial({ 
        color: alertColor, 
        emissive: alertColor, 
        emissiveIntensity: 0.6, 
        transparent: true, 
        opacity: 0.8 
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(pos.x, isCritical ? 12 : 8, pos.z);
      sphere.userData = { type: "alert", data: alert, pulse: true };
      scene.add(sphere);

      // Vertical beam from ground to sphere
      const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, sphere.position.y, 4);
      const beamMat = new THREE.MeshBasicMaterial({ color: alertColor, transparent: true, opacity: 0.25 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(pos.x, sphere.position.y / 2, pos.z);
      scene.add(beam);

      // Ground ring - tiny
      const ringGeo = new THREE.RingGeometry(isCritical ? 3 : 2, isCritical ? 4 : 2.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: alertColor, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.5, pos.z);
      ring.userData = { pulse: true, baseScale: 1, alertColor };
      scene.add(ring);
    });

    // If no valid RSUs at all, still stop loading
    if (validRsus.length === 0) setLoading(false);

    // --- Fetch and add buildings ---
    fetchBuildings(center.lat, center.lng, 0.008).then(buildings => {
      buildings.forEach(b => {
        const coords3D = b.coords.map(c => latLngTo3D(c.lat, c.lng, center.lat, center.lng, SCALE));
        if (coords3D.length < 3) return;
        
        const shape = new THREE.Shape();
        shape.moveTo(coords3D[0].x, coords3D[0].z);
        for (let i = 1; i < coords3D.length; i++) {
          shape.lineTo(coords3D[i].x, coords3D[i].z);
        }
        shape.lineTo(coords3D[0].x, coords3D[0].z);
        
        const height = b.levels * 6;
        const extGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        const extMat = new THREE.MeshPhongMaterial({
          color: 0x4a5e80,
          emissive: 0x2a3a55,
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(extGeo, extMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.castShadow = true;
        scene.add(mesh);

        // Edges
        const edgesGeo = new THREE.EdgesGeometry(extGeo);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x6a8abf, transparent: true, opacity: 0.45 });
        const edges = new THREE.LineSegments(edgesGeo, edgesMat);
        edges.rotation.x = -Math.PI / 2;
        scene.add(edges);
      });
      setLoading(false);
    });

    // Animation
    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      
      // Pulse alert objects
      scene.children.forEach(child => {
        if (child.userData?.pulse && child.geometry?.type === "SphereGeometry") {
          const s = 1 + Math.sin(elapsed * 3) * 0.2;
          child.scale.set(s, s, s);
        }
        if (child.userData?.pulse && child.geometry?.type === "RingGeometry") {
          const s = child.userData.baseScale + Math.sin(elapsed * 2) * 0.3;
          child.scale.set(s, s, s);
          child.material.opacity = 0.1 + Math.sin(elapsed * 2) * 0.05;
        }
      });
      
      renderer.render(scene, camera);
    };
    animate();

    // Raycasting for hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(rsuMeshes);
      if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.userData?.data) {
          setHoveredObj({ data: obj.userData.data, type: obj.userData.type, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }
      } else {
        setHoveredObj(null);
      }
    };
    renderer.domElement.addEventListener("mousemove", onMouseMove);

    // Resize handler
    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      controls.dispose();
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [rsus, clusters, center]); // alerts excluded - read from ref to avoid full scene rebuild

  return (
    <div className="absolute inset-0 z-[2000]">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070d1e]/80 z-10">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Loading 3D scene...</p>
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredObj && (
        <div 
          className="absolute pointer-events-none z-20 bg-[#141B2E] border border-white/10 rounded-lg px-3 py-2 shadow-xl"
          style={{ left: hoveredObj.x + 15, top: hoveredObj.y - 10 }}
        >
          <p className="text-xs font-mono font-bold text-slate-200">{hoveredObj.data.device_id}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${hoveredObj.data.status === 'online' ? 'bg-emerald-400' : hoveredObj.data.status === 'error' ? 'bg-red-400' : 'bg-slate-500'}`} />
            <span className="text-[10px] text-slate-400 capitalize">{hoveredObj.data.status}</span>
          </div>
        </div>
      )}

      {/* Close button - bottom right */}
      <button
        onClick={onClose}
        className="absolute bottom-10 right-4 z-20 px-3 py-2 bg-[#141B2E]/90 border border-white/10 rounded-lg text-sm text-slate-200 hover:bg-white/10 transition-colors backdrop-blur-md flex items-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        2D Map
      </button>

      {/* Controls hint */}
      <div className="absolute bottom-8 left-4 z-20 bg-[#141B2E]/80 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-md">
        <p className="text-[10px] text-slate-500">
          <span className="text-slate-400">Left drag</span> Rotate • <span className="text-slate-400">Right drag</span> Pan • <span className="text-slate-400">Scroll</span> Zoom
        </p>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-20 bg-[#141B2E]/90 border border-white/10 rounded-lg px-3 py-2.5 backdrop-blur-md space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Legend</p>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" />
          <span className="text-slate-300">RSU Online</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-slate-500 rounded-sm" />
          <span className="text-slate-300">RSU Offline</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-sm" />
          <span className="text-slate-300">RSU Error / Alert</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-blue-500/60 rounded-sm" />
          <span className="text-slate-300">Cluster Zone</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2.5 h-2.5 bg-[#1a2a45] rounded-sm border border-[#2a4a7f]" />
          <span className="text-slate-300">Building</span>
        </div>
      </div>
    </div>
  );
}