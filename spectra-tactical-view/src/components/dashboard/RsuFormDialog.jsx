import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function RsuFormDialog({ open, onOpenChange, editRsu, clusters, currentUser, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        device_id: editRsu?.device_id || "",
        cluster_id: editRsu?.cluster_id || "",
        location_name: editRsu?.location_name || "",
        latitude: editRsu?.latitude || "",
        longitude: editRsu?.longitude || "",
        status: editRsu?.status || "online",
        firmware: editRsu?.firmware || "",
        hardware_rev: editRsu?.hardware_rev || "",
        organization_id: editRsu?.organization_id || currentUser?.organization_id || "",
      });
    }
  }, [open, editRsu, currentUser]);

  const handleSave = async () => {
    if (!form.device_id) return;
    setSaving(true);
    const payload = {
      ...form,
      latitude: parseFloat(form.latitude) || 0,
      longitude: parseFloat(form.longitude) || 0,
    };

    if (editRsu) {
      const updated = await base44.entities.RSU.update(editRsu.id, payload);
      onSaved({ ...editRsu, ...payload, ...updated }, false);
    } else {
      const created = await base44.entities.RSU.create(payload);
      onSaved(created, true);
    }
    setSaving(false);
  };

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Filter clusters to show only those matching RSU's organization
  const orgId = form.organization_id;
  const filteredClusters = orgId ? clusters.filter(c => c.organization_id === orgId) : clusters;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141B2E] border-white/10 text-slate-200 max-w-lg" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-slate-100">{editRsu ? "Edit RSU" : "Add New RSU"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Device ID</Label>
            <Input value={form.device_id || ""} onChange={e => update("device_id", e.target.value)} placeholder="RSU-XXXX-NN" className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8" readOnly={!!editRsu} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Cluster</Label>
            <Select value={form.cluster_id || "__none__"} onValueChange={val => update("cluster_id", val === "__none__" ? "" : val)}>
              <SelectTrigger className="h-8 bg-[#1A2238] border-white/[0.06] text-slate-300 text-xs"><SelectValue placeholder="Select cluster" /></SelectTrigger>
              <SelectContent className="bg-[#141B2E] border-white/10" style={{ zIndex: 10001 }}>
                <SelectItem value="__none__" className="text-slate-300 text-xs">None</SelectItem>
                {filteredClusters.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-slate-300 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color || '#4A9EFF' }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-[11px] text-slate-400">Location Name</Label>
            <Input value={form.location_name || ""} onChange={e => update("location_name", e.target.value)} placeholder="e.g., Azrieli Tower Rooftop" className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Latitude</Label>
            <Input type="number" step="0.000001" value={form.latitude ?? ""} onChange={e => update("latitude", e.target.value)} className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Longitude</Label>
            <Input type="number" step="0.000001" value={form.longitude ?? ""} onChange={e => update("longitude", e.target.value)} className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Status</Label>
            <Select value={form.status || "online"} onValueChange={val => update("status", val)}>
              <SelectTrigger className="h-8 bg-[#1A2238] border-white/[0.06] text-slate-300 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#141B2E] border-white/10" style={{ zIndex: 10001 }}>
                <SelectItem value="online" className="text-slate-300 text-xs">Online</SelectItem>
                <SelectItem value="offline" className="text-slate-300 text-xs">Offline</SelectItem>
                <SelectItem value="error" className="text-slate-300 text-xs">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Firmware</Label>
            <Input value={form.firmware || ""} onChange={e => update("firmware", e.target.value)} placeholder="v3.2.1" className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8 font-mono" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-white/10 text-slate-300 hover:bg-white/5 text-xs">Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-xs" onClick={handleSave} disabled={saving || !form.device_id}>
            {saving ? "Saving..." : editRsu ? "Save Changes" : "Create RSU"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}