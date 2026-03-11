import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { useMap } from "react-leaflet";
import { motion, AnimatePresence } from "framer-motion";
import debounce from "lodash/debounce";

export default function GeoSearch() {
  const map = useMap();
  // Stop map events from propagating through the search panel
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener("mousedown", stop);
    el.addEventListener("dblclick", stop);
    el.addEventListener("wheel", stop);
    return () => {
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("dblclick", stop);
      el.removeEventListener("wheel", stop);
    };
  }, []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchPlaces = useCallback(
    debounce(async (q) => {
      if (!q || q.length < 2) { setResults([]); return; }
      setLoading(true);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`
      );
      const data = await resp.json();
      setResults(data);
      setLoading(false);
    }, 400),
    []
  );

  useEffect(() => {
    searchPlaces(query);
  }, [query, searchPlaces]);

  const handleSelect = (place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], 16, { duration: 1.5 });
    }
    setQuery(place.display_name.split(",").slice(0, 2).join(","));
    setOpen(false);
    setResults([]);
  };

  const handleCoordPaste = () => {
    // Try to parse "lat, lng" or "lat lng" format
    const match = query.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        map.flyTo([lat, lng], 16, { duration: 1.5 });
        setOpen(false);
        setResults([]);
        return true;
      }
    }
    return false;
  };

  return (
    <div ref={(el) => { panelRef.current = el; containerRef.current = el; }} className="leaflet-top leaflet-left" style={{ zIndex: 1001, pointerEvents: "auto", position: "absolute", top: 12, left: 12 }}>
      <div className={`flex items-center bg-[#141B2E]/95 backdrop-blur-md border rounded-lg transition-all ${open ? "border-blue-500/40 w-72" : "border-white/10 w-72"}`}>
        <Search className="w-3.5 h-3.5 text-slate-500 ml-2.5 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (!handleCoordPaste() && results.length > 0) {
                handleSelect(results[0]);
              }
            }
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          }}
          placeholder="Search location or GPS coords..."
          className="flex-1 bg-transparent text-[12px] text-slate-200 placeholder:text-slate-600 py-2 px-2 outline-none"
        />
        {loading && <Loader2 className="w-3.5 h-3.5 text-slate-500 mr-2 animate-spin" />}
        {query && !loading && (
          <button onClick={() => { setQuery(""); setResults([]); }} className="mr-2 text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-1 bg-[#141B2E]/98 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden shadow-xl"
          >
            {results.map((place, i) => (
              <button
                key={place.place_id || i}
                onClick={() => handleSelect(place)}
                className="w-full flex items-start gap-2 px-3 py-2 hover:bg-white/[0.05] transition-colors text-left"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-[11px] text-slate-200 truncate">{place.display_name.split(",").slice(0, 2).join(",")}</p>
                  <p className="text-[10px] text-slate-500 truncate">{place.display_name.split(",").slice(2).join(",").trim()}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}