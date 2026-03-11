import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings as SettingsIcon, Gauge, Bell, Users, Building2 } from "lucide-react";
import OrgUserManagement from "../components/org/OrgUserManagement";
import OrgSettings from "../components/org/OrgSettings";

function ThresholdsTab({ organization }) {
  const [thresholds, setThresholds] = useState({
    gps_jamming: 6, gps_spoofing: 4, cellular_anomaly: 10, wifi_deauth: 50, imsi_dwell: 30,
    polygon_buffer: organization?.polygon_buffer_radius || 200,
  });

  const items = [
    { key: "gps_jamming", label: "GPS L1 Band — Jamming threshold", unit: "dB above baseline", min: 3, max: 20 },
    { key: "gps_spoofing", label: "GPS L1 Band — Spoofing C/N0 deviation", unit: "dB", min: 1, max: 15 },
    { key: "cellular_anomaly", label: "Cellular (700-2700 MHz) — Wideband power anomaly", unit: "dB", min: 3, max: 25 },
    { key: "wifi_deauth", label: "Wi-Fi (2.4/5 GHz) — Deauth flood rate", unit: "packets/s", min: 10, max: 500 },
    { key: "imsi_dwell", label: "IMSI Catcher — Unknown BTS dwell time", unit: "seconds", min: 5, max: 120 },
    { key: "polygon_buffer", label: "Polygon buffer radius", unit: "meters", min: 50, max: 1000 },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {items.map(item => (
        <div key={item.key} className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-[11px] text-slate-300">{item.label}</Label>
            <span className="font-mono text-xs text-blue-400">{thresholds[item.key]} {item.unit}</span>
          </div>
          <Slider
            value={[thresholds[item.key]]}
            onValueChange={([v]) => setThresholds(p => ({ ...p, [item.key]: v }))}
            min={item.min}
            max={item.max}
            step={1}
            className="[&_[role=slider]]:bg-blue-500 [&_[role=slider]]:border-blue-600 [&_[role=slider]]:w-3.5 [&_[role=slider]]:h-3.5"
          />
          <div className="flex justify-between text-[9px] text-slate-600 font-mono">
            <span>{item.min}</span><span>{item.max}</span>
          </div>
        </div>
      ))}
      <Button className="bg-blue-600 hover:bg-blue-700 text-xs">Save Thresholds</Button>
    </div>
  );
}

function NotificationsTab({ organization }) {
  const levels = ["critical", "high", "medium", "low"];
  const channels = ["webhook", "email"];
  const defaults = { critical: { webhook: true, email: true }, high: { webhook: true, email: true }, medium: { webhook: true, email: false }, low: { webhook: false, email: false } };
  const [rules, setRules] = useState(defaults);
  const [webhookUrl, setWebhookUrl] = useState(organization?.webhook_url || "");
  const [emailRecipients, setEmailRecipients] = useState((organization?.email_recipients || []).join(", "));

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="space-y-3">
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
      <div>
        <Label className="text-[11px] text-slate-400 mb-2 block">Notification Rules</Label>
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#0F1629] hover:bg-[#0F1629]">
                <TableHead className="text-[10px] text-slate-500 uppercase">Severity</TableHead>
                {channels.map(ch => <TableHead key={ch} className="text-[10px] text-slate-500 uppercase text-center">{ch}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map(lv => (
                <TableRow key={lv} className="border-b border-white/[0.04] bg-[#0F1629]">
                  <TableCell className="text-xs capitalize text-slate-300">{lv}</TableCell>
                  {channels.map(ch => (
                    <TableCell key={ch} className="text-center">
                      <Switch
                        checked={rules[lv]?.[ch]}
                        onCheckedChange={v => setRules(p => ({ ...p, [lv]: { ...p[lv], [ch]: v } }))}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <Button className="bg-blue-600 hover:bg-blue-700 text-xs">Save Notifications</Button>
    </div>
  );
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [organization, setOrganization] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
      if (user.organization_id) {
        const orgs = await base44.entities.Organization.filter({ id: user.organization_id });
        if (orgs.length > 0) setOrganization(orgs[0]);
      }
    };
    loadData();
  }, []);

  const isAdmin = currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin';
  const isSuperAdmin = currentUser?.is_super_admin || currentUser?.role === 'admin';

  if (!currentUser) {
    return <div className="flex items-center justify-center h-full"><div className="text-slate-400">Loading...</div></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-slate-400" /> Settings
        </h1>
        {organization && (
          <span className="text-xs text-slate-500 bg-[#1A2238] px-3 py-1.5 rounded-lg border border-white/[0.06]">
            Organization: <span className="text-slate-200 font-medium">{organization.name}</span>
          </span>
        )}
      </div>
      <Tabs defaultValue="thresholds" className="space-y-4">
        <TabsList className="bg-[#0F1629] border border-white/[0.06] h-9">
          <TabsTrigger value="thresholds" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
            <Gauge className="w-3.5 h-3.5 mr-1.5" /> Thresholds
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
            <Bell className="w-3.5 h-3.5 mr-1.5" /> Notifications
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Users
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="organization" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
              <Building2 className="w-3.5 h-3.5 mr-1.5" /> Organization
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="thresholds"><ThresholdsTab organization={organization} /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab organization={organization} /></TabsContent>
        {isAdmin && (
          <TabsContent value="users">
            {organization ? (
              <OrgUserManagement
                organizationId={organization.id}
                organizationName={organization.name}
                isSuperAdmin={isSuperAdmin}
              />
            ) : (
              <p className="text-xs text-slate-500">No organization assigned.</p>
            )}
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="organization">
            {organization ? (
              <OrgSettings organization={organization} isSuperAdmin={isSuperAdmin} />
            ) : (
              <p className="text-xs text-slate-500">No organization assigned.</p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}