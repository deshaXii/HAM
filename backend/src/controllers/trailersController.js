// backend/src/controllers/trailersController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
const { audit } = require("../utils/auditLog");
const { parseIncomingVersion, assertVersion, bumpVersion } = require("../utils/plannerMeta");

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeStr(x, max = 200) {
  return String(x ?? "").slice(0, max);
}

function mapTrailerRow(r, typesMap) {
  return {
    id: r.id,
    code: r.code,
    plate: r.plate || "",
    types: typesMap.get(r.id) || [],
  };
}

async function selectTrailers(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, code, plate
     FROM trailers
     WHERE deleted_at IS NULL
     ORDER BY code ASC`
  );
  const [typeRows] = await conn.query(
    `SELECT trailer_id, type_value FROM trailer_types ORDER BY trailer_id ASC`
  );
  const typesMap = new Map();
  for (const tr of typeRows) {
    if (!typesMap.has(tr.trailer_id)) typesMap.set(tr.trailer_id, []);
    typesMap.get(tr.trailer_id).push(tr.type_value);
  }
  return rows.map((r) => mapTrailerRow(r, typesMap));
}


async function selectTrailerById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, code, plate
     FROM trailers
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows || !rows[0]) return null;
  const [typeRows] = await conn.query(
    `SELECT type_value FROM trailer_types WHERE trailer_id = ? ORDER BY type_value ASC`,
    [id]
  );
  const typesMap = new Map();
  typesMap.set(id, (typeRows || []).map((r) => r.type_value));
  return mapTrailerRow(rows[0], typesMap);
}

async function getTrailers(req, res) {
  try {
    const trailers = await selectTrailers();
    return res.json({ trailers });
  } catch (e) {
    console.error("getTrailers error:", e);
    return res.status(500).json({ error: "Failed to load trailers" });
  }
}

async function createTrailer(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const trailer = body.trailer || body;

  const id = safeStr(trailer.id, 64) || `trl-${uuidv4()}`;
  const payload = {
    id,
    code: safeStr(trailer.code || "TRL-NEW", 80),
    plate: safeStr(trailer.plate || "", 80),
    types: safeArray(trailer.types).map((t) => safeStr(t, 80)).filter(Boolean),
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO trailers (id, code, plate)
       VALUES (?,?,?)`,
      [payload.id, payload.code, payload.plate]
    );

    await conn.query("DELETE FROM trailer_types WHERE trailer_id = ?", [
      payload.id,
    ]);
    for (const tv of payload.types) {
      await conn.query(
        "INSERT IGNORE INTO trailer_types (trailer_id, type_value) VALUES (?,?)",
        [payload.id, tv]
      );
    }

    await audit(conn, req, { action: "create", entity_type: "trailer", entity_id: id, before: null, after: payload });

    const meta = await bumpVersion(conn);
    const trailers = await selectTrailers(conn);

    await conn.commit();

    broadcast("trailers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ trailers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("createTrailer error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to create trailer", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function updateTrailer(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing trailer id" });

  const body = req.body || {};
  const patch = body.trailer || body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const sets = [];
    const vals = [];
    if (patch.code !== undefined) { sets.push("code = ?"); vals.push(safeStr(patch.code, 80)); }
    if (patch.plate !== undefined) { sets.push("plate = ?"); vals.push(safeStr(patch.plate, 80)); }

    if (sets.length > 0) {
      vals.push(id);
      await conn.query(`UPDATE trailers SET ${sets.join(", ")} WHERE id = ?`, vals);
    }

    if (patch.types !== undefined) {
      await conn.query("DELETE FROM trailer_types WHERE trailer_id = ?", [id]);
      const types = safeArray(patch.types).map((t) => safeStr(t, 80)).filter(Boolean);
      for (const tv of types) {
        await conn.query(
          "INSERT IGNORE INTO trailer_types (trailer_id, type_value) VALUES (?,?)",
          [id, tv]
        );
      }
    }

    const meta = await bumpVersion(conn);
    const trailers = await selectTrailers(conn);

    await conn.commit();

    broadcast("trailers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ trailers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("updateTrailer error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to update trailer", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function deleteTrailer(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing trailer id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const before = await selectTrailerById(id, conn);

    await conn.query("UPDATE trailers SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", [id]);

    await audit(conn, req, { action: "delete", entity_type: "trailer", entity_id: id, before, after: null });

    const meta = await bumpVersion(conn);
    const trailers = await selectTrailers(conn);

    await conn.commit();

    broadcast("trailers:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ trailers, meta });
  } catch (e) {
    await conn.rollback();
    console.error("deleteTrailer error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to delete trailer", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = {
  getTrailers,
  createTrailer,
  updateTrailer,
  deleteTrailer,
};
