const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { audit } = require("../utils/auditLog");
const {
  parseIncomingVersion,
  assertVersion,
  bumpVersion,
} = require("../utils/plannerMeta");

function buildPublicApiBase(req) {
  // Prefer explicit BASE_URL (e.g. https://hamtransport.cloud/api)
  if (process.env.BASE_URL) return String(process.env.BASE_URL).replace(/\/+$/, "");

  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";

  // In prod we typically serve the API behind /api via reverse proxy.
  // We can't reliably detect that from Express (proxy might strip the prefix),
  // so we keep a safe heuristic for your domain.
  const needsApiPrefix =
    host === "hamtransport.cloud" || host === "www.hamtransport.cloud";

  return `${proto}://${host}${needsApiPrefix ? "/api" : ""}`.replace(/\/+$/, "");
}

function mapDriverRow(r) {
  // Keep it minimal – only what the UI needs
  return {
    id: r.id,
    name: r.name,
    code: r.code || "",
    photoUrl: r.photo_url || "",
    canNight: !!r.can_night,
    sleepsInCab: !!r.sleeps_in_cab,
    doubleMannedEligible: !!r.double_manned_eligible,
    weekAvailability: safeJsonArray(r.week_availability_json, [0, 1, 2, 3, 4, 5, 6]),
    leaves: safeJsonArray(r.leaves_json, []),
  };
}

function safeJsonArray(s, fallback = []) {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

async function selectDrivers(conn) {
  const [rows] = await conn.query(
    `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible,
            week_availability_json, leaves_json
     FROM drivers
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );
  return rows.map(mapDriverRow);
}

async function uploadDriverPhoto(req, res) {
  // multer حط الملف في req.file
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const incomingVersion = parseIncomingVersion(req);
  const driverId = String(req.params.driverId || "").trim();
  if (!driverId) return res.status(400).json({ message: "Missing driverId" });

  const base = buildPublicApiBase(req);
  // NOTE: app serves static uploads at /uploads (behind /api it becomes /api/uploads)
  const url = `${base}/uploads/${req.file.filename}`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    // Read before
    const [beforeRows] = await conn.query(
      `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible,
              week_availability_json, leaves_json
       FROM drivers
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [driverId]
    );
    if (!beforeRows || beforeRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Driver not found" });
    }
    const before = mapDriverRow(beforeRows[0]);

    // Persist URL in DB (this is the missing piece)
    await conn.query(
      `UPDATE drivers SET photo_url = ? WHERE id = ? AND deleted_at IS NULL`,
      [url, driverId]
    );

    const [afterRows] = await conn.query(
      `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible,
              week_availability_json, leaves_json
       FROM drivers
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [driverId]
    );
    const after = afterRows && afterRows[0] ? mapDriverRow(afterRows[0]) : null;

    await audit(conn, req, {
      action: "update",
      entity_type: "driver",
      entity_id: driverId,
      before,
      after,
    });

    const meta = await bumpVersion(conn);
    const drivers = await selectDrivers(conn);

    await conn.commit();

    broadcast("drivers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    // Keep backward compat: still return {url}
    return res.json({ url, driver: after, drivers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("uploadDriverPhoto error:", e);
    const status = e.status || 500;
    return res
      .status(status)
      .json({ message: e.message || "Failed to upload driver photo", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = { uploadDriverPhoto };
