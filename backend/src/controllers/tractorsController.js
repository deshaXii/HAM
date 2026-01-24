// backend/src/controllers/tractorsController.js
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
function safeBool(x, fallback = false) {
  if (x === true || x === 1 || x === "1" || x === "true") return true;
  if (x === false || x === 0 || x === "0" || x === "false") return false;
  return fallback;
}

function mapTractorRow(r, typesMap) {
  return {
    id: r.id,
    code: r.code,
    plate: r.plate || "",
    currentLocation: r.current_location || "",
    doubleManned: !!r.double_manned,
    types: typesMap.get(r.id) || [],
  };
}

async function selectTractors(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, code, plate, current_location, double_manned
     FROM tractors
     WHERE deleted_at IS NULL
     ORDER BY code ASC`
  );
  const [typeRows] = await conn.query(
    `SELECT tractor_id, type_value FROM tractor_types ORDER BY tractor_id ASC`
  );
  const typesMap = new Map();
  for (const tr of typeRows) {
    if (!typesMap.has(tr.tractor_id)) typesMap.set(tr.tractor_id, []);
    typesMap.get(tr.tractor_id).push(tr.type_value);
  }
  return rows.map((r) => mapTractorRow(r, typesMap));
}


async function selectTractorById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, code, plate, current_location, double_manned
     FROM tractors
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows || !rows[0]) return null;
  const [typeRows] = await conn.query(
    `SELECT type_value FROM tractor_types WHERE tractor_id = ? ORDER BY type_value ASC`,
    [id]
  );
  const typesMap = new Map();
  typesMap.set(id, (typeRows || []).map((r) => r.type_value));
  return mapTractorRow(rows[0], typesMap);
}

async function getTractors(req, res) {
  try {
    const tractors = await selectTractors();
    return res.json({ tractors });
  } catch (e) {
    console.error("getTractors error:", e);
    return res.status(500).json({ error: "Failed to load tractors" });
  }
}

async function createTractor(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const tractor = body.tractor || body;

  const id = safeStr(tractor.id, 64) || `trk-${uuidv4()}`;
  const payload = {
    id,
    code: safeStr(tractor.code || "TRK-NEW", 80),
    plate: safeStr(tractor.plate || "", 80),
    currentLocation: safeStr(tractor.currentLocation || "", 200),
    doubleManned: safeBool(tractor.doubleManned, false),
    types: safeArray(tractor.types).map((t) => safeStr(t, 80)).filter(Boolean),
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO tractors (id, code, plate, current_location, double_manned)
       VALUES (?,?,?,?,?)`,
      [
        payload.id,
        payload.code,
        payload.plate,
        payload.currentLocation,
        payload.doubleManned ? 1 : 0,
      ]
    );

    await conn.query("DELETE FROM tractor_types WHERE tractor_id = ?", [
      payload.id,
    ]);
    for (const tv of payload.types) {
      await conn.query(
        "INSERT IGNORE INTO tractor_types (tractor_id, type_value) VALUES (?,?)",
        [payload.id, tv]
      );
    }

    await audit(conn, req, { action: "create", entity_type: "tractor", entity_id: id, before: null, after: payload });

    const meta = await bumpVersion(conn);
    const tractors = await selectTractors(conn);

    await conn.commit();

    broadcast("tractors:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ tractors, meta });
  } catch (e) {
    await conn.rollback();
    console.error("createTractor error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to create tractor", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function updateTractor(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing tractor id" });

  const body = req.body || {};
  const patch = body.tractor || body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const [rows] = await conn.query(
      `SELECT id, code, plate, current_location, double_manned
       FROM tractors WHERE id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Tractor not found" });
    }

    const sets = [];
    const vals = [];

    if (patch.code !== undefined) { sets.push("code = ?"); vals.push(safeStr(patch.code, 80)); }
    if (patch.plate !== undefined) { sets.push("plate = ?"); vals.push(safeStr(patch.plate, 80)); }
    if (patch.currentLocation !== undefined) { sets.push("current_location = ?"); vals.push(safeStr(patch.currentLocation, 200)); }
    if (patch.doubleManned !== undefined) { sets.push("double_manned = ?"); vals.push(safeBool(patch.doubleManned, false) ? 1 : 0); }

    if (sets.length > 0) {
      vals.push(id);
      await conn.query(`UPDATE tractors SET ${sets.join(", ")} WHERE id = ?`, vals);
    }

    if (patch.types !== undefined) {
      await conn.query("DELETE FROM tractor_types WHERE tractor_id = ?", [id]);
      const types = safeArray(patch.types).map((t) => safeStr(t, 80)).filter(Boolean);
      for (const tv of types) {
        await conn.query(
          "INSERT IGNORE INTO tractor_types (tractor_id, type_value) VALUES (?,?)",
          [id, tv]
        );
      }
    }

    const meta = await bumpVersion(conn);
    const tractors = await selectTractors(conn);

    await conn.commit();

    broadcast("tractors:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ tractors, meta });
  } catch (e) {
    await conn.rollback();
    console.error("updateTractor error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to update tractor", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

async function deleteTractor(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing tractor id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    const before = await selectTractorById(id, conn);

    await conn.query("UPDATE tractors SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", [id]);

    await audit(conn, req, { action: "delete", entity_type: "tractor", entity_id: id, before, after: null });

    const meta = await bumpVersion(conn);
    const tractors = await selectTractors(conn);

    await conn.commit();

    broadcast("tractors:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ tractors, meta });
  } catch (e) {
    await conn.rollback();
    console.error("deleteTractor error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to delete tractor", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = {
  getTractors,
  createTractor,
  updateTractor,
  deleteTractor,
};
