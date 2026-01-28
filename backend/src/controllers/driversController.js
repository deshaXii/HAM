// backend/src/controllers/driversController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
const { audit } = require("../utils/auditLog");
const {
  parseIncomingVersion,
  assertVersion,
  bumpVersion,
  readMeta,
} = require("../utils/plannerMeta");

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeStr(x, max = 500) {
  return String(x ?? "").slice(0, max);
}
function safeBool(x, fallback = false) {
  if (x === true || x === 1 || x === "1" || x === "true") return true;
  if (x === false || x === 0 || x === "0" || x === "false") return false;
  return fallback;
}

function safeNum(x, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function parseJsonArray(s, fallback = []) {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}


function normalizePhotoUrl(photoUrl) {
  const s = String(photoUrl || "");
  if (!s) return "";
  // If absolute but missing /api before /uploads, fix it
  if (/^https?:\/\//i.test(s)) {
    return s.replace(/\/uploads\//, "/api/uploads/");
  }
  // If relative /uploads/..., serve it via /api/uploads/...
  if (s.startsWith("/uploads/")) return "/api" + s;
  if (s.startsWith("/api/uploads/")) return s;
  if (s.startsWith("uploads/")) return "/api/" + s;
  return s;
}

function mapDriverRow(r) {
  return {
    id: r.id,
    name: r.name,
    code: r.code || "",
    photoUrl: normalizePhotoUrl(r.photo_url || ""),
    canNight: !!r.can_night,
    sleepsInCab: !!r.sleeps_in_cab,
    doubleMannedEligible: !!r.double_manned_eligible,
    rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : 0,
    weekAvailability: parseJsonArray(r.week_availability_json, [0, 1, 2, 3, 4, 5, 6]),
    leaves: parseJsonArray(r.leaves_json, []),
  };
}

async function selectDrivers(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible, rating,
            week_availability_json, leaves_json
     FROM drivers
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );
  return rows.map(mapDriverRow);
}


async function selectDriverById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible, rating,
            week_availability_json, leaves_json
     FROM drivers
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows && rows[0] ? mapDriverRow(rows[0]) : null;
}

async function getDrivers(req, res) {
  try {
    const drivers = await selectDrivers();
    return res.json({ drivers });
  } catch (e) {
    console.error("getDrivers error:", e);
    return res.status(500).json({ error: "Failed to load drivers" });
  }
}

