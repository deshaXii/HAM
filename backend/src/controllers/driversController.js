// backend/src/controllers/driversController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
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
function parseJsonArray(s, fallback = []) {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function mapDriverRow(r) {
  return {
    id: r.id,
    name: r.name,
    code: r.code || "",
    photoUrl: r.photo_url || "",
    canNight: !!r.can_night,
    sleepsInCab: !!r.sleeps_in_cab,
    doubleMannedEligible: !!r.double_manned_eligible,
    weekAvailability: parseJsonArray(r.week_availability_json, [0, 1, 2, 3, 4, 5, 6]),
    leaves: parseJsonArray(r.leaves_json, []),
  };
}

async function selectDrivers(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible,
            week_availability_json, leaves_json
     FROM drivers
     ORDER BY name ASC`
  );
  return rows.map(mapDriverRow);
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

  const payload = {
    id,
    name: safeStr(driver.name || "Driver", 120),
    code: safeStr(driver.code || "", 60),
    photoUrl: safeStr(driver.photoUrl || "", 500),
    canNight: safeBool(driver.canNight, true),
    sleepsInCab: safeBool(driver.sleepsInCab, false),
    doubleMannedEligible: safeBool(driver.doubleMannedEligible, true),
    weekAvailability: safeArray(driver.weekAvailability).slice().sort(),
    leaves: safeArray(driver.leaves).slice().sort(),
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO drivers
        (id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible, week_availability_json, leaves_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        payload.id,
        payload.name,
        payload.code,
        payload.photoUrl,
        payload.canNight ? 1 : 0,
        payload.sleepsInCab ? 1 : 0,
        payload.doubleMannedEligible ? 1 : 0,
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const [rows] = await conn.query(
      `SELECT id, name, code, photo_url, can_night, sleeps_in_cab, double_manned_eligible,
              week_availability_json, leaves_json
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

    await conn.query("DELETE FROM drivers WHERE id = ?", [id]);

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
