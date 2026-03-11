import React, { useState, useCallback, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { AnimatePresence } from "framer-motion";
import AlertStreamPanel from "../components/dashboard/AlertStreamPanel";
import TacticalMap from "../components/dashboard/TacticalMap";
import RSUDetailPanel from "../components/dashboard/RSUDetailPanel";
import CesiumMapView from "../components/dashboard/CesiumMapView";
import { useAlerts } from "../components/AlertContext";

export default function Dashboard() {
  const [selectedRsu, setSelectedRsu] = useState(null);
  const [editingRsuId, setEditingRsuId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [show3DView, setShow3DView] = useState(false);
  const [mapRsus, setMapRsus] = useState([]);
  const [mapClusters, setMapClusters] = useState([]);
  const demoRef = useRef(false);
  const { alerts: allAlerts, setActiveOrganizationId, clearDemoAlerts, addDemoAlert } = useAlerts();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        
        const isSuperAdmin = user.is_super_admin || user.role === 'admin';
        const userOrgId = user.organization_id;
        
        if (isSuperAdmin) {
          // Super admins can select any organization
          const allOrgs = await base44.entities.Organization.list();
          setOrganizations(allOrgs);
          if (userOrgId) {
            const userOrg = allOrgs.find(o => o.id === userOrgId);
            if (userOrg) setOrganization(userOrg);
            setSelectedOrgId(userOrgId);
          } else if (allOrgs.length > 0) {
            setSelectedOrgId(allOrgs[0].id);
          }
        } else if (userOrgId) {
          const orgs = await base44.entities.Organization.filter({ id: userOrgId });
          if (orgs.length > 0) {
            setOrganization(orgs[0]);
            setSelectedOrgId(userOrgId);
          }
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  // Sync AlertContext with selected org
  useEffect(() => {
    if (selectedOrgId) {
      setActiveOrganizationId(selectedOrgId);
    }
  }, [selectedOrgId, setActiveOrganizationId]);

  // Auto-fly to last RSU when organization changes
  useEffect(() => {
    if (!selectedOrgId) return;
    const loadOrgData = async () => {
      try {
        const org = await base44.entities.Organization.filter({ id: selectedOrgId });
        if (org.length > 0) { setOrganization(org[0]); }
        
        const orgRsus = await base44.entities.RSU.filter({ organization_id: selectedOrgId });
        if (orgRsus.length > 0) {
          const lastRsu = orgRsus.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
          const lat = parseFloat(lastRsu.latitude);
          const lng = parseFloat(lastRsu.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
            setFlyTarget({ latitude: lat, longitude: lng, id: Date.now() });
          }
          setSelectedRsu(lastRsu);
        }
      } catch (error) {
        console.error("Failed to load org data:", error);
      }
    };
    loadOrgData();
  }, [selectedOrgId]);

  const handleFlyTo = useCallback((alert) => {
    const lat = parseFloat(alert.latitude);
    const lng = parseFloat(alert.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      setFlyTarget({ latitude: lat, longitude: lng, zoom: 18, id: Date.now() });
    }
  }, []);

  const handleRsuClick = useCallback((rsu) => {
    setSelectedRsu(rsu);
    const lat = parseFloat(rsu.latitude);
    const lng = parseFloat(rsu.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      setFlyTarget({ latitude: lat, longitude: lng, id: Date.now() });
    }
  }, []);

  // Subscribe to RSU updates to refresh selectedRsu when status changes
  useEffect(() => {
    if (!selectedRsu) return;
    const unsubscribe = base44.entities.RSU.subscribe((event) => {
      if (event.id === selectedRsu.id) {
        setSelectedRsu(event.data);
      }
    });
    return unsubscribe;
  }, [selectedRsu?.id]);

  // Load RSUs and clusters for 3D view
  useEffect(() => {
    if (!selectedOrgId) return;
    const load3DData = async () => {
      const [r, c] = await Promise.all([
        base44.entities.RSU.filter({ organization_id: selectedOrgId }),
        base44.entities.Cluster.filter({ organization_id: selectedOrgId }),
      ]);
      setMapRsus(r);
      setMapClusters(c);
    };
    load3DData();
  }, [selectedOrgId]);

  // Stop demo and clear demo alerts when switching org
  useEffect(() => {
    demoRef.current = false;
    setDemoRunning(false);
    clearDemoAlerts();
  }, [selectedOrgId, clearDemoAlerts]);

  const handleDemoAlert = () => {
    if (!selectedOrgId) return;
    if (demoRunning) {
      demoRef.current = false;
      setDemoRunning(false);
    } else {
      demoRef.current = true;
      setDemoRunning(true);
    }
  };

  // Demo alert loop - purely in-memory, no DB writes
  useEffect(() => {
    if (!demoRunning || !selectedOrgId) return;

    let orgRsusCache = null;
    let orgClustersCache = null;
    let timeoutId = null;

    const createOneAlert = async () => {
      if (!demoRef.current) return;

      if (!orgRsusCache || orgRsusCache.length === 0) {
        orgRsusCache = await base44.entities.RSU.filter({ organization_id: selectedOrgId });
        if (orgRsusCache.length === 0) {
          demoRef.current = false;
          setDemoRunning(false);
          return;
        }
      }
      if (!orgClustersCache) {
        orgClustersCache = await base44.entities.Cluster.filter({ organization_id: selectedOrgId });
      }

      const ANOMALY_RULES = [
        {
          type: "GPS Jamming",
          severities: ["critical", "high"],
          affected_bands: ["GPS L1 (1575.42 MHz)", "GPS L2 (1227.60 MHz)", "GLONASS G1 (1602 MHz)"],
          descriptions: [
            "C/N0 dropped to {cn0} dB-Hz, only {svs} SVs visible",
            "All satellite signals degraded — no fix available",
            "Sudden drop in visible satellites, AGC saturated"
          ],
          deviation_range: [15, 30],
          confidence_range: [85, 98]
        },
        {
          type: "GPS Spoofing",
          severities: ["high", "medium"],
          affected_bands: ["GPS L1 (1575.42 MHz)", "GPS L2 (1227.60 MHz)"],
          descriptions: [
            "GPS/TA mismatch: {dist}m discrepancy detected",
            "Sudden position jump — {dist}m from last fix",
            "Multi-constellation divergence: GPS vs GLONASS disagree by {dist}m"
          ],
          deviation_range: [0, 0],
          confidence_range: [75, 95]
        },
        {
          type: "Wide-Band Jamming",
          severities: ["critical", "high"],
          affected_bands: ["LTE Band 3 (1800 MHz)", "5G Band 78 (3.5 GHz)", "LTE Band 7 (2600 MHz)"],
          descriptions: [
            "Power variance <2 dB across {band} — spectral flatness detected",
            "SINR collapsed to {sinr} dB on {band}",
            "Multi-RAT degradation: 4G+5G noise spike correlated"
          ],
          deviation_range: [18, 35],
          confidence_range: [88, 99]
        },
        {
          type: "IMSI Catcher",
          severities: ["critical", "high"],
          affected_bands: ["LTE Band 3 (1800 MHz)", "5G Band 78 (3.5 GHz)", "LTE Band 7 (2600 MHz)"],
          descriptions: [
            "TAC Mismatch detected (66666 vs expected 35173)",
            "Zero TA + TAC Mismatch — rogue cell proximity",
            "RSRP abnormally strong (-55 dBm), 0 neighbors — island effect"
          ],
          deviation_range: [25, 40],
          confidence_range: [90, 99]
        },
        {
          type: "Forced 2G Downgrade",
          severities: ["critical", "high", "medium"],
          affected_bands: ["GSM 900 (900 MHz)", "GSM 1800 (1800 MHz)"],
          descriptions: [
            "RAT downgraded to GSM, CRO={cro} dB — aggressive reselection",
            "Forced 2G handover detected — interception risk",
            "LTE → GSM redirect with CRO {cro} dB, cipher A5/0"
          ],
          deviation_range: [30, 45],
          confidence_range: [82, 96]
        },
        {
          type: "Spectral Anomaly",
          severities: ["high", "medium"],
          affected_bands: ["LTE Band 3 (1800 MHz)", "5G Band 78 (3.5 GHz)", "LTE Band 7 (2600 MHz)"],
          descriptions: [
            "RSRP dropped to {rsrp} dBm — noise floor elevation on {band}",
            "RSSI interference spike at {rssi} dBm on {band}",
            "Narrowband power peak sweeping across {band}"
          ],
          deviation_range: [10, 22],
          confidence_range: [70, 90]
        }
      ];

      const randomRsu = orgRsusCache[Math.floor(Math.random() * orgRsusCache.length)];
      
      // Resolve cluster name for display
      let clusterName = "";
      if (randomRsu.cluster_id && orgClustersCache) {
        const cluster = orgClustersCache.find(c => c.id === randomRsu.cluster_id);
        if (cluster) clusterName = cluster.name;
      }

      const rule = ANOMALY_RULES[Math.floor(Math.random() * ANOMALY_RULES.length)];
      const severity = rule.severities[Math.floor(Math.random() * rule.severities.length)];
      const affectedBand = rule.affected_bands[Math.floor(Math.random() * rule.affected_bands.length)];
      const descTemplate = rule.descriptions[Math.floor(Math.random() * rule.descriptions.length)];
      const deviationDb = rule.deviation_range[0] + Math.random() * (rule.deviation_range[1] - rule.deviation_range[0]);
      const confidence = Math.floor(rule.confidence_range[0] + Math.random() * (rule.confidence_range[1] - rule.confidence_range[0]));

      // Fill in template placeholders
      const description = descTemplate
        .replace("{cn0}", (18 + Math.random() * 7).toFixed(1))
        .replace("{svs}", String(Math.floor(Math.random() * 3)))
        .replace("{dist}", String(Math.floor(200 + Math.random() * 500)))
        .replace("{band}", affectedBand)
        .replace("{sinr}", (-2 - Math.random() * 5).toFixed(1))
        .replace("{cro}", String(Math.floor(35 + Math.random() * 15)))
        .replace("{rsrp}", String(-100 - Math.floor(Math.random() * 10)))
        .replace("{rssi}", String(-55 - Math.floor(Math.random() * 10)));

      addDemoAlert({
        id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        organization_id: selectedOrgId,
        severity,
        type: rule.type,
        rsu_id: randomRsu.id,
        cluster_id: randomRsu.cluster_id,
        cluster_name: clusterName,
        device_id: randomRsu.device_id || randomRsu.id,
        latitude: randomRsu.latitude + (Math.random() - 0.5) * 0.001,
        longitude: randomRsu.longitude + (Math.random() - 0.5) * 0.001,
        description,
        deviation_db: Math.round(deviationDb * 10) / 10,
        affected_band: affectedBand,
        confidence,
        status: "active",
        created_date: new Date().toISOString(),
      });

      if (demoRef.current) {
        const delay = 5000 + Math.floor(Math.random() * 5000);
        timeoutId = setTimeout(createOneAlert, delay);
      }
    };

    createOneAlert();

    return () => {
      demoRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [demoRunning, selectedOrgId, addDemoAlert]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  // Super admins can view all organizations - no organization filter needed
  // Regular users need an organization assigned
  if (!currentUser.organization_id && !currentUser.is_super_admin && currentUser.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="text-slate-400">No organization assigned. Please contact your administrator.</div>
          <div className="text-xs text-slate-600">Logged in as: {currentUser.email}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Alert Stream - Left Panel */}
      <div className="w-[280px] min-w-[280px] flex-shrink-0 h-full flex flex-col">
        {/* Organization Selector for Super Admins */}
        {/* Org selector for super admins */}
        {(currentUser?.is_super_admin || currentUser?.role === 'admin') && organizations?.length > 0 && (
          <div className="p-3 border-b border-white/[0.06] bg-[#0F1629] space-y-2 flex-shrink-0">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Organization
            </label>
            <select
              value={selectedOrgId || ""}
              onChange={(e) => {
                setSelectedOrgId(e.target.value);
                const org = organizations.find(o => o.id === e.target.value);
                if (org) setOrganization(org);
              }}
              className="w-full px-2 py-1.5 bg-[#1A2238] border border-white/20 rounded text-[12px] text-slate-100 hover:border-white/40 transition-colors"
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Demo controls - shown when org is in demo mode */}
        {organization?.is_demo && (
          <div className="p-3 border-b border-white/[0.06] bg-[#0F1629] space-y-2 flex-shrink-0">
            <button
              onClick={handleDemoAlert}
              disabled={!selectedOrgId}
              className={`w-full px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${demoRunning ? "bg-green-500/30 border border-green-500/30 text-green-400 animate-pulse" : "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"} disabled:opacity-30`}
            >
              {demoRunning ? "🟢 Simulating Threats (click to stop)" : "🔴 Demo Threat"}
            </button>
            <button
              onClick={() => { demoRef.current = false; setDemoRunning(false); clearDemoAlerts(); }}
              className="w-full px-2 py-1.5 rounded text-[11px] font-medium bg-slate-500/20 border border-slate-500/30 text-slate-400 hover:bg-slate-500/30 transition-colors"
            >
              🧹 Clear All Alerts
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <AlertStreamPanel onFlyTo={handleFlyTo} />
        </div>
      </div>

      {/* Tactical Map - Center */}
      <div className="flex-1 h-full relative">
        <TacticalMap
          flyTarget={flyTarget}
          onRsuClick={handleRsuClick}
          selectedRsuId={selectedRsu?.id}
          organizationId={selectedOrgId || currentUser?.organization_id}
          editingRsuId={editingRsuId}
          isAdmin={currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin'}
          isSuperAdmin={currentUser?.is_super_admin || currentUser?.role === 'admin'}
        />

        {/* 3D View Toggle */}
        {!show3DView && (
          <button
            onClick={() => setShow3DView(true)}
            className="absolute bottom-10 right-3 z-[1000] px-3 py-2 bg-[#141B2E]/90 border border-white/10 rounded-lg text-[12px] text-slate-300 hover:text-slate-100 hover:bg-white/10 transition-colors backdrop-blur-md flex items-center gap-2 font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/></svg>
            3D Globe
          </button>
        )}

        {/* 3D View Overlay - Cesium Globe */}
        {show3DView && (
          <CesiumMapView
            rsus={mapRsus}
            clusters={mapClusters}
            alerts={allAlerts}
            onClose={() => setShow3DView(false)}
            onRsuClick={handleRsuClick}
          />
        )}
      </div>



      {/* RSU Detail Panel - Slides from right */}
      <AnimatePresence>
        {selectedRsu && (
          <RSUDetailPanel
            key={selectedRsu.id}
            rsu={selectedRsu}
            onClose={() => setSelectedRsu(null)}
            organizationId={selectedOrgId || currentUser?.organization_id}
            isEditing={editingRsuId === selectedRsu.id}
            onEditChange={setEditingRsuId}
            isAdmin={currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}