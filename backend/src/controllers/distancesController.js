// backend/src/controllers/distancesController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { parseIncomingVersion, assertVersion, bumpVersion } = require("../utils/plannerMeta");
const { audit } = require("../utils/auditLog");

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



async function getActiveCount(conn = pool) {
  const [rows] = await conn.query("SELECT COUNT(*) AS c FROM distances WHERE deleted_at IS NULL");
  return Number(rows?.[0]?.c || 0);
}

async function selectDistanceMatrix(conn = pool) {
  const [rows] = await conn.query(
    `SELECT from_name, to_name, km FROM distances WHERE deleted_at IS NULL`
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

    const beforeCount = await getActiveCount(conn);

    await conn.query(
      `INSERT INTO distances (from_name, to_name, km)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE km = VALUES(km), deleted_at = NULL`,
      [fromName, toName, km]
    );

    const afterCount = await getActiveCount(conn);

    await audit(conn, req, {
      action: "update",
      entity_type: "distances",
      entity_id: null,
      before: { activeCount: beforeCount },
      after: { activeCount: afterCount }
    });

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

  const intent = String(req.headers['x-delete-intent'] || '').trim().toLowerCase();
  const allowClear = intent === '1' || intent === 'true' || intent === 'yes';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const beforeCount = await getActiveCount(conn);

    // Optional clear (only when X-Delete-Intent is provided).
    // Without intent header we do SAFE upsert-only to avoid any data loss from client-side state bugs.
    if (allowClear) {
      await conn.query("UPDATE distances SET deleted_at = NOW() WHERE deleted_at IS NULL");
    }

    for (const fromKey of Object.keys(matrix)) {
      const fromName = safeStr(fromKey, 200).trim();
      if (!fromName) continue;
      const inner = safeObj(matrix[fromKey]);
      for (const toKey of Object.keys(inner)) {
        const toName = safeStr(toKey, 200).trim();
        if (!toName) continue;
        const km = Math.max(0, Math.round(safeNum(inner[toKey], 0)));
        await conn.query(
          `INSERT INTO distances (from_name, to_name, km, deleted_at) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE km=VALUES(km), deleted_at=NULL`,
          [fromName, toName, km]
        );
      }
    }

    const afterCount = await getActiveCount(conn);

    await audit(conn, req, {
      action: "replace",
      entity_type: "distances",
      entity_id: null,
      before: { activeCount: beforeCount },
      after: { activeCount: afterCount }
    });

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
