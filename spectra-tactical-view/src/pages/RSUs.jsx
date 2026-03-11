import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAlerts } from "../components/AlertContext";
import StatusDot from "../components/spectra/StatusDot";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Pencil, Trash2, Map, RotateCw, Download, Radio } from "lucide-react";
import moment from "moment";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import RsuFormDialog from "../components/dashboard/RsuFormDialog";

export default function RSUsPage() {
  const { alerts } = useAlerts();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editRsu, setEditRsu] = useState(null);
  const [rsus, setRsus] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [deleteRsu, setDeleteRsu] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
      
      const allClusters = await base44.entities.Cluster.list();
      setClusters(allClusters);
      
      // Super admin sees all, regular users see their org only
      const isSuperAdmin = user.is_super_admin || user.role === 'admin';
      const rsuQuery = (!isSuperAdmin && user.organization_id)
        ? await base44.entities.RSU.filter({ organization_id: user.organization_id })
        : await base44.entities.RSU.list();
      setRsus(rsuQuery);
    };
    loadData();
  }, []);

  const handleDelete = async () => {
    if (!deleteRsu) return;
    try {
      await base44.entities.RSU.delete(deleteRsu.id);
      setRsus(rsus.filter(r => r.id !== deleteRsu.id));
      setDeleteRsu(null);
    } catch (error) {
      console.error("Failed to delete RSU:", error);
    }
  };

  const filteredRsus = useMemo(() => {
   return rsus.filter(rsu => {
     const matchSearch = !search || rsu.device_id.toLowerCase().includes(search.toLowerCase()) || (rsu.location_name || "").toLowerCase().includes(search.toLowerCase());
     const matchStatus = statusFilter === "all" || rsu.status === statusFilter;
     const matchCluster = clusterFilter === "all" || rsu.cluster_id === clusterFilter;
     return matchSearch && matchStatus && matchCluster;
   });
  }, [rsus, search, statusFilter, clusterFilter]);

  const getAlertCount = (rsuId) => alerts.filter(a => a.rsu_id === rsuId && a.status === "active").length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-400" /> RSU Management
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{rsus.length} devices deployed across {clusters.length} clusters</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="bg-transparent border-white/10 text-slate-300 hover:bg-white/5 text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
          {(currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin') && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs" onClick={() => { setEditRsu(null); setShowForm(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add RSU
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            placeholder="Search by ID or location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs placeholder:text-slate-600"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 bg-[#1A2238] border-white/[0.06] text-slate-300 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#141B2E] border-white/10">
            <SelectItem value="all" className="text-slate-300 text-xs">All Status</SelectItem>
            <SelectItem value="online" className="text-slate-300 text-xs">Online</SelectItem>
            <SelectItem value="offline" className="text-slate-300 text-xs">Offline</SelectItem>
            <SelectItem value="error" className="text-slate-300 text-xs">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clusterFilter} onValueChange={setClusterFilter}>
          <SelectTrigger className="w-36 h-8 bg-[#1A2238] border-white/[0.06] text-slate-300 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#141B2E] border-white/10">
            <SelectItem value="all" className="text-slate-300 text-xs">All Clusters</SelectItem>
            {clusters.map(c => (
              <SelectItem key={c.id} value={c.id} className="text-slate-300 text-xs">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#0F1629] border-b border-white/[0.06] hover:bg-[#0F1629]">
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Status</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Device ID</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Cluster</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Location</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Coordinates</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Firmware</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Last Seen</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Alerts</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRsus.map((rsu, i) => {
              const cluster = clusters.find(c => c.id === rsu.cluster_id);
              const alertCount = getAlertCount(rsu.id);
              return (
                <TableRow key={rsu.id} className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${i % 2 === 0 ? "bg-[#0F1629]" : "bg-[#141B2E]"}`}>
                  <TableCell><StatusDot status={rsu.status} showLabel /></TableCell>
                  <TableCell className="font-mono text-xs text-slate-200 font-medium">{rsu.device_id}</TableCell>
                  <TableCell className="text-xs text-slate-300">{cluster?.name || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-400">{rsu.location_name}</TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-500">{rsu.latitude?.toFixed(4)}, {rsu.longitude?.toFixed(4)}</TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-400">{rsu.firmware}</TableCell>
                  <TableCell className="text-[11px] text-slate-500">{moment(rsu.last_heartbeat).fromNow()}</TableCell>
                  <TableCell>
                    {alertCount > 0 ? (
                      <span className="font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded-full">{alertCount}</span>
                    ) : (
                      <span className="text-[11px] text-slate-600">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin') && (
                        <>
                          <button onClick={() => { setEditRsu(rsu); setShowForm(true); }} className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteRsu(rsu)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <Link to={createPageUrl("Dashboard")} className="p-1.5 text-slate-500 hover:text-emerald-400 transition-colors" title="View on Map">
                        <Map className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRsu} onOpenChange={(open) => !open && setDeleteRsu(null)}>
        <AlertDialogContent className="bg-[#141B2E] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete RSU</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete {deleteRsu?.device_id}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel className="bg-transparent border-white/10 text-slate-300 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* RSU Form Dialog */}
      <RsuFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editRsu={editRsu}
        clusters={clusters}
        currentUser={currentUser}
        onSaved={(saved, isNew) => {
          if (isNew) {
            setRsus(prev => [...prev, saved]);
          } else {
            setRsus(prev => prev.map(r => r.id === saved.id ? saved : r));
          }
          setShowForm(false);
        }}
      />
    </div>
  );
}