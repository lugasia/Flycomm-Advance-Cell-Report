import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard, Radio, ShieldAlert, Map, BarChart3, Settings,
  ChevronLeft, ChevronRight, LogOut, Radar, Building2, Shield, Hexagon
} from "lucide-react";
import { AlertProvider, useAlerts } from "./components/AlertContext";
import { base44 } from "@/api/base44Client";
import PlatformHeader from "./components/PlatformHeader";

const NAV_ITEMS = [
  { page: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "RSUs", label: "RSUs", icon: Radio },
  { page: "Clusters", label: "Clusters", icon: Hexagon },
  { page: "Alerts", label: "Alerts", icon: ShieldAlert },
  { page: "CoverageMap", label: "Coverage Map", icon: Map },
  { page: "Analytics", label: "Analytics", icon: BarChart3 },
  { page: "Settings", label: "Settings", icon: Settings },
];

const ADMIN_ITEMS = [];

const SUPER_ADMIN_ITEMS = [
  { page: "OrganizationManagement", label: "Organizations", icon: Building2 },
];

function isAdmin(user) {
  return user?.custom_role === 'admin' || user?.is_super_admin || user?.role === 'admin';
}

function isSuperAdmin(user) {
  return user?.is_super_admin || user?.role === 'admin';
}

function Sidebar({ collapsed, setCollapsed, currentPage, currentUser, orgName }) {
  const { unacknowledgedCount } = useAlerts();

  return (
    <div
      className={`h-full flex flex-col bg-[#0F1629] border-r border-white/[0.06] transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo + Org Name */}
      <div className="h-14 flex items-center px-4 border-b border-white/[0.06]">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 w-full">
          {!collapsed ? <PlatformHeader /> : (
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b939476cddd8fbfb8aee4/70b5f92c5_flycomm_logo.png"
              alt="Flycomm"
              className="w-8 h-8 object-contain flex-shrink-0 brightness-200 invert opacity-90"
            />
          )}
        </button>
      </div>
      {!collapsed && orgName && (
        <div className="px-4 py-2 border-b border-white/[0.06]">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Organization</p>
          <p className="text-[12px] text-slate-200 font-medium truncate">{orgName}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ page, label, icon: Icon }) => {
          const isActive = currentPage === page;
          const showBadge = page === "Alerts" && unacknowledgedCount > 0;
          return (
            <Link
              key={page}
              to={createPageUrl(page)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group relative ${
                isActive
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}`} />
              {!collapsed && <span>{label}</span>}
              {showBadge && (
                <span className={`${collapsed ? "absolute -top-0.5 -right-0.5" : "ml-auto"} min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1`}>
                  {unacknowledgedCount > 99 ? "99+" : unacknowledgedCount}
                </span>
              )}
            </Link>
          );
        })}



        {/* Super Admin Section */}
        {isSuperAdmin(currentUser) && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                {!collapsed && "Super Admin"}
              </p>
            </div>
            {SUPER_ADMIN_ITEMS.map(({ page, label, icon: Icon }) => {
              const isActive = currentPage === page;
              return (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group ${
                    isActive
                      ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                      : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-violet-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                {currentUser?.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-medium text-slate-200 truncate">{currentUser?.full_name || 'User'}</p>
                <p className="text-[10px] text-slate-400 truncate font-mono">{currentUser?.email || ''}</p>
                <p className="text-[9px] text-slate-500">
                  {isSuperAdmin(currentUser) ? 'Super Admin' : (currentUser?.custom_role || 'viewer')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={async () => {
                  await base44.auth.logout();
                  base44.auth.redirectToLogin('/');
                }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 text-slate-600 hover:text-slate-300 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white mx-auto">
              {currentUser?.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
            </div>
            <button
              onClick={async () => {
                await base44.auth.logout();
                base44.auth.redirectToLogin('/');
              }}
              className="w-full flex justify-center p-1 text-slate-600 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-full flex justify-center p-1 text-slate-600 hover:text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [orgName, setOrgName] = React.useState(null);

  React.useEffect(() => {
    const loadUserAndOrg = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        if (user.organization_id) {
          const orgs = await base44.entities.Organization.filter({ id: user.organization_id });
          if (orgs.length > 0) setOrgName(orgs[0].name);
        }
      } catch (e) {}
    };
    loadUserAndOrg();
  }, []);

  return (
    <AlertProvider>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');

        :root {
          --bg-primary: #0A0F1E;
          --bg-surface: #0F1629;
          --bg-elevated: #141B2E;
          --bg-input: #1A2238;
          --accent-safe: #00E5A0;
          --accent-primary: #4A9EFF;
          --accent-warning: #FFB020;
          --accent-critical: #FF2D55;
          --accent-info: #8B5CF6;
          --text-primary: #F1F5F9;
          --text-secondary: #94A3B8;
          --text-muted: #475569;
          --foreground: #F1F5F9;
          --popover: #141B2E;
          --popover-foreground: #F1F5F9;
        }

        * { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
        code, .font-mono, [class*="font-mono"] { font-family: 'JetBrains Mono', monospace !important; }
        
        body, #root { background: var(--bg-primary); color: var(--text-primary); }
        
        input, textarea, select, label, button, td, th, span, p { color: #F1F5F9 !important; }
        input::placeholder, textarea::placeholder { color: #64748B !important; }
        .text-slate-400, .text-slate-500 { color: #94A3B8 !important; }
        .text-muted-foreground { color: #94A3B8 !important; }

        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Leaflet overrides */
        .leaflet-container { background: #0A0F1E !important; }
        .leaflet-popup-content-wrapper { background: transparent !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-tip { display: none !important; }
        .leaflet-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .leaflet-control-attribution { display: none !important; }
        .map-grayscale { filter: grayscale(100%) brightness(0.7) contrast(1.2); }

        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
      <div className="flex h-screen w-screen overflow-hidden bg-[#0A0F1E]">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} currentPage={currentPageName} currentUser={currentUser} orgName={orgName} />
        <main className="flex-1 h-full overflow-auto">
          {children}
        </main>
      </div>
    </AlertProvider>
  );
}