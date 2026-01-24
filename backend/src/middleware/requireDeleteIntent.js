// backend/src/middleware/requireDeleteIntent.js
/**
 * Safety guard: require explicit user intent header for destructive operations.
 *
 * Why:
 * - Prevents accidental mass deletes caused by buggy/partial client state saves.
 * - Forces UI to send a deliberate header when a human clicked "Delete".
 *
 * Header: X-Delete-Intent: 1
 */
function requireDeleteIntent(req, res, next) {
  const v = String(req.headers["x-delete-intent"] || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return next();
  return res.status(400).json({
    error: "Delete requires explicit intent",
    code: "DELETE_INTENT_REQUIRED",
  });
}

module.exports = { requireDeleteIntent };
