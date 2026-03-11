import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [demoAlerts, setDemoAlerts] = useState([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [organizationId, setOrganizationId] = useState(null);

  const setActiveOrganizationId = useCallback((orgId) => {
    setOrganizationId(orgId);
    setDemoAlerts([]); // Clear demo alerts when switching org
  }, []);

  // Load user org on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await base44.auth.me();
        if (user.organization_id) {
          setOrganizationId(user.organization_id);
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  // Fetch alerts when organizationId changes
  useEffect(() => {
    if (!organizationId) return;
    const loadAlerts = async () => {
      try {
        const fetchedAlerts = await base44.entities.Alert.filter(
          { organization_id: organizationId },
          '-created_date',
          100
        );
        setAlerts(fetchedAlerts);
      } catch (error) {
        console.error("Failed to load alerts:", error);
      }
    };
    loadAlerts();
  }, [organizationId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!organizationId) return;

    const unsubscribe = base44.entities.Alert.subscribe((event) => {
      if (event.data?.organization_id !== organizationId) return;

      if (event.type === 'create') {
        setAlerts(prev => [event.data, ...prev].slice(0, 100));
      } else if (event.type === 'update') {
        setAlerts(prev => prev.map(a => a.id === event.id ? event.data : a));
      } else if (event.type === 'delete') {
        setAlerts(prev => prev.filter(a => a.id !== event.id));
      }
    });

    return unsubscribe;
  }, [organizationId]);

  // Combine real alerts + demo alerts
  const allAlerts = React.useMemo(() => {
    return [...demoAlerts, ...alerts];
  }, [alerts, demoAlerts]);

  useEffect(() => {
    setUnacknowledgedCount(allAlerts.filter(a => a.status === "active").length);
  }, [allAlerts]);

  const acknowledgeAlert = useCallback(async (alertId) => {
    // Check if it's a demo alert (demo alerts have string ids starting with "demo-")
    const isDemo = demoAlerts.some(a => a.id === alertId);
    if (isDemo) {
      setDemoAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "acknowledged" } : a));
      return;
    }
    await base44.entities.Alert.update(alertId, { 
      status: "acknowledged",
      acknowledged_by: (await base44.auth.me()).email
    });
    // Optimistic update for immediate UI feedback
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "acknowledged" } : a));
  }, [demoAlerts]);

  const resolveAlert = useCallback(async (alertId) => {
    const isDemo = demoAlerts.some(a => a.id === alertId);
    if (isDemo) {
      setDemoAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "resolved", resolved_at: new Date().toISOString() } : a));
      return;
    }
    await base44.entities.Alert.update(alertId, { 
      status: "resolved",
      resolved_at: new Date().toISOString()
    });
    // Optimistic update for immediate UI feedback
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "resolved", resolved_at: new Date().toISOString() } : a));
  }, [demoAlerts]);

  const addDemoAlert = useCallback((alert) => {
    setDemoAlerts(prev => [alert, ...prev].slice(0, 100));
  }, []);

  const clearDemoAlerts = useCallback(() => {
    setDemoAlerts([]);
  }, []);

  return (
    <AlertContext.Provider value={{ alerts: allAlerts, unacknowledgedCount, acknowledgeAlert, resolveAlert, setActiveOrganizationId, addDemoAlert, clearDemoAlerts }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used within AlertProvider");
  return ctx;
}