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

const API_BASE = import.meta.env.VITE_SPECTRA_API || 'http://localhost:8001';

// ── Core HTTP helper ─────────────────────────────────────────────

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
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

          // Detect updates (simplified — any change triggers update)
          current.filter(r => prevIds.has(r.id))
            .forEach(r => callback({ type: 'update', data: r }));

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
  Organization:       makeEntity('/api/organizations', { readOnly: true }),
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
    try { await post('/api/auth/logout'); } catch (_) { /* ignore */ }
    // No redirect — no real auth session in Phase 1
  },
  redirectToLogin() {
    // Phase 1: no login page — always authenticated as super admin
    console.info('[Spectra] redirectToLogin called — skipped (Phase 1 super-admin mode)');
  },
};

// ── Users stub (OrgUserManagement calls base44.users.inviteUser) ──

const users = {
  inviteUser: async (email, role) => ({ ok: true, email, role }),
};

// ── Main export — mirrors base44 client shape ─────────────────────

export const spectra = { entities, auth, users };
export const base44  = spectra; // backward-compat alias
