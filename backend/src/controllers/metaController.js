// backend/src/controllers/metaController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { parseIncomingVersion, assertVersion, bumpVersion, readMeta } = require("../utils/plannerMeta");

async function getMeta(req, res) {
  try {
    const meta = await readMeta();
    return res.json({ meta });
  } catch (e) {
    console.error("getMeta error:", e);
    return res.status(500).json({ error: "Failed to load meta" });
  }
}

async function patchMeta(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const patch = body.meta || body;

  const weekStart = patch.weekStart === null || patch.weekStart === undefined
    ? null
    : String(patch.weekStart).slice(0, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(`UPDATE planner_meta SET week_start = ? WHERE id = 1`, [weekStart]);

    const meta = await bumpVersion(conn);

    await conn.commit();

    broadcast("meta:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ meta });
  } catch (e) {
    await conn.rollback();
    console.error("patchMeta error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to update meta", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = { getMeta, patchMeta };
