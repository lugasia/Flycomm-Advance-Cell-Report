import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import ClusterRsuManager from "./ClusterRsuManager";

const COLOR_OPTIONS = [
  { value: "#4A9EFF", label: "Blue" },
  { value: "#00E5A0", label: "Green" },
  { value: "#FFB020", label: "Orange" },
  { value: "#FF2D55", label: "Red" },
  { value: "#8B5CF6", label: "Purple" },
  { value: "#EC4899", label: "Pink" },
  { value: "#14B8A6", label: "Teal" },
  { value: "#F59E0B", label: "Amber" },
];

export default function AddClusterDialog({ open, onOpenChange, organizationId, polygonPoints, onCreated, onStartDrawing }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#4A9EFF");
  const [saving, setSaving] = useState(false);
  const [createdClusterId, setCreatedClusterId] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const created = await base44.entities.Cluster.create({
      name: name.trim(),
      description: description.trim(),
      color,
      polygon: polygonPoints && polygonPoints.length >= 3 ? polygonPoints : undefined,
      organization_id: organizationId,
    });
    setSaving(false);
    setCreatedClusterId(created.id);
    onCreated?.(created);
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setColor("#4A9EFF");
    setCreatedClusterId(null);
    onOpenChange(false);
  };

  const hasPolygon = polygonPoints && polygonPoints.length >= 3;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-[#0F1629] border-white/[0.1] text-slate-100 max-w-md z-[10000]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-slate-100 text-lg font-bold">
            {createdClusterId ? "Cluster Created — Add RSUs" : "Add New Cluster"}
          </DialogTitle>
        </DialogHeader>

        {!createdClusterId ? (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-slate-200 font-medium">Cluster Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Highway Junction A" className="bg-[#1A2238] border-white/20 text-slate-100 placeholder:text-slate-500 mt-1.5" />
              </div>
              <div>
                <Label className="text-slate-200 font-medium">Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="bg-[#1A2238] border-white/20 text-slate-100 placeholder:text-slate-500 mt-1.5" />
              </div>
              <div>
                <Label className="text-slate-200 font-medium">Color</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button key={c.value} onClick={() => setColor(c.value)} className={`w-8 h-8 rounded-full border-2 transition-all ${color === c.value ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`} style={{ backgroundColor: c.value }} title={c.label} />
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-slate-200 font-medium">Coverage Area</Label>
                {hasPolygon ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-emerald-400">Polygon drawn ({polygonPoints.length} vertices)</span>
                    <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); onStartDrawing?.(color); }} className="h-6 px-2 text-[10px]" style={{ color: "#94a3b8" }}>Redraw</Button>
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onStartDrawing?.(color); }} className="border-white/20 hover:bg-white/10 text-[11px] h-7" style={{ color: "#94a3b8", background: "#1e293b" }}>Draw on Map</Button>
                    <p className="text-[10px] text-slate-500 mt-1">Optional — click to draw a polygon on the map</p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="border-t border-white/[0.06] pt-4">
              <Button variant="outline" onClick={handleClose} style={{ color: "#94a3b8", background: "#1e293b" }} className="border-white/20 hover:bg-white/10">Cancel</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || saving} className="bg-blue-600 hover:bg-blue-700 text-white">{saving ? "Creating..." : "Create Cluster"}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="py-2">
              <ClusterRsuManager clusterId={createdClusterId} organizationId={organizationId} />
            </div>
            <DialogFooter className="border-t border-white/[0.06] pt-4">
              <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700 text-white">Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}