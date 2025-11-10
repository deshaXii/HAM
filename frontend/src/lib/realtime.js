// ملاحظة: EventSource لا يدعم Authorization header، فبنمرر التوكن كـ query
import { authHeaders } from "./api";

const BASE = (
  import.meta.env.VITE_API_URL || `${window.location.origin}/api`
).replace(/\/+$/, "");

let es;
const listeners = new Map(); // eventName -> Set(callback)

function getToken() {
  return localStorage.getItem("auth_token");
}

export function connectRealtime() {
  if (es && es.readyState !== 2) return es; // موجود ومش مغلق
  const token = getToken();
  const url = `${BASE}/events${
    token ? `?token=${encodeURIComponent(token)}` : ""
  }`;

  es = new EventSource(url, { withCredentials: false });

  es.onmessage = (e) => {
    // optional: بعض السيرفرات تبعت default messages على "message"
    dispatch("*", safeParse(e.data));
  };

  es.onerror = () => {
    // إعادة المحاولة تلقائيًا – EventSource بيحاول يعمل reconnect
  };

  // لو السيرفر بيستخدم أسماء أحداث مخصصة:
  const known = [
    "task:created",
    "task:updated",
    "task:deleted",
    "task:item-updated",
    "task:item-deleted",
    "notice:updated",
    "user:updated",
    "user:deleted",
    "user:role",
    "state:updated", // Fleet shared state
  ];
  known.forEach((name) => {
    es.addEventListener(name, (ev) => dispatch(name, safeParse(ev.data)));
  });

  return es;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function dispatch(eventName, payload) {
  // eventName المحدد
  if (listeners.has(eventName)) {
    listeners.get(eventName).forEach((cb) => cb(payload));
  }
  // wildcard للمراقبة العامة
  if (listeners.has("*")) {
    listeners.get("*").forEach((cb) => cb({ event: eventName, payload }));
  }
}

export function on(eventName, cb) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(cb);
  return () => {
    listeners.get(eventName)?.delete(cb);
  };
}

export function ensureRealtime() {
  connectRealtime();
}
