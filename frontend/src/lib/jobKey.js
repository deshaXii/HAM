// src/lib/jobKey.js

/**
 * Produce a short, human-friendly key from a job id.
 * Examples:
 *  - job-85fc9227-99b1-4a28-9773-cfb62895d692  -> D692
 *  - 85fc922799b14a289773cfb62895d692          -> D692
 */
export function jobShortKey(id, len = 4) {
  const raw = String(id || "");
  // Keep only alphanumerics to avoid hyphens/spaces.
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(-Math.max(1, len)).toUpperCase();
}
