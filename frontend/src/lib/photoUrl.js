export function resolveDriverPhotoUrl(photoUrl) {
  if (!photoUrl) return "";

  // Use the same base strategy as the API client.
  // In dev, VITE_API_URL is typically like "http://localhost:4000".
  // In prod, it may be empty and we fall back to same-origin.
  const API_BASE = String(
    import.meta.env.VITE_API_URL || window.location.origin
  ).replace(/\/+$/, "");

  // لو url كامل
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;

  // if we already have an absolute path from the API
  // (backend serves both /uploads and /api/uploads)
  if (photoUrl.startsWith("/uploads/") || photoUrl.startsWith("/api/uploads/")) {
    return `${API_BASE}${photoUrl}`;
  }

  // if it's a relative path without leading slash
  if (photoUrl.startsWith("uploads/")) {
    return `${API_BASE}/${photoUrl}`;
  }

  // Otherwise treat it as a filename and serve from /uploads
  return `${API_BASE}/uploads/${photoUrl.replace(/^\/+/, "")}`;
}
