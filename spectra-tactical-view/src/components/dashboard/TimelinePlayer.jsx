import React, { useState, useEffect, useRef, useCallback } from "react";
import { spectra } from "@/api/spectraClient";
import { Play, Pause, SkipBack, SkipForward, Clock, Loader2 } from "lucide-react";

const SPEEDS = [1, 2, 5, 10];
const BUCKETS = [
  { label: "1 min",  value: 1  },
  { label: "5 min",  value: 5  },
  { label: "15 min", value: 15 },
  { label: "1 hr",   value: 60 },
];

// Convert "YYYY-MM-DD HH:MM:SS" (CH format) to "YYYY-MM-DDTHH:MM" (datetime-local)
function chTsToInput(s) {
  if (!s) return "";
  return s.slice(0, 16).replace(" ", "T");
}

export default function TimelinePlayer({ onFrame, onExit }) {
  const [fromTs, setFromTs]       = useState("");
  const [toTs, setToTs]           = useState("");
  const [bucket, setBucket]       = useState(5);
  const [frames, setFrames]       = useState([]);
  const [frameIdx, setFrameIdx]   = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [speed, setSpeed]         = useState(2);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const intervalRef = useRef(null);

  // Auto-set date range from actual data on mount
  useEffect(() => {
    spectra.fetchTimelineRange().then(r => {
      if (r.min_ts) setFromTs(chTsToInput(r.min_ts));
      if (r.max_ts) setToTs(chTsToInput(r.max_ts));
    }).catch(() => {});
  }, []);

  // Advance one frame
  const advance = useCallback(() => {
    setFrameIdx(prev => {
      if (prev >= frames.length - 1) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [frames.length]);

  // Play/pause ticker
  useEffect(() => {
    if (playing && frames.length > 0) {
      // ms per frame: base 1000ms / speed factor
      const ms = Math.round(1000 / speed);
      intervalRef.current = setInterval(advance, ms);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, speed, advance, frames.length]);

  // Emit current frame to parent whenever frameIdx or frames change
  useEffect(() => {
    if (frames.length > 0 && frames[frameIdx]) {
      onFrame(frames[frameIdx]);
    }
  }, [frameIdx, frames, onFrame]);

  const handleLoad = async () => {
    setError(null);
    setLoading(true);
    setPlaying(false);
    setFrameIdx(0);
    setFrames([]);
    try {
      const toClickHouseTs = (s) => s.replace("T", " ") + ":00"; // "YYYY-MM-DD HH:MM:SS"
      const data = await spectra.fetchTimeline({
        fromTs: toClickHouseTs(fromTs),
        toTs:   toClickHouseTs(toTs),
        bucketMinutes: bucket,
      });
      if (!data.frames || data.frames.length === 0) {
        setError("No data found for this time range.");
      } else {
        setFrames(data.frames);
        onFrame(data.frames[0]);
      }
    } catch (e) {
      setError(e.message || "Failed to load timeline data.");
    } finally {
      setLoading(false);
    }
  };

  const currentFrame = frames[frameIdx];
  const progress     = frames.length > 1 ? frameIdx / (frames.length - 1) : 0;

  return (
    <div className="absolute bottom-10 left-0 right-0 z-[1001] mx-3 mb-1">
      <div className="bg-[#0F1629]/95 backdrop-blur-md border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl">

        {/* Row 1: controls + scrubber + timestamp */}
        <div className="flex items-center gap-3">

          {/* Play controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setFrameIdx(0)}
              className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
              title="Jump to start"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPlaying(p => !p)}
              disabled={frames.length === 0 || loading}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-30"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button
              onClick={() => setFrameIdx(frames.length - 1)}
              className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
              title="Jump to end"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubber */}
          <div className="flex-1 flex flex-col justify-center">
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIdx}
              onChange={e => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
              disabled={frames.length === 0}
              className="w-full h-1.5 accent-blue-500 disabled:opacity-30 cursor-pointer"
            />
            {/* Tick markers every 10% */}
            {frames.length > 0 && (
              <div className="flex justify-between mt-0.5 px-0.5">
                {[0, 25, 50, 75, 100].map(pct => {
                  const fi = Math.round((pct / 100) * (frames.length - 1));
                  const t  = frames[fi]?.t?.slice(11, 16) ?? "";
                  return <span key={pct} className="text-[9px] text-slate-600 font-mono">{t}</span>;
                })}
              </div>
            )}
          </div>

          {/* Current timestamp */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-slate-300 bg-white/[0.04] px-2 py-1 rounded border border-white/[0.06] min-w-[120px]">
            <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
            <span>{currentFrame ? currentFrame.t.slice(0, 16).replace("T", " ") : "—"}</span>
          </div>

          {/* Speed selector */}
          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="text-[11px] bg-[#1A2238] border border-white/10 rounded px-1.5 py-1 text-slate-300 flex-shrink-0"
          >
            {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
          </select>

          {/* Exit playback */}
          <button
            onClick={() => { setPlaying(false); setFrames([]); onExit(); }}
            className="text-[11px] px-2 py-1 rounded border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors flex-shrink-0"
          >
            Exit
          </button>
        </div>

        {/* Row 2: query config */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-white/[0.05]">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0">Range</span>

          <input
            type="datetime-local"
            value={fromTs}
            onChange={e => setFromTs(e.target.value)}
            className="text-[11px] bg-[#1A2238] border border-white/10 rounded px-2 py-1 text-slate-300 min-w-0 w-auto"
          />
          <span className="text-slate-600 text-[11px]">→</span>
          <input
            type="datetime-local"
            value={toTs}
            onChange={e => setToTs(e.target.value)}
            className="text-[11px] bg-[#1A2238] border border-white/10 rounded px-2 py-1 text-slate-300 min-w-0 w-auto"
          />

          <span className="text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0">Bucket</span>
          <select
            value={bucket}
            onChange={e => setBucket(Number(e.target.value))}
            className="text-[11px] bg-[#1A2238] border border-white/10 rounded px-1.5 py-1 text-slate-300 flex-shrink-0"
          >
            {BUCKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>

          <button
            onClick={handleLoad}
            disabled={loading}
            className="ml-auto px-3 py-1 rounded text-[11px] font-medium bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {loading ? "Loading…" : "Load"}
          </button>

          {frames.length > 0 && (
            <span className="text-[10px] text-slate-500 flex-shrink-0">
              {frameIdx + 1} / {frames.length} frames
            </span>
          )}
          {error && (
            <span className="text-[10px] text-red-400 flex-shrink-0">{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
