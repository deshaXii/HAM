// src/lib/api.js

// Simple API client for the new backend
const BASE = (
  import.meta.env.VITE_API_URL || `${window.location.origin}/api`
).replace(/\/+$/, "");

function getToken() {
  return localStorage.getItem("auth_token");
}
export function setToken(t) {
  if (t) localStorage.setItem("auth_token", t);
  else localStorage.removeItem("auth_token");
}
export function authHeaders() {
  const t = getToken();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

// -------- Auth --------
export async function apiSignup({ name, email, password, inviteCode }) {
  const r = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, inviteCode }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Signup failed");
  setToken(j.token);
  return j;
}
export async function apiLogin({ email, password }) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Login failed");
  setToken(j.token);
  return j;
}
export async function apiMe() {
  const r = await fetch(`${BASE}/me`, { headers: authHeaders() });
  if (r.status === 401) return null;
  const j = await r.json();
  return j;
}

// -------- State (shared) --------
// NOTE: We no longer PUT the entire planner state blob.
// Instead, we load state by assembling normalized resources, and save using minimal diffs.

let __plannerLastState = null;

// ---------------- Job normalization (server <-> UI) ----------------
// Server historically returns slot as a number (often 0), while the UI uses "day" | "night".
// If we diff raw server jobs vs UI jobs, EVERY job looks "changed" and we end up batching the whole week.
// That can surface unrelated validation errors and block saving.
function normalizeJobSlotFromStart(start) {
  const hour = parseInt(String(start || "0").split(":")[0] || "0", 10);
  return hour >= 20 || hour < 8 ? "night" : "day";
}

function normalizeJob(job) {
  const j = { ...(job || {}) };

  // IDs sometimes arrive with accidental whitespace
  if (typeof j.id === "string") j.id = j.id.trim();

  // Slot normalization
  if (j.slot !== "day" && j.slot !== "night") {
    j.slot = normalizeJobSlotFromStart(j.start);
  }

  // Normalize nullable IDs
  if (j.tractorId === "") j.tractorId = null;
  if (j.trailerId === "") j.trailerId = null;

  // DriverIds should always be an array
  if (!Array.isArray(j.driverIds)) j.driverIds = [];

  // Pricing normalization (avoid "" causing churn)
  if (j.pricing && typeof j.pricing === "object") {
    const v = j.pricing.value;
    if (v === "") j.pricing.value = 0;
    if (typeof j.pricing.value === "string" && j.pricing.value.trim() !== "") {
      const num = Number(j.pricing.value);
      if (Number.isFinite(num)) j.pricing.value = num;
    }
  }

  // Financials numeric normalization
  for (const k of ["revenueTrip", "costDriver", "costTruck", "costDiesel"]) {
    if (j[k] === "") j[k] = 0;
    if (typeof j[k] === "string") {
      const num = Number(j[k]);
      if (Number.isFinite(num)) j[k] = num;
    }
  }

  return j;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // body may be empty or plain text
    }

    const isConflict = res.status === 409;
    const baseMsg = body?.error || body?.message || `HTTP ${res.status}`;
    const err = new Error(
      isConflict
        ? body?.error ||
          "State was updated by another user/session. Reload the planner and try again."
        : baseMsg
    );

    err.status = res.status;
    if (body?.code) err.code = body.code;
    if (isConflict && !err.code) err.code = "STATE_VERSION_CONFLICT";
    if (body?.meta) err.meta = body.meta;

    throw err;
  }

  // OK
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** ✅ NEW: optional fetch (404/405 => fallback) */
async function fetchOptionalJson(url, opts = {}, fallback = null) {
  try {
    return await fetchJson(url, opts);
  } catch (e) {
    if (e && (e.status === 404 || e.status === 405)) return fallback;
    throw e;
  }
}

function plannerHeaders(version) {
  const h = authHeaders();
  if (version !== null && version !== undefined) {
    h["X-Planner-Version"] = String(version);
  }
  return h;
}

