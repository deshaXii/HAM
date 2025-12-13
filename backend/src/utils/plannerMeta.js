// backend/src/utils/plannerMeta.js
const { pool } = require("../config/db");

function toISODateOnly(d) {
  if (!d) return null;
  try {
    const dt = d instanceof Date ? d : new Date(d);

    // Avoid timezone shifts for MySQL DATE values. Use local components.
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");

    return `${y}-${m}-${da}`;
  } catch {
    return null;
  }
}

function parseIncomingVersion(req) {
  const hv = req.headers["x-planner-version"];
  if (hv !== undefined && hv !== null && String(hv).trim() !== "") {
    const n = Number(hv);
    if (Number.isFinite(n)) return n;
  }
  const bv = req.body?.version;
  if (bv !== undefined && bv !== null && String(bv).trim?.() !== "") {
    const n = Number(bv);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function readMeta(conn = pool) {
  const [rows] = await conn.query(
    "SELECT week_start, version FROM planner_meta WHERE id = 1"
  );
  if (!rows || rows.length === 0) return { weekStart: null, version: 1 };
  return {
    weekStart: toISODateOnly(rows[0].week_start),
    version: rows[0].version,
  };
}

async function lockMetaForUpdate(conn) {
  const [rows] = await conn.query(
    "SELECT week_start, version FROM planner_meta WHERE id = 1 FOR UPDATE"
  );
  if (!rows || rows.length === 0) {
    const err = new Error("planner_meta missing");
    err.status = 500;
    throw err;
  }
  return {
    weekStart: toISODateOnly(rows[0].week_start),
    version: rows[0].version,
  };
}

function conflictError(meta) {
  const err = new Error(
    "State was updated by another user/session. Please reload the planner and try again."
  );
  err.status = 409;
  err.code = "STATE_VERSION_CONFLICT";
  err.meta = meta || null;
  return err;
}

async function assertVersion(conn, incomingVersion) {
  if (incomingVersion === null || incomingVersion === undefined) return;
  const meta = await lockMetaForUpdate(conn);
  if (Number(meta.version) !== Number(incomingVersion)) {
    throw conflictError(meta);
  }
}

async function bumpVersion(conn) {
  await conn.query(
    "UPDATE planner_meta SET version = version + 1 WHERE id = 1"
  );
  const meta = await readMeta(conn);
  return meta;
}

module.exports = {
  parseIncomingVersion,
  assertVersion,
  bumpVersion,
  readMeta,
};
