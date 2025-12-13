// backend/src/controllers/settingsController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { parseIncomingVersion, assertVersion, bumpVersion } = require("../utils/plannerMeta");

function safeObj(x) {
  return typeof x === "object" && x !== null ? x : {};
}

async function readSettings(conn = pool) {
  const [rows] = await conn.query(
    `SELECT rates_json, trailer_day_cost_json
     FROM planner_settings
     WHERE id = 1`
  );
  const row = rows && rows[0] ? rows[0] : { rates_json: "{}", trailer_day_cost_json: "{}" };
  let rates = {};
  let trailerDayCost = {};
  try { rates = JSON.parse(row.rates_json || "{}"); } catch {}
  try { trailerDayCost = JSON.parse(row.trailer_day_cost_json || "{}"); } catch {}

  return { rates: safeObj(rates), trailerDayCost: safeObj(trailerDayCost) };
}

async function getSettings(req, res) {
  try {
    const settings = await readSettings();
    return res.json({ settings });
  } catch (e) {
    console.error("getSettings error:", e);
    return res.status(500).json({ error: "Failed to load settings" });
  }
}

async function patchSettings(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const settingsIn = body.settings || body;
  const rates = safeObj(settingsIn.rates);
  const trailerDayCost = safeObj(settingsIn.trailerDayCost);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `UPDATE planner_settings
       SET rates_json = ?, trailer_day_cost_json = ?
       WHERE id = 1`,
      [JSON.stringify(rates), JSON.stringify(trailerDayCost)]
    );

    const meta = await bumpVersion(conn);
    const settings = await readSettings(conn);

    await conn.commit();

    broadcast("settings:updated", { updatedAt: Date.now(), version: meta.version });
    broadcast("state:updated", { updatedAt: Date.now(), version: meta.version });

    return res.json({ settings, meta });
  } catch (e) {
    await conn.rollback();
    console.error("patchSettings error:", e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Failed to update settings", code: e.code, meta: e.meta });
  } finally {
    conn.release();
  }
}

module.exports = {
  getSettings,
  patchSettings,
};
