import React, { useState, useEffect } from "react";
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

export default function ClusterEditPopup({ cluster, open, onOpenChange, onUpdated, onDeleted }) {
  const [name, setName] = useState(cluster?.name || "");
  const [description, setDescription] = useState(cluster?.description || "");
  const [color, setColor] = useState(cluster?.color || "#4A9EFF");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (cluster) {
      setName(cluster.name || "");
      setDescription(cluster.description || "");
      setColor(cluster.color || "#4A9EFF");
      setConfirmDelete(false);
    }
  }, [cluster?.id]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const updated = await base44.entities.Cluster.update(cluster.id, {
      name: name.trim(),
      description: description.trim(),
      color,
    });
    setSaving(false);
    onUpdated?.(updated);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await base44.entities.Cluster.delete(cluster.id);
    onDeleted?.(cluster.id);
    onOpenChange(false);
  };

  const handleClearPolygon = async () => {
    setSaving(true);
    const updated = await base44.entities.Cluster.update(cluster.id, { polygon: [] });
    setSaving(false);
    onUpdated?.(updated);
  };

  if (!cluster) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0F1629] border-white/[0.1] text-slate-100 max-w-md z-[10000]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-slate-100 text-lg font-bold">Edit Cluster</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-slate-200 font-medium">Cluster Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5" />
          </div>
          <div>
            <Label className="text-slate-200 font-medium">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-[#1A2238] border-white/20 text-slate-100 mt-1.5" />
          </div>
          <div>
            <Label className="text-slate-200 font-medium">Color</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c.value ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          {cluster.polygon && cluster.polygon.length >= 3 && (
            <div>
              <Label className="text-slate-200 font-medium">Polygon</Label>
              <p className="text-[11px] text-slate-400 mt-1">{cluster.polygon.length} vertices</p>
              <Button variant="ghost" size="sm" onClick={handleClearPolygon} className="mt-1 text-red-400 hover:text-red-300 h-7 px-2 text-[11px]">
                Clear Polygon
              </Button>
            </div>
          )}
          <ClusterRsuManager clusterId={cluster.id} organizationId={cluster.organization_id} />
        </div>
        <DialogFooter className="border-t border-white/[0.06] pt-4 flex items-center justify-end gap-2">
          {!confirmDelete ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} style={{ color: "#f87171" }} className="mr-auto hover:bg-red-500/10 text-[12px] border border-red-500/50">
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-[11px] text-red-400">Are you sure?</span>
              <Button variant="ghost" size="sm" onClick={handleDelete} style={{ color: "#f87171" }} className="hover:bg-red-500/10 h-7 border border-red-500/50">Yes</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} style={{ color: "#94a3b8" }} className="hover:bg-white/5 h-7">No</Button>
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} style={{ color: "#94a3b8", background: "#1e293b" }} className="border-white/20 hover:bg-white/10">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}