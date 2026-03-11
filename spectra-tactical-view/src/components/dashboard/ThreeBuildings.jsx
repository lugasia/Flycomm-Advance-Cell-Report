import React, { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import * as THREE from "three";

// Convert lat/lng to pixel position relative to map container
function latLngToPixel(map, lat, lng) {
  const point = map.latLngToContainerPoint([lat, lng]);
  return { x: point.x, y: point.y };
}

// Simple in-memory cache for building data
const buildingCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 10000; // minimum 10s between fetches
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_BACKOFF = 3;

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

function parseOverpassData(data) {
  const nodes = {};
  data.elements.forEach(el => {
    if (el.type === "node") nodes[el.id] = { lat: el.lat, lng: el.lon };
  });
  const buildings = [];
  data.elements.forEach(el => {
    if (el.type === "way" && el.tags?.building) {
      const coords = el.nodes.map(nid => nodes[nid]).filter(Boolean);
      if (coords.length >= 3) {
        const levels = parseInt(el.tags["building:levels"]) || Math.ceil(Math.random() * 5 + 1);
        buildings.push({ coords, levels, id: el.id });
      }
    }
  });
  return buildings;
}

// Fetch OSM building data for current bounds with caching and retry
async function fetchBuildings(bounds) {
  const s = bounds.getSouth().toFixed(4);
  const w = bounds.getWest().toFixed(4);
  const n = bounds.getNorth().toFixed(4);
  const e = bounds.getEast().toFixed(4);
  const cacheKey = `${s},${w},${n},${e}`;

  // Check cache
  const cached = buildingCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  // Rate limit — increase delay after consecutive failures
  const now = Date.now();
  const backoffInterval = consecutiveFailures >= MAX_FAILURES_BEFORE_BACKOFF
    ? MIN_FETCH_INTERVAL * Math.pow(2, consecutiveFailures - MAX_FAILURES_BEFORE_BACKOFF + 1)
    : MIN_FETCH_INTERVAL;
  if (now - lastFetchTime < backoffInterval) {
    return cached?.data || [];
  }
  lastFetchTime = now;

  const query = `[out:json][timeout:8];way["building"](${s},${w},${n},${e});out body;>;out skel qt;`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      consecutiveFailures++;
      return cached?.data || [];
    }
    const data = await res.json();
    const buildings = parseOverpassData(data);
    buildingCache.set(cacheKey, { data: buildings, time: Date.now() });
    consecutiveFailures = 0;
    return buildings;
  } catch {
    consecutiveFailures++;
    return cached?.data || [];
  }
}

