import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Pencil, Trash2, Hexagon, MapPin, Building2 } from "lucide-react";
import moment from "moment";
import ClusterRsuManager from "../components/dashboard/ClusterRsuManager";

const COLOR_OPTIONS = [
  { value: "#4A9EFF", label: "Blue" },
  { value: "#00E5A0", label: "Green" },
  { value: "#FFB020", label: "Orange" },
  { value: "#FF2D55", label: "Red" },
  { value: "#8B5CF6", label: "Purple" },
  { value: "#06B6D4", label: "Cyan" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#EC4899", label: "Pink" },
];

export default function ClustersPage() {
  const [clusters, setClusters] = useState([]);
  const [rsus, setRsus] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editCluster, setEditCluster] = useState(null);
  const [deleteCluster, setDeleteCluster] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "", color: "#4A9EFF", organization_id: "" });
  const [saving, setSaving] = useState(false);
  const [showRsuManager, setShowRsuManager] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
      const isSuperAdmin = user.is_super_admin || user.role === 'admin';
      const [fetchedClusters, fetchedRsus, fetchedOrgs] = await Promise.all([
        isSuperAdmin
          ? base44.entities.Cluster.list()
          : (user.organization_id
            ? base44.entities.Cluster.filter({ organization_id: user.organization_id })
            : base44.entities.Cluster.list()),
        isSuperAdmin
          ? base44.entities.RSU.list()
          : (user.organization_id
            ? base44.entities.RSU.filter({ organization_id: user.organization_id })
            : base44.entities.RSU.list()),
        isSuperAdmin ? base44.entities.Organization.list() : Promise.resolve([]),
      ]);
      setClusters(fetchedClusters);
      setRsus(fetchedRsus);
      setOrganizations(fetchedOrgs);
    };
    loadData();
  }, []);

  const isAdmin = currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin';
  const isSuperAdmin = currentUser?.is_super_admin || currentUser?.role === 'admin';

  const getOrgName = (orgId) => {
    const org = organizations.find(o => o.id === orgId);
    return org?.name || orgId || "—";
  };

  const filteredClusters = useMemo(() => {
    return clusters.filter(c =>
      !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
    );
  }, [clusters, search]);

  const getRsuCount = (clusterId) => rsus.filter(r => r.cluster_id === clusterId).length;

  const openEditForm = (cluster) => {
    setEditCluster(cluster);
    setFormData({ name: cluster.name, description: cluster.description || "", color: cluster.color || "#4A9EFF", organization_id: cluster.organization_id || "" });
    setShowForm(true);
  };

  const openCreateForm = () => {
    setEditCluster(null);
    setFormData({ name: "", description: "", color: "#4A9EFF", organization_id: currentUser?.organization_id || (organizations.length > 0 ? organizations[0].id : "") });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    if (editCluster) {
      const { organization_id, ...updateData } = formData;
      const updated = await base44.entities.Cluster.update(editCluster.id, {
        ...updateData,
        organization_id: organization_id || editCluster.organization_id,
      });
      setClusters(prev => prev.map(c => c.id === editCluster.id ? { ...c, ...updated } : c));
    } else {
      const created = await base44.entities.Cluster.create({
        ...formData,
        organization_id: formData.organization_id || currentUser.organization_id,
      });
      setClusters(prev => [...prev, created]);
    }
    setSaving(false);
    setShowForm(false);
  };

  const handleDelete = async () => {
    if (!deleteCluster) return;
    // Unassign RSUs from this cluster first
    const clusterRsus = rsus.filter(r => r.cluster_id === deleteCluster.id);
    await Promise.all(clusterRsus.map(r => base44.entities.RSU.update(r.id, { cluster_id: "" })));
    await base44.entities.Cluster.delete(deleteCluster.id);
    setClusters(prev => prev.filter(c => c.id !== deleteCluster.id));
    setRsus(prev => prev.map(r => r.cluster_id === deleteCluster.id ? { ...r, cluster_id: "" } : r));
    setDeleteCluster(null);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Hexagon className="w-5 h-5 text-blue-400" /> Cluster Management
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{clusters.length} clusters configured</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateForm} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
            + New Cluster
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <Input
          placeholder="Search clusters..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs placeholder:text-slate-600"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#0F1629] border-b border-white/[0.06] hover:bg-[#0F1629]">
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Color</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Name</TableHead>
              {isSuperAdmin && <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Organization</TableHead>}
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Description</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">RSUs</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Polygon</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Created</TableHead>
              {isAdmin && <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClusters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? (isSuperAdmin ? 8 : 7) : (isSuperAdmin ? 7 : 6)} className="text-center text-slate-500 text-xs py-8">
                  No clusters found
                </TableCell>
              </TableRow>
            ) : (
              filteredClusters.map((cluster, i) => {
                const rsuCount = getRsuCount(cluster.id);
                const hasPolygon = cluster.polygon && Array.isArray(cluster.polygon) && cluster.polygon.length >= 3;
                return (
                  <TableRow key={cluster.id} className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${i % 2 === 0 ? "bg-[#0F1629]" : "bg-[#141B2E]"}`}>
                    <TableCell>
                      <span className="w-4 h-4 rounded-full inline-block border border-white/10" style={{ backgroundColor: cluster.color || '#4A9EFF' }} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-200 font-medium">{cluster.name}</TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {getOrgName(cluster.organization_id)}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-slate-400">{cluster.description || "—"}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => isAdmin && setShowRsuManager(cluster)}
                        className={`font-mono text-xs px-1.5 py-0.5 rounded ${rsuCount > 0 ? "text-blue-400 bg-blue-500/10 border border-blue-500/20" : "text-slate-500"} ${isAdmin ? "hover:bg-blue-500/20 cursor-pointer" : ""}`}
                      >
                        {rsuCount}
                      </button>
                    </TableCell>
                    <TableCell>
                      {hasPolygon ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                          <MapPin className="w-3 h-3" /> {cluster.polygon.length} pts
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[11px]">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-500">{moment(cluster.created_date).fromNow()}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openEditForm(cluster)} className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteCluster(cluster)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-[#141B2E] border-white/10 text-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">{editCluster ? "Edit Cluster" : "Add New Cluster"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Name *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Downtown Area"
                className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Description</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                className="bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs h-8"
              />
            </div>
            {isSuperAdmin && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400">Organization *</Label>
                <select
                  value={formData.organization_id}
                  onChange={e => setFormData(prev => ({ ...prev, organization_id: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-[#1A2238] border border-white/[0.06] rounded text-xs text-slate-200 h-8"
                >
                  <option value="">Select organization...</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setFormData(prev => ({ ...prev, color: c.value }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${formData.color === c.value ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} className="bg-transparent border-white/10 text-slate-300 hover:bg-white/5 text-xs">Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-xs" onClick={handleSave} disabled={saving || !formData.name.trim() || (!formData.organization_id && !currentUser?.organization_id)}>
              {saving ? "Saving..." : editCluster ? "Save Changes" : "Create Cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RSU Manager Dialog */}
      <Dialog open={!!showRsuManager} onOpenChange={(open) => !open && setShowRsuManager(null)}>
        <DialogContent className="bg-[#141B2E] border-white/10 text-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: showRsuManager?.color || '#4A9EFF' }} />
              {showRsuManager?.name} — RSUs
            </DialogTitle>
          </DialogHeader>
          {showRsuManager && (
            <ClusterRsuManager
              clusterId={showRsuManager.id}
              organizationId={showRsuManager.organization_id}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteCluster} onOpenChange={(open) => !open && setDeleteCluster(null)}>
        <AlertDialogContent className="bg-[#141B2E] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete Cluster</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{deleteCluster?.name}"? All RSUs in this cluster will be unassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel className="bg-transparent border-white/10 text-slate-300 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}