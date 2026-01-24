// backend/src/controllers/agendaController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
const { audit } = require("../utils/auditLog");

/* ---------------- Meta/version helpers (self-contained) ---------------- */

function toISODateOnly(d) {
  if (!d) return null;

  // If mysql2 returns DATE as string, keep it.
  if (typeof d === "string") return d.slice(0, 10);

  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;

  // IMPORTANT: return local YYYY-MM-DD (no timezone shift)
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function parseIncomingVersion(req) {
  const hv = req.headers["x-planner-version"];
  if (hv === undefined || hv === null || hv === "") return null;
  const n = Number(hv);
  return Number.isFinite(n) ? n : null;
}

async function ensureMetaRow(conn) {
  // create row id=1 if not exists
  await conn.query(
    "INSERT IGNORE INTO planner_meta (id, week_start, version) VALUES (1, NULL, 1)"
  );
}

async function readMeta(conn) {
  await ensureMetaRow(conn);
  const [rows] = await conn.query(
    "SELECT week_start, version FROM planner_meta WHERE id = 1"
  );
  const r = rows?.[0] || {};
  return {
    weekStart: r.week_start ? toISODateOnly(r.week_start) : null,
    version: Number(r.version || 1),
  };
}

async function assertVersion(conn, incomingVersion) {
  if (incomingVersion === null) return; // allow when header is absent
  const meta = await readMeta(conn);
  if (Number(incomingVersion) !== Number(meta.version)) {
    const err = new Error(
      "State was updated by another user/session. Reload and try again."
    );
    err.status = 409;
    err.code = "STATE_VERSION_CONFLICT";
    err.meta = meta;
    throw err;
  }
}

async function bumpVersion(conn) {
  await ensureMetaRow(conn);
  await conn.query(
    "UPDATE planner_meta SET version = version + 1 WHERE id = 1"
  );
  return readMeta(conn);
}

/* ---------------- Agenda helpers ---------------- */

function safeStr(x, max = 500) {
  return String(x ?? "").slice(0, max);
}
function safeType(x) {
  const t = String(x || "normal");
  return t === "emergency" ? "emergency" : "normal";
}
function safeTime(x, fallback) {
  const s = String(x || "").trim();
  // basic "HH:MM" check
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return fallback;
}
function safeDay(x) {
  const s = String(x || "").trim();
  // expect YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

async function selectAgenda(conn) {
  const [rows] = await conn.query(
    `SELECT id, day, start_time, end_time, type, title, details
     FROM agenda_items
     WHERE deleted_at IS NULL
     ORDER BY day ASC, start_time ASC, title ASC`
  );

  return (rows || []).map((r) => ({
    id: r.id,
    day: toISODateOnly(r.day),
    start: r.start_time,
    end: r.end_time,
    type: r.type || "normal",
    title: r.title || "",
    details: r.details || "",
  }));
}



function mapAgendaRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    day: toISODateOnly(r.day),
    start: r.start_time,
    end: r.end_time,
    type: r.type || "normal",
    title: r.title || "",
    details: r.details || "",
  };
}

async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------------- Controllers ---------------- */


async function selectAgendaItemById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, day, start_time, end_time, type, title, details
     FROM agenda_items
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  if (!rows || !rows[0]) return null;
  return mapAgendaRow(rows[0]);
}

async function getAgenda(req, res, next) {
  try {
    const agenda = await selectAgenda(pool);
    const meta = await readMeta(pool);
    return res.json({ agenda, meta });
  } catch (e) {
    next(e);
  }
}

