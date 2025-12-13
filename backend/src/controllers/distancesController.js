// backend/src/controllers/distancesController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { parseIncomingVersion, assertVersion, bumpVersion } = require("../utils/plannerMeta");

function safeObj(x) {
  return typeof x === "object" && x !== null ? x : {};
}
function safeStr(x, max = 200) {
  return String(x ?? "").slice(0, max);
}
function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

async function selectDistanceMatrix(conn = pool) {
  const [rows] = await conn.query(
    `SELECT from_name, to_name, km FROM distances`
  );
  const distanceKm = {};
  for (const r of rows) {
    const from = r.from_name;
    const to = r.to_name;
    if (!distanceKm[from]) distanceKm[from] = {};
    distanceKm[from][to] = Number(r.km);
  }
  return distanceKm;
}

async function getDistances(req, res) {
  try {
    const distanceKm = await selectDistanceMatrix();
    return res.json({ distanceKm });
  } catch (e) {
    console.error("getDistances error:", e);
    return res.status(500).json({ error: "Failed to load distances" });
  }
}

// Update a single pair: body { fromName, toName, km }
async function upsertDistance(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const fromName = safeStr(body.fromName || body.from || "", 200).trim();
  const toName = safeStr(body.toName || body.to || "", 200).trim();
  const km = Math.max(0, Math.round(safeNum(body.km, 0)));

  if (!fromName || !toName) {
    return res.status(400).json({ error: "fromName and toName are required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO distances (from_name, to_name, km)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE km = VALUES(km)`,
      [fromName, toName, km]
    );

    const meta = await bumpVersion(conn);
    const distanceKm = await selectDistanceMatrix(conn);

    await conn.commit();

    broadcast("distances:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ distanceKm, meta });
  } catch (e) {
    await conn.rollback();
    console.error("upsertDistance error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to update distance", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

// Replace entire matrix: body { distanceKm: { [from]: { [to]: km } } }
async function replaceMatrix(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const matrix = safeObj(body.distanceKm);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query("DELETE FROM distances");

    for (const fromKey of Object.keys(matrix)) {
      const fromName = safeStr(fromKey, 200).trim();
      if (!fromName) continue;
      const inner = safeObj(matrix[fromKey]);
      for (const toKey of Object.keys(inner)) {
        const toName = safeStr(toKey, 200).trim();
        if (!toName) continue;
        const km = Math.max(0, Math.round(safeNum(inner[toKey], 0)));
        await conn.query(
          `INSERT INTO distances (from_name, to_name, km) VALUES (?,?,?)`,
          [fromName, toName, km]
        );
      }
    }

    const meta = await bumpVersion(conn);
    const distanceKm = await selectDistanceMatrix(conn);

    await conn.commit();

    broadcast("distances:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ distanceKm, meta });
  } catch (e) {
    await conn.rollback();
    console.error("replaceMatrix error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to replace distance matrix", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = {
  getDistances,
  upsertDistance,
  replaceMatrix,
};
