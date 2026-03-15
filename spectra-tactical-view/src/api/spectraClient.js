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

const API_BASE = import.meta.env.VITE_SPECTRA_API || '';

// ── Token management ─────────────────────────────────────────────

const TOKEN_KEY = 'spectra_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Core HTTP helper ─────────────────────────────────────────────

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
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
  async googleLogin(credential) {
    const res = await post('/api/auth/google', { credential });
    setToken(res.token);
    return res.user;
  },
  async logout() {
    try { await post('/api/auth/logout'); } catch (_) { /* ignore */ }
    clearToken();
  },
  redirectToLogin() {
    window.location.href = '/login';
  },
  getToken,
  clearToken,
};

// ── Users stub (OrgUserManagement calls base44.users.inviteUser) ──

const users = {
  inviteUser: async (email, role) => ({ ok: true, email, role }),
};

// ── Timeline ─────────────────────────────────────────────────────

/**
 * fetchTimeline({ fromTs, toTs, bucketMinutes, imei })
 *   fromTs / toTs — ISO strings e.g. "2025-03-01T00:00:00"
 *   bucketMinutes — 1 | 5 | 15 | 60
 *   imei          — optional IMEI filter
 *
 * Returns { frames, total_frames, from_ts, to_ts, bucket_minutes }
 */
async function fetchTimeline({ fromTs, toTs, bucketMinutes = 5, imei } = {}) {
  const params = new URLSearchParams({ from_ts: fromTs, to_ts: toTs, bucket_minutes: bucketMinutes });
  if (imei) params.append('imei', imei);
  return get(`/api/timeline?${params.toString()}`);
}

/** Returns { min_ts, max_ts } of available modem data in ClickHouse. */
async function fetchTimelineRange() {
  return get('/api/timeline/range');
}

// ── Main export ───────────────────────────────────────────────────

export const spectra = { entities, auth, users, fetchTimeline, fetchTimelineRange };