async function createAgendaItem(req, res, next) {
  try {
    const incomingVersion = parseIncomingVersion(req);
    const body = req.body || {};
    const item = body.agendaItem || body.item || body;

    const id = safeStr(item.id || uuidv4(), 64);
    const title = safeStr(item.title, 200);
    const day = safeDay(item.day);
    const start = safeTime(item.start, "08:00");
    const end = safeTime(item.end, "10:00");
    const type = safeType(item.type);
    const details = safeStr(item.details, 5000);

    if (!title) return res.status(400).json({ message: "title required" });
    if (!day)
      return res.status(400).json({ message: "day (YYYY-MM-DD) required" });

    const out = await withTx(async (conn) => {
      await assertVersion(conn, incomingVersion);

      await conn.query(
        `INSERT INTO agenda_items (id, day, start_time, end_time, type, title, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, day, start, end, type, title, details]
      );

      await audit(conn, req, { action: "create", entity_type: "agenda", entity_id: id, before: null, after: { id, day, start, end, type, title, details } });

      const meta = await bumpVersion(conn);
      const agenda = await selectAgenda(conn);
      return { meta, agenda };
    });

    broadcast("agenda:updated", { meta: out.meta });
    return res.json(out);
  } catch (e) {
    next(e);
  }
}

async function updateAgendaItem(req, res, next) {
  try {
    const incomingVersion = parseIncomingVersion(req);
    const id = safeStr(req.params.id, 64);

    const body = req.body || {};
    const item = body.agendaItem || body.item || body;

    const title = safeStr(item.title, 200);
    const day = safeDay(item.day);
    const start = safeTime(item.start, "08:00");
    const end = safeTime(item.end, "10:00");
    const type = safeType(item.type);
    const details = safeStr(item.details, 5000);

    if (!id) return res.status(400).json({ message: "id required" });
    if (!title) return res.status(400).json({ message: "title required" });
    if (!day)
      return res.status(400).json({ message: "day (YYYY-MM-DD) required" });

    const out = await withTx(async (conn) => {
      await assertVersion(conn, incomingVersion);

      const before = await selectAgendaItemById(id, conn);

      const [r] = await conn.query(
        `UPDATE agenda_items
         SET day=?, start_time=?, end_time=?, type=?, title=?, details=?
         WHERE id=? AND deleted_at IS NULL`,
        [day, start, end, type, title, details, id]
      );

      // If missing (edge), upsert and clear deleted_at.
      if (r.affectedRows === 0) {
        await conn.query(
          `INSERT INTO agenda_items (id, day, start_time, end_time, type, title, details, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE
             day=VALUES(day),
             start_time=VALUES(start_time),
             end_time=VALUES(end_time),
             type=VALUES(type),
             title=VALUES(title),
             details=VALUES(details),
             deleted_at=NULL`,
          [id, day, start, end, type, title, details]
        );
      }

      const after = await selectAgendaItemById(id, conn);
      await audit(conn, req, {
        action: "update",
        entity_type: "agenda",
        entity_id: id,
        before,
        after,
      });

      const meta = await bumpVersion(conn);
      const agenda = await selectAgenda(conn);
      return { meta, agenda };
    });

    broadcast("agenda:updated", { meta: out.meta });
    return res.json(out);
  } catch (e) {
    next(e);
  }
}

async function deleteAgendaItem(req, res, next) {
  try {
    const incomingVersion = parseIncomingVersion(req);
    const id = safeStr(req.params.id, 64);

    const out = await withTx(async (conn) => {
      await assertVersion(conn, incomingVersion);

      const before = await selectAgendaItemById(id, conn);

      // Soft delete (recoverable)
      await conn.query(
        `UPDATE agenda_items SET deleted_at = NOW() WHERE id=? AND deleted_at IS NULL`,
        [id]
      );

      await audit(conn, req, {
        action: "delete",
        entity_type: "agenda",
        entity_id: id,
        before,
        after: null,
      });

      const meta = await bumpVersion(conn);
      const agenda = await selectAgenda(conn);
      return { meta, agenda };
    });

    broadcast("agenda:updated", { meta: out.meta });
    return res.json(out);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getAgenda,
  createAgendaItem,
  updateAgendaItem,
  deleteAgendaItem,
};
