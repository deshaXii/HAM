// backend/src/controllers/locationsController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
const { parseIncomingVersion, assertVersion, bumpVersion } = require("../utils/plannerMeta");

function safeStr(x, max = 200) {
  return String(x ?? "").slice(0, max);
}
function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function selectLocations(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, name, lat, lng
     FROM locations
     ORDER BY name ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
  }));
}

async function getLocations(req, res) {
  try {
    const locations = await selectLocations();
    return res.json({ locations });
  } catch (e) {
    console.error("getLocations error:", e);
    return res.status(500).json({ error: "Failed to load locations" });
  }
}

async function createLocation(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const loc = body.location || body;

  const id = safeStr(loc.id, 64) || `loc-${uuidv4()}`;
  const name = safeStr(loc.name || "", 200).trim();
  if (!name) return res.status(400).json({ error: "Location name is required" });

  const lat = safeNum(loc.lat);
  const lng = safeNum(loc.lng);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO locations (id, name, lat, lng) VALUES (?,?,?,?)`,
      [id, name, lat, lng]
    );

    const meta = await bumpVersion(conn);
    const locations = await selectLocations(conn);

    await conn.commit();

    broadcast("locations:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ locations, meta });
  } catch (e) {
    await conn.rollback();
    console.error("createLocation error:", e);
    const status = e.status || 500;
    // duplicate name
    if (String(e.code || "").includes("ER_DUP_ENTRY")) {
      return res.status(409).json({ error: "Location name already exists" });
    }
    return res.status(status).json({ error: e.message || "Failed to create location", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function updateLocation(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing location id" });

  const body = req.body || {};
  const patch = body.location || body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const [rows] = await conn.query(`SELECT id, name FROM locations WHERE id = ?`, [id]);
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Location not found" });
    }
    const prevName = rows[0].name;

    const sets = [];
    const vals = [];

    if (patch.name !== undefined) {
      const name = safeStr(patch.name, 200).trim();
      if (!name) {
        await conn.rollback();
        return res.status(400).json({ error: "Location name is required" });
      }
      sets.push("name = ?");
      vals.push(name);
    }
    if (patch.lat !== undefined) { sets.push("lat = ?"); vals.push(safeNum(patch.lat)); }
    if (patch.lng !== undefined) { sets.push("lng = ?"); vals.push(safeNum(patch.lng)); }

    if (sets.length > 0) {
      vals.push(id);
      await conn.query(`UPDATE locations SET ${sets.join(", ")} WHERE id = ?`, vals);
    }

    // If name changed, update distances keys
    if (patch.name !== undefined) {
      const newName = safeStr(patch.name, 200).trim();
      if (newName !== prevName) {
        await conn.query(`UPDATE distances SET from_name = ? WHERE from_name = ?`, [newName, prevName]);
        await conn.query(`UPDATE distances SET to_name = ? WHERE to_name = ?`, [newName, prevName]);
      }
    }

    const meta = await bumpVersion(conn);
    const locations = await selectLocations(conn);

    await conn.commit();

    broadcast("locations:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("distances:updated", { updatedAt: Date.now(), version: meta.version }); // keys may have changed
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ locations, meta });
  } catch (e) {
    await conn.rollback();
    console.error("updateLocation error:", e);
    const status = e.status || 500;
    if (String(e.code || "").includes("ER_DUP_ENTRY")) {
      return res.status(409).json({ error: "Location name already exists" });
    }
    return res.status(status).json({ error: e.message || "Failed to update location", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function deleteLocation(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing location id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const [rows] = await conn.query(`SELECT name FROM locations WHERE id = ?`, [id]);
    const name = rows && rows[0] ? rows[0].name : null;

    await conn.query("DELETE FROM locations WHERE id = ?", [id]);
    if (name) {
      await conn.query(`DELETE FROM distances WHERE from_name = ? OR to_name = ?`, [name, name]);
    }

    const meta = await bumpVersion(conn);
    const locations = await selectLocations(conn);

    await conn.commit();

    broadcast("locations:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("distances:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ locations, meta });
  } catch (e) {
    await conn.rollback();
    console.error("deleteLocation error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to delete location", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
};
