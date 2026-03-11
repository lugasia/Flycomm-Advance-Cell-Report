import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ToggleLeft, ToggleRight, Save } from "lucide-react";

export default function OrgSettings({ organization, isSuperAdmin }) {
  const [name, setName] = useState(organization?.name || "");
  const [dbHost, setDbHost] = useState(organization?.db_host || "");
  const [dbPort, setDbPort] = useState(organization?.db_port || 5432);
  const [dbName, setDbName] = useState(organization?.db_name || "");
  const [dbUsername, setDbUsername] = useState(organization?.db_username || "");
  const [dbSslMode, setDbSslMode] = useState(organization?.db_ssl_mode || "require");
  const [webhookUrl, setWebhookUrl] = useState(organization?.webhook_url || "");
  const [emailRecipients, setEmailRecipients] = useState((organization?.email_recipients || []).join(", "));
  const [saved, setSaved] = useState(false);

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Organization.update(organization.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const toggleDemoMutation = useMutation({
    mutationFn: () => base44.entities.Organization.update(organization.id, { is_demo: !organization.is_demo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const handleSave = () => {
    const data = {
      name,
      webhook_url: webhookUrl,
      email_recipients: emailRecipients.split(",").map(e => e.trim()).filter(Boolean),
    };
    if (isSuperAdmin) {
      data.db_host = dbHost;
      data.db_port = Number(dbPort);
      data.db_name = dbName;
      data.db_username = dbUsername;
      data.db_ssl_mode = dbSslMode;
    }
    updateMutation.mutate(data);
  };

  if (!organization) return null;

  return (
    <div className="space-y-6">
      {/* General */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">General</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Organization Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400">Organization ID</Label>
            <Input value={organization.id} readOnly className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-500 text-xs font-mono" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-[11px] text-slate-400">Demo Mode</Label>
          {organization.is_demo ? (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Active</Badge>
          ) : (
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">Production</Badge>
          )}
          {isSuperAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleDemoMutation.mutate()}
              className="h-7 text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/5"
            >
              {organization.is_demo ? <ToggleRight className="w-3.5 h-3.5 mr-1 text-amber-400" /> : <ToggleLeft className="w-3.5 h-3.5 mr-1" />}
              {organization.is_demo ? "Disable Demo" : "Enable Demo"}
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notifications</h3>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-400">Webhook URL</Label>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://..."
            className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-400">Email Recipients</Label>
          <Input
            value={emailRecipients}
            onChange={(e) => setEmailRecipients(e.target.value)}
            placeholder="ops@company.io, alerts@company.io"
            className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs"
          />
        </div>
      </div>

      {/* Database (Super Admin only) */}
      {isSuperAdmin && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Database Connection</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Host</Label>
              <Input value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="db.example.com" className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Port</Label>
              <Input value={dbPort} onChange={(e) => setDbPort(e.target.value)} type="number" className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Database Name</Label>
              <Input value={dbName} onChange={(e) => setDbName(e.target.value)} className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Username</Label>
              <Input value={dbUsername} onChange={(e) => setDbUsername(e.target.value)} className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono" />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-xs" disabled={updateMutation.isPending}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
        {saved && <span className="text-xs text-green-400">Saved!</span>}
      </div>
    </div>
  );
}