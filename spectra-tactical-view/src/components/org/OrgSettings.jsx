import React, { useState } from "react";
import { spectra } from "@/api/spectraClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ToggleLeft, ToggleRight, Save, Database, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function OrgSettings({ organization, isSuperAdmin, onUpdated }) {
  const [name, setName] = useState(organization?.name || "");
  const [isDemo, setIsDemo] = useState(organization?.is_demo || false);

  // ClickHouse connection fields
  const [chHost, setChHost] = useState(organization?.ch_host || "");
  const [chPort, setChPort] = useState(organization?.ch_port || 8443);
  const [chDb, setChDb] = useState(organization?.ch_db || "default");
  const [chUser, setChUser] = useState(organization?.ch_user || "");
  const [chPassword, setChPassword] = useState("");
  const [chSsl, setChSsl] = useState(organization?.ch_ssl !== false);

  // Test connection state
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [testMessage, setTestMessage] = useState("");

  const [webhookUrl, setWebhookUrl] = useState(organization?.webhook_url || "");
  const [emailRecipients, setEmailRecipients] = useState((organization?.email_recipients || []).join(", "));
  const [saved, setSaved] = useState(false);

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => spectra.entities.Organization.update(organization.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const toggleDemoMutation = useMutation({
    mutationFn: () => spectra.entities.Organization.update(organization.id, { is_demo: !isDemo }),
    onSuccess: (updated) => {
      const newIsDemo = !isDemo;
      setIsDemo(newIsDemo);
      onUpdated?.({ ...organization, is_demo: newIsDemo, ...updated });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await spectra.testChConnection({
        host: chHost,
        port: Number(chPort),
        db: chDb,
        user: chUser,
        password: chPassword,
        ssl: chSsl,
      });
      setTestStatus('ok');
      setTestMessage(`Connected — ClickHouse ${result.version || 'OK'}`);
    } catch (e) {
      setTestStatus('error');
      setTestMessage(e.message || 'Connection failed');
    }
  };

  const handleSave = () => {
    const data = { name };
    if (isSuperAdmin) {
      data.ch_host = chHost;
      data.ch_port = Number(chPort);
      data.ch_db = chDb;
      data.ch_user = chUser;
      data.ch_ssl = chSsl;
      if (chPassword) data.ch_password = chPassword;
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
          {isDemo ? (
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
              {isDemo ? <ToggleRight className="w-3.5 h-3.5 mr-1 text-amber-400" /> : <ToggleLeft className="w-3.5 h-3.5 mr-1" />}
              {isDemo ? "Disable Demo" : "Enable Demo"}
            </Button>
          )}
        </div>
      </div>

      {/* ClickHouse Connection (Super Admin only) */}
      {isSuperAdmin && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ClickHouse Connection</h3>
            {organization.ch_configured && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">Connected</Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Browser queries measurements directly from ClickHouse. Enter your ClickHouse Cloud credentials below.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Host</Label>
              <Input
                value={chHost}
                onChange={(e) => setChHost(e.target.value)}
                placeholder="xyz.clickhouse.cloud"
                className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Port</Label>
              <Input
                value={chPort}
                onChange={(e) => setChPort(e.target.value)}
                type="number"
                className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Database</Label>
              <Input
                value={chDb}
                onChange={(e) => setChDb(e.target.value)}
                placeholder="default"
                className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400">Username</Label>
              <Input
                value={chUser}
                onChange={(e) => setChUser(e.target.value)}
                placeholder="default"
                className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-[11px] text-slate-400">Password</Label>
              <Input
                type="password"
                value={chPassword}
                onChange={(e) => setChPassword(e.target.value)}
                placeholder={organization.ch_configured ? "••••••• (unchanged)" : "Enter password"}
                className="h-9 bg-[#1A2238] border-white/[0.06] text-slate-200 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={chSsl}
                onChange={(e) => setChSsl(e.target.checked)}
                className="rounded border-white/20 bg-[#1A2238]"
              />
              <span className="text-[11px] text-slate-400">Use SSL (HTTPS)</span>
            </label>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestConnection}
              disabled={!chHost || !chUser || !chPassword || testStatus === 'testing'}
              className="h-8 text-xs bg-transparent border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              {testStatus === 'testing' ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5 mr-1.5" />
              )}
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </Button>

            {testStatus === 'ok' && (
              <span className="flex items-center gap-1 text-[11px] text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {testMessage}
              </span>
            )}
            {testStatus === 'error' && (
              <span className="flex items-center gap-1 text-[11px] text-red-400 max-w-md truncate">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {testMessage}
              </span>
            )}
          </div>
        </div>
      )}

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
