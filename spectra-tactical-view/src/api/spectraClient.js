/**
 * Spectra API Client — drop-in replacement for the Base44 SDK.
 *
 * Exposes the same interface: spectra.entities.RSU.list() etc.
 * All data comes from the local FastAPI (spectra-api/) which reads
 * ClickHouse measurements WHERE source = 'modem'.
 *
 * Run the backend first:
 *   cd spectra-api && bash start.sh
 */

import { supabase } from '@/lib/supabase';

const API_BASE = import.meta.env.VITE_SPECTRA_API || '';

// ── Core HTTP helper ─────────────────────────────────────────────

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };

  // Get token from Supabase session (auto-refreshed)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.href = '/login';
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }
    const text = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(text), { status: res.status });
  }
  return res.json();
}

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const put  = (path, body)  => request('PUT',    path, body);
const del  = (path)        => request('DELETE', path);

// ── Query string builder ─────────────────────────────────────────

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) p.append(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Entity factory — mirrors Base44 entity interface ─────────────

function makeEntity(basePath, opts = {}) {
  const pollers = new Map(); // subscribe → polling timer map

  return {
    async list(params) {
      return get(`${basePath}${qs(params)}`);
    },
    async filter(criteria, sortBy, limit) {
      const params = { ...criteria };
      if (limit) params.limit = limit;
      return get(`${basePath}${qs(params)}`);
    },
    async get(id) {
      return get(`${basePath}/${id}`);
    },
    async create(data) {
      if (opts.readOnly) throw new Error(`${basePath} is read-only`);
      return post(basePath, data);
    },
    async update(id, data) {
      if (opts.readOnly) return { id, ...data }; // no-op for read-only
      return put(`${basePath}/${id}`, data);
    },
    async delete(id) {
      if (opts.readOnly) throw new Error(`${basePath} is read-only`);
      return del(`${basePath}/${id}`);
    },
    /**
     * subscribe(callback) — polls every 30s and fires callback with
     * synthetic create/update/delete events. Returns unsubscribe fn.
     */
    subscribe(callback) {
      let previous = [];
      let cancelled = false;

      const poll = async () => {
        if (cancelled) return;
        try {
          const current = await get(basePath);
          const prevIds = new Set(previous.map(r => r.id));
          const currIds = new Set(current.map(r => r.id));

          // Detect creates
          current.filter(r => !prevIds.has(r.id))
            .forEach(r => callback({ type: 'create', data: r }));

          // Detect updates — only fire when data actually changed
          const prevById = Object.fromEntries(previous.map(r => [r.id, r]));
          current.filter(r => prevIds.has(r.id))
            .forEach(r => {
              if (JSON.stringify(prevById[r.id]) !== JSON.stringify(r)) {
                callback({ type: 'update', data: r });
              }
            });

          // Detect deletes
          previous.filter(r => !currIds.has(r.id))
            .forEach(r => callback({ type: 'delete', data: r }));

          previous = current;
        } catch (e) {
          // Swallow polling errors silently
        }
      };

      poll(); // initial fetch
      const timer = setInterval(poll, 30_000);

      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    },
  };
}

// ── Stub entity — no-ops for unimplemented endpoints ────────────

const stub = (name) => ({
  list:      async () => [],
  filter:    async () => [],
  get:       async () => null,
  create:    async (d) => ({ id: `${name}-${Date.now()}`, ...d }),
  update:    async (id, d) => ({ id, ...d }),
  delete:    async () => ({ ok: true }),
  subscribe: () => () => {},
});

// ── Entities ─────────────────────────────────────────────────────

const entities = {
  RSU:                makeEntity('/api/rsus'),
  Alert:              makeEntity('/api/alerts'),
  Cluster:            makeEntity('/api/clusters'),
  Organization:       makeEntity('/api/organizations'),
  // Stubs for settings pages (Phase 2 will wire these up)
  OrganizationMember: stub('org-member'),
  User:               stub('user'),
};

// ── Auth ─────────────────────────────────────────────────────────

const auth = {
  async me() {
    return get('/api/auth/me');
  },
  async logout() {
    await supabase.auth.signOut();
  },
};

// ── Users stub (OrgUserManagement calls base44.users.inviteUser) ──

const users = {
  inviteUser: async (email, role) => ({ ok: true, email, role }),
};

// ── Timeline (browser-side ClickHouse) ───────────────────────────

const MODEM_SOURCE = 'modem';

/**
 * fetchTimelineRange(orgId) — returns { min_ts, max_ts } from ClickHouse.
 */
async function fetchTimelineRange(orgId) {
  const sql = `
SELECT
    toString(min(timestamp)) AS min_ts,
    toString(max(timestamp)) AS max_ts
FROM measurements
WHERE source = '${MODEM_SOURCE}'
  AND deviceInfo_imei != ''
  AND signal_rsrp != 0`;
  const json = await queryClickHouse(sql, orgId);
  const row = json.data?.[0] || {};
  return { min_ts: row.min_ts || '', max_ts: row.max_ts || '' };
}

/**
 * fetchTimeline({ fromTs, toTs, bucketMinutes, imei, orgId })
 *   Queries ClickHouse directly from browser.
 *   Returns { frames, total_frames, from_ts, to_ts, bucket_minutes }
 */
async function fetchTimeline({ fromTs, toTs, bucketMinutes = 5, imei, orgId } = {}) {
  const imeiClause = imei ? `AND deviceInfo_imei = '${imei}'` : '';
  const sql = `
SELECT
    toStartOfInterval(timestamp, INTERVAL ${bucketMinutes} MINUTE) AS t,
    deviceInfo_imei AS imei,
    round(argMax(location_geo_coordinates.2, timestamp), 6) AS lat,
    round(argMax(location_geo_coordinates.1, timestamp), 6) AS lng,
    argMax(signal_rsrp, timestamp) AS rsrp,
    argMax(tech, timestamp) AS tech,
    argMax(network_operator, timestamp) AS operator,
    argMax(network_PLMN, timestamp) AS plmn,
    argMax(cell_tac, timestamp) AS tac,
    count() AS samples
FROM measurements
WHERE source = '${MODEM_SOURCE}'
  AND deviceInfo_imei != ''
  AND timestamp >= toDateTime('${fromTs}')
  AND timestamp <= toDateTime('${toTs}')
  AND signal_rsrp != 0
  AND location_geo_coordinates.2 != 0
  ${imeiClause}
GROUP BY t, imei
ORDER BY t ASC, imei ASC`;

  const json = await queryClickHouse(sql, orgId);
  const rows = json.data || [];

  // Group rows by timestamp bucket into frames
  const framesMap = {};
  for (const row of rows) {
    const t = String(row.t || '');
    if (!framesMap[t]) framesMap[t] = [];
    framesMap[t].push({
      imei:     row.imei || '',
      lat:      parseFloat(row.lat) || 0,
      lng:      parseFloat(row.lng) || 0,
      rsrp:     parseInt(row.rsrp) || 0,
      tech:     row.tech || '',
      operator: row.operator || '',
      plmn:     row.plmn || '',
      tac:      parseInt(row.tac) || 0,
      samples:  parseInt(row.samples) || 0,
    });
  }

  const frames = Object.entries(framesMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, rsus]) => ({ t, rsus }));

  return {
    frames,
    total_frames: frames.length,
    from_ts: fromTs,
    to_ts: toTs,
    bucket_minutes: bucketMinutes,
  };
}

// ── Server-side ClickHouse query proxy ──────────────────────────
// Credentials NEVER leave the server — all queries go through the API.

/**
 * Execute a ClickHouse SQL query via the server-side proxy.
 * Returns { data: [...], rows: N }.
 */
async function queryClickHouse(sql, orgId) {
  return post(`/api/organizations/${orgId}/ch-query`, { sql });
}

/**
 * Test ClickHouse connection via server-side proxy (for OrgSettings form).
 * Credentials are sent to the API only, never to ClickHouse directly from browser.
 */
async function testChConnection({ host, port = 8443, db = 'default', user, password, ssl = true }) {
  return post('/api/ch-test', { host, port, db, user, password, ssl });
}

/** @deprecated No longer needed — credentials stay server-side. */
function loadChConfig() { return Promise.resolve({}); }
function clearChConfig() { /* no-op */ }

// ── Main export ───────────────────────────────────────────────────

export const spectra = { entities, auth, users, fetchTimeline, fetchTimelineRange, queryClickHouse, testChConnection, loadChConfig, clearChConfig };
