export function resolveDriverPhotoUrl(photoUrl) {
  if (!photoUrl) return "";

  // لو url كامل
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;

  // لو جاي "/uploads/..."
  if (photoUrl.startsWith("/uploads/")) {
    return `${window.location.origin}/api${photoUrl}`;
  }

  // لو جاي "/api/uploads/..."
  if (photoUrl.startsWith("/api/uploads/")) {
    return `${window.location.origin}${photoUrl}`;
  }

  // لو جاي "uploads/..."
  if (photoUrl.startsWith("uploads/")) {
    return `${window.location.origin}/api/${photoUrl}`;
  }

  return `${window.location.origin}/api/uploads/${photoUrl.replace(/^\/+/, "")}`;
}