function plannerDeleteHeaders(version) {
  const h = plannerHeaders(version);
  h["X-Delete-Intent"] = "1";
  return h;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffList(prev = [], next = []) {
  const pMap = new Map(prev.map((x) => [x?.id, x]));
  const nMap = new Map(next.map((x) => [x?.id, x]));

  const creates = [];
  const deletes = [];
  const updates = [];

  for (const [id] of pMap) {
    if (!nMap.has(id)) deletes.push(id);
  }
  for (const [id, item] of nMap) {
    if (!pMap.has(id)) creates.push(item);
  }
  for (const [id, item] of nMap) {
    if (!pMap.has(id)) continue;
    const prevItem = pMap.get(id);
    if (!deepEqual(prevItem, item)) updates.push({ id, item });
  }

  return { creates, deletes, updates };
}

// Safety helper: when a screen produces partial state (undefined/null lists), treat it as "no change"
function safeList(nextList, fallbackList) {
  return Array.isArray(nextList) ? nextList : Array.isArray(fallbackList) ? fallbackList : [];
}






export async function apiGetState() {
  const [
    metaR,
    settingsR,
    driversR,
    tractorsR,
    trailersR,
    jobsR,
    locationsR,
    distancesR,
    agendaR, // ✅ NEW
  ] = await Promise.all([
    fetchJson(`${BASE}/meta`, { headers: authHeaders() }),
    fetchJson(`${BASE}/settings`, { headers: authHeaders() }),
    fetchJson(`${BASE}/drivers`, { headers: authHeaders() }),
    fetchJson(`${BASE}/tractors`, { headers: authHeaders() }),
    fetchJson(`${BASE}/trailers`, { headers: authHeaders() }),
    fetchJson(`${BASE}/jobs`, { headers: authHeaders() }),
    fetchJson(`${BASE}/locations`, { headers: authHeaders() }),
    fetchJson(`${BASE}/distances`, { headers: authHeaders() }),
    fetchOptionalJson(
      `${BASE}/agenda`,
      { headers: authHeaders() },
      { agenda: [] }
    ), // ✅ NEW
  ]);

  const meta = metaR?.meta || { weekStart: null, version: 1 };

  const state = {
    version: Number(meta.version || 1),
    weekStart: meta.weekStart || null,
    drivers: driversR?.drivers || [],
    tractors: tractorsR?.tractors || [],
    trailers: trailersR?.trailers || [],
    jobs: (jobsR?.jobs || []).map(normalizeJob),
    locations: locationsR?.locations || [],
    distanceKm: distancesR?.distanceKm || {},
    agenda: agendaR?.agenda || [], // ✅ NEW
    settings: settingsR?.settings || {
      rates: { driverPerKm: 0.25, doubleMannedMultiplier: 1.15 },
      trailerDayCost: { refrigerated: 35, box: 25, flatbed: 20 },
    },
  };

  __plannerLastState = state;
  return state;
}

export async function apiSaveState(nextState) {
  // Ensure we have a baseline (server state) to diff against
  if (!__plannerLastState) {
    __plannerLastState = await apiGetState();
  }

  const prev = __plannerLastState;


  // Safety: if a screen produces partial state (missing lists), treat it as "no change".
  // This prevents accidental deletes/overwrites.
  nextState = {
    ...nextState,
    drivers: safeList(nextState.drivers, prev.drivers),
    tractors: safeList(nextState.tractors, prev.tractors),
    trailers: safeList(nextState.trailers, prev.trailers),
    locations: safeList(nextState.locations, prev.locations),
    jobs: safeList(
      Array.isArray(nextState.jobs) ? nextState.jobs.map(normalizeJob) : [],
      prev.jobs
    ),
    agenda: safeList(nextState.agenda, prev.agenda),
  };

  // Quick no-op
  if (deepEqual(prev, nextState)) return prev;

  // We apply diffs sequentially, updating the planner version after each mutation.
  let current = { ...prev };
  let version = Number(prev.version || 1);

  async function doPatch(url, body) {
    const r = await fetchJson(url, {
      method: "PATCH",
      headers: plannerHeaders(version),
      body: JSON.stringify(body),
    });
    if (r?.meta?.version) version = Number(r.meta.version);
    if (r?.meta?.weekStart !== undefined) current.weekStart = r.meta.weekStart;
    current.version = version;
    return r;
  }

  async function doPost(url, body) {
    const r = await fetchJson(url, {
      method: "POST",
      headers: plannerHeaders(version),
      body: JSON.stringify(body),
    });
    if (r?.meta?.version) version = Number(r.meta.version);
    current.version = version;
    return r;
  }

  async function doPut(url, body) {
    const r = await fetchJson(url, {
      method: "PUT",
      headers: plannerHeaders(version),
      body: JSON.stringify(body),
    });
    if (r?.meta?.version) version = Number(r.meta.version);
    current.version = version;
    return r;
  }

  async function doDelete(url) {
    const r = await fetchJson(url, {
      method: "DELETE",
      headers: plannerHeaders(version),
    });
    if (r?.meta?.version) version = Number(r.meta.version);
    current.version = version;
    return r;
  }

  // 1) Meta (weekStart)
  if (!deepEqual(prev.weekStart || null, nextState.weekStart || null)) {
    const r = await doPatch(`${BASE}/meta`, {
      meta: { weekStart: nextState.weekStart || null },
    });
    if (r?.meta) {
      current.weekStart = r.meta.weekStart || null;
      current.version = Number(r.meta.version || version);
      version = current.version;
    }
  }

  // 2) Settings
  if (!deepEqual(prev.settings, nextState.settings)) {
    const r = await doPatch(`${BASE}/settings`, {
      settings: nextState.settings,
    });
    if (r?.settings) current.settings = r.settings;
    if (r?.meta?.version) version = Number(r.meta.version);
  }

  // 3) Drivers
  {
    const d = diffList(prev.drivers, nextState.drivers);
    // Safety: deletes must be explicit (user-intent). No implicit deletes during state saves.
    d.deletes = [];
    for (const id of d.deletes) {
      const r = await doDelete(`${BASE}/drivers/${encodeURIComponent(id)}`);
      if (r?.drivers) current.drivers = r.drivers;
    }
    for (const item of d.creates) {
      const r = await doPost(`${BASE}/drivers`, { driver: item });
      if (r?.drivers) current.drivers = r.drivers;
    }
    for (const u of d.updates) {
      const r = await doPatch(`${BASE}/drivers/${encodeURIComponent(u.id)}`, {
        driver: u.item,
      });
      if (r?.drivers) current.drivers = r.drivers;
    }
  }

  // 4) Tractors
  {
    const d = diffList(prev.tractors, nextState.tractors);
    // Safety: deletes must be explicit (user-intent). No implicit deletes during state saves.
    d.deletes = [];
    for (const id of d.deletes) {
      const r = await doDelete(`${BASE}/tractors/${encodeURIComponent(id)}`);
      if (r?.tractors) current.tractors = r.tractors;
    }
    for (const item of d.creates) {
      const r = await doPost(`${BASE}/tractors`, { tractor: item });
      if (r?.tractors) current.tractors = r.tractors;
    }
    for (const u of d.updates) {
      const r = await doPatch(`${BASE}/tractors/${encodeURIComponent(u.id)}`, {
        tractor: u.item,
      });
      if (r?.tractors) current.tractors = r.tractors;
    }
  }

  // 5) Trailers
  {
    const d = diffList(prev.trailers, nextState.trailers);
    // Safety: deletes must be explicit (user-intent). No implicit deletes during state saves.
    d.deletes = [];
    for (const id of d.deletes) {
      const r = await doDelete(`${BASE}/trailers/${encodeURIComponent(id)}`);
      if (r?.trailers) current.trailers = r.trailers;
    }
    for (const item of d.creates) {
      const r = await doPost(`${BASE}/trailers`, { trailer: item });
      if (r?.trailers) current.trailers = r.trailers;
    }
    for (const u of d.updates) {
      const r = await doPatch(`${BASE}/trailers/${encodeURIComponent(u.id)}`, {
        trailer: u.item,
      });
      if (r?.trailers) current.trailers = r.trailers;
    }
  }

  // 6) Locations
  {
    const d = diffList(prev.locations, nextState.locations);
    // Safety: deletes must be explicit (user-intent). No implicit deletes during state saves.
    d.deletes = [];
    for (const id of d.deletes) {
      const r = await doDelete(`${BASE}/locations/${encodeURIComponent(id)}`);
      if (r?.locations) current.locations = r.locations;
    }
    for (const item of d.creates) {
      const r = await doPost(`${BASE}/locations`, { location: item });
      if (r?.locations) current.locations = r.locations;
    }
    for (const u of d.updates) {
      const r = await doPatch(`${BASE}/locations/${encodeURIComponent(u.id)}`, {
        location: u.item,
      });
      if (r?.locations) current.locations = r.locations;
    }
  }

  // 7) Distances (matrix) – bulk replace when changed
  if (!deepEqual(prev.distanceKm, nextState.distanceKm)) {
    const r = await doPut(`${BASE}/distances/matrix`, {
      distanceKm: nextState.distanceKm || {},
    });
    if (r?.distanceKm) current.distanceKm = r.distanceKm;
  }

  // 8) Jobs – batch when there are multiple changes
  {
    const d = diffList(prev.jobs, nextState.jobs);
    // Safety: deletes must be explicit (user-intent). No implicit deletes during state saves.
    d.deletes = [];
    const totalChanges = d.creates.length + d.updates.length + d.deletes.length;

    if (totalChanges === 1) {
      if (d.deletes.length === 1) {
        const r = await doDelete(
          `${BASE}/jobs/${encodeURIComponent(d.deletes[0])}`
        );
        if (r?.jobs) current.jobs = r.jobs.map(normalizeJob);
      } else if (d.creates.length === 1) {
        const r = await doPost(`${BASE}/jobs`, { job: d.creates[0] });
        if (r?.jobs) current.jobs = r.jobs.map(normalizeJob);
      } else if (d.updates.length === 1) {
        const u = d.updates[0];
        const r = await doPatch(`${BASE}/jobs/${encodeURIComponent(u.id)}`, {
          job: u.item,
        });
        if (r?.jobs) current.jobs = r.jobs.map(normalizeJob);
      }
    } else if (totalChanges > 1) {
      const upserts = [...d.creates, ...d.updates.map((u) => u.item)];
      const deletes = d.deletes;
      const r = await doPost(`${BASE}/jobs/batch`, { upserts, deletes });
      if (r?.jobs) current.jobs = r.jobs.map(normalizeJob);
    }
  }

  // ✅ 9) Agenda (NEW)
  {
    const prevAgenda = Array.isArray(prev.agenda) ? prev.agenda : [];
    const nextAgenda = Array.isArray(nextState.agenda) ? nextState.agenda : [];

    const d = diffList(prevAgenda, nextAgenda);
    // Safety: deletes must be explicit (user-intent). No implicit deletes during state saves.
    d.deletes = [];
    const totalChanges = d.creates.length + d.updates.length + d.deletes.length;

    // optimistic local copy
    current.agenda = nextAgenda;

    if (totalChanges > 0) {
      // deletes first
      for (const id of d.deletes) {
        const r = await doDelete(`${BASE}/agenda/${encodeURIComponent(id)}`);
        if (r?.agenda) current.agenda = r.agenda;
      }
      // creates
      for (const item of d.creates) {
        const r = await doPost(`${BASE}/agenda`, { agendaItem: item });
        if (r?.agenda) current.agenda = r.agenda;
      }
      // updates
      for (const u of d.updates) {
        const r = await doPatch(`${BASE}/agenda/${encodeURIComponent(u.id)}`, {
          agendaItem: u.item,
        });
        if (r?.agenda) current.agenda = r.agenda;
      }
    }
  }

  current.version = version;
  __plannerLastState = current;
  return current;
}

// -------- Notice board (RESTORED for AdminExtras/Profile) --------
export async function apiGetNotice() {
  const r = await fetch(`${BASE}/notice`, { headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || "Failed to load notice");

  // Backend يرجّع: { content, updated_at, updated_by }
  // UI محتاج: content + updatedAt
  return {
    ...j,
    updatedAt: j.updatedAt || j.updated_at || null,
    updatedBy: j.updatedBy || j.updated_by || null,
  };
}

export async function apiSetNotice(content) {
  const r = await fetch(`${BASE}/notice`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ content: content || "" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || "Failed to update notice");
  return j; // { ok: true }
}

// -------- Users & roles --------
export async function apiListUsers() {
  const r = await fetch(`${BASE}/users`, { headers: authHeaders() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to list users");
  return j;
}

// ❗ الباك إند بتاعك على /users/:id/admin طالب role مش isAdmin
export async function apiSetUserAdmin(userId, isAdmin) {
  const wantedRole = isAdmin ? "admin" : "user";
  const r = await fetch(`${BASE}/users/${userId}/admin`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ role: wantedRole }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || "Failed to update role");
  return j;
}

export async function apiUpdateUser(userId, data) {
  const r = await fetch(`${BASE}/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Failed to update user");
  return j;
}

export async function apiDeleteUser(userId) {
  const r = await fetch(`${BASE}/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Failed to delete user");
  return j;
}

// -------- Tasks --------
export async function apiAllTasks() {
  const r = await fetch(`${BASE}/tasks/all`, { headers: authHeaders() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to get all tasks");

  if (Array.isArray(j)) {
    const tasks = j.flatMap((u) =>
      (u.tasks || []).map((t) => ({
        ...t,
        user: { id: u.id, name: u.name, email: u.email, role: u.role },
      }))
    );
    return { tasks };
  }
  if (j && Array.isArray(j.tasks)) return { tasks: j.tasks };
  return { tasks: [] };
}

export async function apiMyTasks() {
  const r = await fetch(`${BASE}/tasks/me`, { headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || "Failed to load my tasks");
  if (Array.isArray(j?.tasks)) return { tasks: j.tasks };
  if (Array.isArray(j)) return { tasks: j };
  return { tasks: [] };
}

export async function apiCreateTask({ userId, title, items }) {
  const payload = { title, items };
  try {
    const r1 = await fetch(`${BASE}/tasks/${userId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (r1.ok) return r1.json();

    if (r1.status === 404 || r1.status === 405) {
      const r2 = await fetch(`${BASE}/tasks`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ userId, ...payload }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j2.error || "Failed to create task");
      return j2;
    }

    const j1 = await r1.json().catch(() => ({}));
    throw new Error(j1.error || "Failed to create task");
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        `Network error while creating task. تأكد أن السيرفر شغال على ${BASE} وأن CORS و JSON parser مضبوطين.`
      );
    }
    throw e;
  }
}

export async function apiUpdateTask(taskId, data) {
  const r = await fetch(`${BASE}/tasks/${taskId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to update task");
  return j;
}
export async function apiDeleteTask(taskId) {
  const r = await fetch(`${BASE}/tasks/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to delete task");
  return j;
}
export async function apiUpdateTaskTitle(taskId, { title }) {
  const res = await fetch(`${BASE}/tasks/${taskId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to update task title");
  return res.json();
}
export async function apiUpdateTaskItem(itemId, data) {
  const r = await fetch(`${BASE}/tasks/item/${itemId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to update task item");
  return j;
}
export async function apiDeleteTaskItem(itemId) {
  const r = await fetch(`${BASE}/tasks/item/${itemId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to delete task item");
  return j;
}

// Optional health check
export async function apiHealth() {
  try {
    const rRoot = await fetch(`${BASE}/`, { headers: authHeaders() });
    if (rRoot.ok) return "UP";
  } catch (_) {}

  try {
    const r = await fetch(`${BASE}/health`, { headers: authHeaders() });
    if (r.ok) return "UP";
    return `DOWN: ${r.status}`;
  } catch {
    return "UNREACHABLE";
  }
}

/* --------- NEW: Driver Photo Upload --------- */
export async function apiUploadDriverPhoto(driverId, file) {
  const fd = new FormData();
  fd.append("file", file);
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const r = await fetch(`${BASE}/upload/driver-photo/${driverId}`, {
    method: "POST",
    headers,
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      j.error ||
        "Failed to upload driver photo (تأكد إنك عامل الراوت في السيرفر)."
    );
  // Normalize response keys across environments.
  if (j && !j.photoUrl && j.url) {
    return { ...j, photoUrl: j.url };
  }
  return j; // { photoUrl }
}


// -------- Explicit Deletes (requires X-Delete-Intent) --------
async function ensureBaselineForDelete() {
  if (!__plannerLastState) {
    __plannerLastState = await apiGetState();
  }
  return __plannerLastState;
}

async function doExplicitDelete(url, updater) {
  const prev = await ensureBaselineForDelete();
  let version = Number(prev.version || 1);
  const r = await fetchJson(url, {
    method: "DELETE",
    headers: plannerDeleteHeaders(version),
  });
  if (r?.meta?.version) version = Number(r.meta.version);
  if (__plannerLastState) {
    __plannerLastState = { ...__plannerLastState, version };
    if (typeof updater === "function") updater(r);
  }
  return r;
}

export async function apiDeleteDriver(id) {
  return doExplicitDelete(`${BASE}/drivers/${encodeURIComponent(id)}`, (r) => {
    if (r?.drivers) __plannerLastState = { ...__plannerLastState, drivers: r.drivers };
  });
}
export async function apiDeleteTractor(id) {
  return doExplicitDelete(`${BASE}/tractors/${encodeURIComponent(id)}`, (r) => {
    if (r?.tractors) __plannerLastState = { ...__plannerLastState, tractors: r.tractors };
  });
}
export async function apiDeleteTrailer(id) {
  return doExplicitDelete(`${BASE}/trailers/${encodeURIComponent(id)}`, (r) => {
    if (r?.trailers) __plannerLastState = { ...__plannerLastState, trailers: r.trailers };
  });
}
export async function apiDeleteLocation(id) {
  return doExplicitDelete(`${BASE}/locations/${encodeURIComponent(id)}`, (r) => {
    if (r?.locations) __plannerLastState = { ...__plannerLastState, locations: r.locations };
    if (r?.distanceKm) __plannerLastState = { ...__plannerLastState, distanceKm: r.distanceKm };
  });
}
export async function apiDeleteJob(id) {
  return doExplicitDelete(`${BASE}/jobs/${encodeURIComponent(id)}`, (r) => {
    if (r?.jobs)
      __plannerLastState = {
        ...__plannerLastState,
        jobs: r.jobs.map(normalizeJob),
      };
  });
}
export async function apiDeleteAgendaItem(id) {
  return doExplicitDelete(`${BASE}/agenda/${encodeURIComponent(id)}`, (r) => {
    if (r?.agenda) __plannerLastState = { ...__plannerLastState, agenda: r.agenda };
  });
}