// Create extruded 3D shape from polygon coords
function createBuildingMesh(coords, height, map, color) {
  const shape = new THREE.Shape();
  const pixels = coords.map(c => latLngToPixel(map, c.lat, c.lng));
  
  if (pixels.length < 3) return null;
  
  shape.moveTo(pixels[0].x, pixels[0].y);
  for (let i = 1; i < pixels.length; i++) {
    shape.lineTo(pixels[i].x, pixels[i].y);
  }
  shape.lineTo(pixels[0].x, pixels[0].y);
  
  const extrudeSettings = {
    depth: height,
    bevelEnabled: false,
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshPhongMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

// Create wireframe edges
function createBuildingEdges(coords, height, map, color) {
  const shape = new THREE.Shape();
  const pixels = coords.map(c => latLngToPixel(map, c.lat, c.lng));
  
  if (pixels.length < 3) return null;
  
  shape.moveTo(pixels[0].x, pixels[0].y);
  for (let i = 1; i < pixels.length; i++) {
    shape.lineTo(pixels[i].x, pixels[i].y);
  }
  shape.lineTo(pixels[0].x, pixels[0].y);
  
  const extrudeSettings = { depth: height, bevelEnabled: false };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const edges = new THREE.EdgesGeometry(geometry);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
  return new THREE.LineSegments(edges, material);
}

export default function ThreeBuildings() {
  const map = useMap();
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const buildingsRef = useRef([]);
  const fetchedBoundsRef = useRef(null);
  const rawBuildingsRef = useRef([]);
  const frameRef = useRef(null);
  const isMountedRef = useRef(true);

  // Height multiplier based on zoom
  const getHeightMultiplier = useCallback(() => {
    const zoom = map.getZoom();
    if (zoom >= 18) return 4;
    if (zoom >= 17) return 3;
    if (zoom >= 16) return 2;
    if (zoom >= 15) return 1.2;
    return 0.6;
  }, [map]);

  // Setup Three.js scene
  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "450"; // Above tiles, below markers
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Orthographic camera matching container size
    const w = container.clientWidth;
    const h = container.clientHeight;
    const camera = new THREE.OrthographicCamera(0, w, 0, h, -1000, 1000);
    camera.position.z = 500;
    cameraRef.current = camera;

    // Lighting
    const ambient = new THREE.AmbientLight(0x8899bb, 0.8);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xaaccff, 0.6);
    directional.position.set(200, -300, 500);
    scene.add(directional);

    return () => {
      isMountedRef.current = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      renderer.dispose();
    };
  }, [map]);

  // Rebuild meshes from raw building data
  const rebuildMeshes = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear existing buildings
    buildingsRef.current.forEach(m => {
      scene.remove(m);
      m.geometry?.dispose();
      m.material?.dispose();
    });
    buildingsRef.current = [];

    const zoom = map.getZoom();
    if (zoom < 14) return; // Don't show buildings at low zoom

    const heightMult = getHeightMultiplier();
    const buildings = rawBuildingsRef.current;

    buildings.forEach(b => {
      const height = b.levels * 3 * heightMult;
      const mesh = createBuildingMesh(b.coords, height, map, 0x2a3a5c);
      if (mesh) {
        scene.add(mesh);
        buildingsRef.current.push(mesh);
      }
      const edges = createBuildingEdges(b.coords, height, map, 0x4a6a9f);
      if (edges) {
        scene.add(edges);
        buildingsRef.current.push(edges);
      }
    });
  }, [map, getHeightMultiplier]);

  // Fetch buildings when bounds change significantly
  const fetchAndRebuild = useCallback(async () => {
    let bounds, zoom;
    try {
      bounds = map.getBounds();
      zoom = map.getZoom();
      // Validate bounds are not NaN
      if (!Number.isFinite(bounds.getSouth()) || !Number.isFinite(bounds.getNorth())) return;
    } catch {
      return; // map not ready
    }
    
    if (zoom < 14) {
      // Clear buildings at low zoom
      rawBuildingsRef.current = [];
      rebuildMeshes();
      return;
    }

    // Check if we need to refetch (bounds changed significantly)
    if (fetchedBoundsRef.current) {
      const prev = fetchedBoundsRef.current;
      if (prev.contains(bounds)) {
        // Just rebuild meshes with current data (pan within fetched area)
        rebuildMeshes();
        return;
      }
    }

    // Fetch with some padding
    const padded = bounds.pad(0.3);
    fetchedBoundsRef.current = padded;

    const buildings = await fetchBuildings(padded);
    if (!isMountedRef.current) return;
    rawBuildingsRef.current = buildings;
    rebuildMeshes();
  }, [map, rebuildMeshes]);

  // Render loop
  useEffect(() => {
    const render = () => {
      if (!isMountedRef.current) return;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      frameRef.current = requestAnimationFrame(render);
    };
    render();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // Handle map events
  useEffect(() => {
    const onMoveEnd = () => {
      // Resize canvas if needed
      try {
        const container = map.getContainer();
        if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
        const canvas = canvasRef.current;
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        if (canvas && renderer && camera) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          canvas.width = w;
          canvas.height = h;
          renderer.setSize(w, h);
          camera.right = w;
          camera.bottom = h;
          camera.updateProjectionMatrix();
        }
        fetchAndRebuild();
      } catch {
        // map container not ready
      }
    };

    const onZoomEnd = () => {
      onMoveEnd();
    };

    const onResize = () => {
      onMoveEnd();
    };

    map.on("moveend", onMoveEnd);
    map.on("zoomend", onZoomEnd);
    window.addEventListener("resize", onResize);

    // Initial load
    setTimeout(() => fetchAndRebuild(), 500);

    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onZoomEnd);
      window.removeEventListener("resize", onResize);
    };
  }, [map, fetchAndRebuild]);

  return null; // Renders via canvas overlay, not React DOM
}