import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Pencil, Trash2, Shield } from "lucide-react";

export default function OrgUserManagement({ organizationId, organizationName, isSuperAdmin }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [editingUser, setEditingUser] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  // Fetch members from the OrganizationMember entity (accessible to all users)
  const { data: orgUsers = [], isLoading } = useQuery({
    queryKey: ['org-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      return await base44.entities.OrganizationMember.filter({ organization_id: organizationId });
    },
    enabled: !!organizationId,
  });

  const [inviteError, setInviteError] = useState("");

  const inviteMutation = useMutation({
    mutationFn: async ({ email, name, role }) => {
      setInviteError("");
      
      // Check if member already exists in this org
      const existing = orgUsers.find(m => m.user_email === email);
      if (existing) {
        throw new Error("This user is already a member of this organization.");
      }

      // Try to invite user to the platform (only works for platform admins)
      try {
        await base44.users.inviteUser(email, "user");
      } catch (err) {
        // Not a platform admin - that's OK, just add to org membership
        console.log("Platform invite skipped (not platform admin), adding to org membership only.");
      }

      // Create OrganizationMember record
      await base44.entities.OrganizationMember.create({
        organization_id: organizationId,
        user_email: email,
        user_name: name || email.split('@')[0],
        role: role,
        is_super_admin: false,
      });

      // Also try to update the User entity if we have access
      try {
        const allUsers = await base44.entities.User.list();
        const user = allUsers.find(u => u.email === email);
        if (user) {
          await base44.entities.User.update(user.id, {
            organization_id: organizationId,
            custom_role: role,
          });
        }
      } catch (e) {
        // Regular users can't list all users - that's fine
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', organizationId] });
      setInviteEmail("");
      setInviteName("");
      setInviteRole("viewer");
      setDialogOpen(false);
      setInviteError("");
    },
    onError: (err) => {
      setInviteError(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ memberId, data }) => {
      await base44.entities.OrganizationMember.update(memberId, data);
      // Also try to sync to User entity
      try {
        if (data.user_id) {
          await base44.entities.User.update(data.user_id, {
            custom_role: data.role,
            ...(isSuperAdmin && data.is_super_admin !== undefined ? { is_super_admin: data.is_super_admin } : {}),
          });
        }
      } catch (e) { /* ok if no access */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', organizationId] });
      setEditDialogOpen(false);
      setEditingUser(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (memberId) => {
      await base44.entities.OrganizationMember.delete(memberId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', organizationId] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Users ({orgUsers.length})
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs h-8">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0F1629] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-slate-100">Invite User to {organizationName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-slate-200">Full Name</Label>
                <Input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="John Doe"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-200">Email</Label>
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-200">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (full access)</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {inviteError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-2">{inviteError}</p>
              )}
              <Button
                onClick={() => inviteMutation.mutate({ email: inviteEmail, name: inviteName, role: inviteRole })}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!inviteEmail || inviteMutation.isPending}
              >
                {inviteMutation.isPending ? "Adding..." : "Add User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#0A0F1E] hover:bg-[#0A0F1E]">
              <TableHead className="text-[10px] text-slate-500 uppercase">Name</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase">Email</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase">Role</TableHead>
              <TableHead className="text-[10px] text-slate-500 uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="bg-[#0F1629]">
                <TableCell colSpan={4} className="text-xs text-slate-500 text-center py-6">Loading...</TableCell>
              </TableRow>
            ) : orgUsers.length === 0 ? (
              <TableRow className="bg-[#0F1629]">
                <TableCell colSpan={4} className="text-xs text-slate-600 text-center py-6">No users in this organization</TableCell>
              </TableRow>
            ) : (
              orgUsers.map((member) => (
                <TableRow key={member.id} className="border-white/[0.04] bg-[#0F1629]">
                  <TableCell className="text-xs text-slate-200">{member.user_name || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-400 font-mono">{member.user_email}</TableCell>
                  <TableCell>
                    <span className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded ${
                      member.role === "admin" ? "bg-violet-500/10 text-violet-400" :
                      member.role === "operator" ? "bg-blue-500/10 text-blue-400" :
                      "bg-slate-500/10 text-slate-400"
                    }`}>
                      {member.role || "viewer"}
                    </span>
                    {member.is_super_admin && (
                      <Shield className="w-3 h-3 text-amber-400 inline ml-1.5" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 w-7 p-0"
                        onClick={() => { setEditingUser({ ...member }); setEditDialogOpen(true); }}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                        onClick={() => {
                          if (confirm("Are you sure you want to remove this user?")) {
                            deleteMutation.mutate(member.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-[#0F1629] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Edit User</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-slate-200">Email</Label>
                <Input value={editingUser.user_email} disabled className="mt-1 bg-slate-800/50" />
              </div>
              <div>
                <Label className="text-slate-200">Name</Label>
                <Input 
                  value={editingUser.user_name || ""} 
                  onChange={(e) => setEditingUser({ ...editingUser, user_name: e.target.value })}
                  className="mt-1" 
                />
              </div>
              <div>
                <Label className="text-slate-200">Role</Label>
                <Select
                  value={editingUser.role || "viewer"}
                  onValueChange={(val) => setEditingUser({ ...editingUser, role: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit_super_admin"
                    checked={editingUser.is_super_admin || false}
                    onChange={(e) => setEditingUser({ ...editingUser, is_super_admin: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="edit_super_admin" className="text-slate-200 cursor-pointer">
                    Super Admin
                  </Label>
                </div>
              )}
              <Button
                onClick={() => updateMutation.mutate({
                  memberId: editingUser.id,
                  data: {
                    role: editingUser.role,
                    user_name: editingUser.user_name,
                    user_id: editingUser.user_id,
                    ...(isSuperAdmin ? { is_super_admin: editingUser.is_super_admin } : {}),
                  },
                })}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Updating..." : "Update User"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}