import React, { useState, useEffect } from "react";
import { spectra } from "@/api/spectraClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Building2, ChevronLeft, Shield, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import OrgUserManagement from "../components/org/OrgUserManagement";
import OrgSettings from "../components/org/OrgSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Users } from "lucide-react";

export default function OrganizationManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    spectra.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: organizations = [], isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => spectra.entities.Organization.list(),
  });

  const createOrgMutation = useMutation({
    mutationFn: (name) => spectra.entities.Organization.create({ name, is_demo: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setCreateOrgOpen(false);
      setNewOrgName("");
    },
  });

  const isSuperAdmin = currentUser?.is_super_admin || currentUser?.role === 'admin';

  if (!currentUser || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0F1E]">
        <Card className="bg-[#0A0F1E] border-white/5">
          <CardContent className="p-8">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-slate-400 text-center">Access Denied. Super Admin privileges required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedOrg = organizations.find(o => o.id === selectedOrgId);

  // Drill-down: inside an organization
  if (selectedOrg) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedOrgId(null)}
              className="text-slate-400 hover:text-slate-200 hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h1 className="text-xl font-bold text-slate-100">{selectedOrg.name}</h1>
              {selectedOrg.is_demo ? (
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Demo</Badge>
              ) : (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">Production</Badge>
              )}
            </div>
          </div>

          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="bg-[#0F1629] border border-white/[0.06] h-9">
              <TabsTrigger value="users" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
                <Users className="w-3.5 h-3.5 mr-1.5" /> Users
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
                <Settings className="w-3.5 h-3.5 mr-1.5" /> Settings
              </TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <Card className="bg-[#0F1629] border-white/[0.06]">
                <CardContent className="p-5">
                  <OrgUserManagement
                    organizationId={selectedOrg.id}
                    organizationName={selectedOrg.name}
                    isSuperAdmin={isSuperAdmin}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="settings">
              <Card className="bg-[#0F1629] border-white/[0.06]">
                <CardContent className="p-5">
                  <OrgSettings organization={selectedOrg} isSuperAdmin={isSuperAdmin} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Organization list
  return (
    <div className="min-h-screen bg-[#0A0F1E] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Organizations</h1>
            <p className="text-sm text-slate-500 mt-1">Manage all organizations</p>
          </div>
          <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Organization
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0F1629] border-white/10">
              <DialogHeader>
                <DialogTitle>Create New Organization</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Organization Name</Label>
                  <Input
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Enter organization name"
                    className="mt-1.5"
                  />
                </div>
                <Button
                  onClick={() => createOrgMutation.mutate(newOrgName)}
                  disabled={!newOrgName || createOrgMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {createOrgMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : (
          <div className="grid gap-3">
            {organizations.map((org) => (
              <Card
                key={org.id}
                className="bg-[#0F1629] border-white/[0.06] hover:border-white/[0.12] cursor-pointer transition-colors"
                onClick={() => setSelectedOrgId(org.id)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Building2 className="w-4.5 h-4.5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{org.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{org.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {org.ch_configured ? (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                        <Database className="w-3 h-3 mr-1" /> CH
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-[10px]">No DB</Badge>
                    )}
                    {org.is_demo ? (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Demo</Badge>
                    ) : (
                      <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">Production</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}