async function createDriver(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const driver = body.driver || body;

  const id = safeStr(driver.id, 64) || `drv-${uuidv4()}`;

  // IMPORTANT:
  // When using INSERT ... ON DUPLICATE KEY UPDATE (UPSERT), defaulting a missing field
  // to 0 would overwrite existing values unintentionally.
  // Some UIs may omit `rating` when saving other changes.
  // So: if rating is not provided, we pass NULL and preserve the existing DB value.
  // Support alternative keys just in case an older UI sends `rate` or `driverRating`.
  const ratingRaw =
    (driver && Object.prototype.hasOwnProperty.call(driver, "rating") ? driver.rating : undefined) ??
    (driver && Object.prototype.hasOwnProperty.call(driver, "rate") ? driver.rate : undefined) ??
    (driver && Object.prototype.hasOwnProperty.call(driver, "driverRating") ? driver.driverRating : undefined);

  const hasRating = ratingRaw !== undefined && ratingRaw !== "" && ratingRaw !== null;
  const incomingRating = hasRating ? safeNum(ratingRaw, 0, 0, 5) : null;

  const payload = {
    id,
    name: safeStr(driver.name || "Driver", 120),
    code: safeStr(driver.code || "", 60),
    photoUrl: safeStr(driver.photoUrl || "", 500),
    canNight: safeBool(driver.canNight, true),
    sleepsInCab: safeBool(driver.sleepsInCab, false),
    doubleMannedEligible: safeBool(driver.doubleMannedEligible, true),
    rating: incomingRating,
    weekAvailability: safeArray(driver.weekAvailability).slice().sort(),
    leaves: safeArray(driver.leaves).slice().sort(),
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO drivers
        (id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible, rating, week_availability_json, leaves_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         code = VALUES(code),
         photo_url = VALUES(photo_url),
         can_night = VALUES(can_night),
         sleeps_in_cab = VALUES(sleeps_in_cab),
         double_manned_eligible = VALUES(double_manned_eligible),
         rating = COALESCE(VALUES(rating), rating),
         week_availability_json = VALUES(week_availability_json),
         leaves_json = VALUES(leaves_json),
         deleted_at = NULL`,
      [
        payload.id,
        payload.name,
        payload.code,
        payload.photoUrl,
        payload.canNight ? 1 : 0,
        payload.sleepsInCab ? 1 : 0,
        payload.doubleMannedEligible ? 1 : 0,
        payload.rating,
        JSON.stringify(payload.weekAvailability),
        JSON.stringify(payload.leaves),
      ]
    );
    const meta = await bumpVersion(conn);
    const drivers = await selectDrivers(conn);

    await conn.commit();

    broadcast("drivers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ drivers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("createDriver error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to create driver", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

function buildPatch(prev, next) {
  const patch = {};
  const fields = [
    "name",
    "code",
    "photoUrl",
    "canNight",
    "sleepsInCab",
    "doubleMannedEligible",
    "rating",
    "weekAvailability",
    "leaves",
  ];
  for (const f of fields) {
    const a = prev?.[f];
    const b = next?.[f];
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (!same && b !== undefined) patch[f] = b;
  }
  return patch;
}

async function updateDriver(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing driver id" });

  const body = req.body || {};
  const patchIn = body.driver || body;

  // Backwards-compat: some clients may send rating under a different key.
  if (patchIn && patchIn.rating === undefined) {
    if (patchIn.rate !== undefined) patchIn.rating = patchIn.rate;
    else if (patchIn.driverRating !== undefined) patchIn.rating = patchIn.driverRating;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const [rows] = await conn.query(
      `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible,
              rating, week_availability_json, leaves_json
       FROM drivers WHERE id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Driver not found" });
    }
    const prev = mapDriverRow(rows[0]);

    const merged = {
      ...prev,
      ...patchIn,
    };
    const patch = buildPatch(prev, merged);
    if (Object.keys(patch).length === 0) {
      await conn.rollback();
      const drivers = await selectDrivers();
      const meta = await readMeta();
      return res.json({ drivers, meta });
    }

    const sets = [];
    const vals = [];
    if (patch.name !== undefined) { sets.push("name = ?"); vals.push(safeStr(patch.name, 120)); }
    if (patch.code !== undefined) { sets.push("code = ?"); vals.push(safeStr(patch.code, 60)); }
    if (patch.photoUrl !== undefined) { sets.push("photo_url = ?"); vals.push(safeStr(patch.photoUrl, 500)); }
    if (patch.canNight !== undefined) { sets.push("can_night = ?"); vals.push(safeBool(patch.canNight, true) ? 1 : 0); }
    if (patch.sleepsInCab !== undefined) { sets.push("sleeps_in_cab = ?"); vals.push(safeBool(patch.sleepsInCab, false) ? 1 : 0); }
    if (patch.doubleMannedEligible !== undefined) { sets.push("double_manned_eligible = ?"); vals.push(safeBool(patch.doubleMannedEligible, true) ? 1 : 0); }
    if (patch.rating !== undefined) { sets.push("rating = ?"); vals.push(safeNum(patch.rating, 0, 0, 5)); }
    if (patch.weekAvailability !== undefined) { sets.push("week_availability_json = ?"); vals.push(JSON.stringify(safeArray(patch.weekAvailability).slice().sort())); }
    if (patch.leaves !== undefined) { sets.push("leaves_json = ?"); vals.push(JSON.stringify(safeArray(patch.leaves).slice().sort())); }

    vals.push(id);

    await conn.query(`UPDATE drivers SET ${sets.join(", ")} WHERE id = ?`, vals);
    const meta = await bumpVersion(conn);
    const drivers = await selectDrivers(conn);

    await conn.commit();

    broadcast("drivers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ drivers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("updateDriver error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to update driver", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function deleteDriver(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing driver id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const before = await selectDriverById(id, conn);

    await conn.query("UPDATE drivers SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", [id]);

    await audit(conn, req, { action: "delete", entity_type: "driver", entity_id: id, before, after: null });
    const meta = await bumpVersion(conn);
    const drivers = await selectDrivers(conn);

    await conn.commit();

    broadcast("drivers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ drivers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("deleteDriver error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to delete driver", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
};
