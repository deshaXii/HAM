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
export async function apiSignup({ name, email, password }) {
  const r = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
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
export async function apiGetState() {
  const res = await fetch(`${BASE}/state`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load state");
  return res.json();
}
export async function apiSaveState(nextState) {
  const res = await fetch(`${BASE}/state`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(nextState),
  });
  if (!res.ok) throw new Error("Failed to save state");
  return res.json();
}

// -------- Notice board --------
export async function apiGetNotice() {
  const r = await fetch(`${BASE}/notice`, { headers: authHeaders() });
  return await r.json();
}
export async function apiSetNotice(content) {
  const r = await fetch(`${BASE}/notice`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Failed to update notice");
  return j;
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
  if (!r.ok) {
    // هتلاقي هنا الرسالة اللي انت شوفتها: { message: "role required" }
    throw new Error(j.error || j.message || "Failed to update role");
  }
  return j;
}

// NEW: update user (name/email/role)
export async function apiUpdateUser(userId, data) {
  const r = await fetch(`${BASE}/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(data), // e.g. { name, email } أو { role }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Failed to update user");
  return j;
}

// NEW: delete user
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

  // Normalize: backend may return users[] with nested tasks[]
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

// ✅ backend عندك ماعندوش /tasks/me فهنجيب /me وبعدين /tasks/all ونفلتر
export async function apiMyTasks() {
  const me = await apiMe();
  if (!me) throw new Error("Not authenticated");
  const { tasks } = await apiAllTasks();
  const myTasks = tasks.filter((t) => t.user && t.user.id === me.id);
  return { tasks: myTasks };
}

export async function apiCreateTask({ userId, title, items }) {
  const payload = { title, items };
  try {
    // route style 1 (ده اللي موجود في السيرفر بتاعك)
    const r1 = await fetch(`${BASE}/tasks/${userId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (r1.ok) return r1.json();

    // route style 2 fallback (لو غيرت السيرفر بعدين)
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
  // السيرفر بتاعك فيه GET "/" فهنجربه الأول
  try {
    const rRoot = await fetch(`${BASE}/`, { headers: authHeaders() });
    if (rRoot.ok) return "UP";
  } catch (_) {
    // نكمّل
  }

  // لو عندك /health بعدين
  try {
    const r = await fetch(`${BASE}/health`, { headers: authHeaders() });
    if (r.ok) return "UP";
    return `DOWN: ${r.status}`;
  } catch {
    return "UNREACHABLE";
  }
}

/* --------- NEW: Driver Photo Upload --------- */
// Endpoint مُفترض: POST /upload/driver-photo/:driverId  (multipart field: file)
// يُرجع: { url: "https://..." }
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
  return j; // { url }
}
