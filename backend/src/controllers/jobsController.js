// backend/src/controllers/jobsController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
const {
  parseIncomingVersion,
  assertVersion,
  bumpVersion,
} = require("../utils/plannerMeta");

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeStr(x, max = 200) {
  return String(x ?? "").slice(0, max);
}
function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function isoDateOnly(x) {
  if (!x) return null;

  // mysql2 may return MySQL DATE columns as JS Date objects (local midnight).
  // We must serialize them to YYYY-MM-DD without timezone shifting.
  if (x instanceof Date) {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const d = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(x);

  // Common case: already ISO-ish (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // Fallback: try parsing any other string format, then return local YYYY-MM-DD.
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function normalizePricing(p) {
  const obj = p && typeof p === "object" ? p : {};
  const type = obj.type === "fixed" ? "fixed" : "per_km";
  const value = safeNum(obj.value, 0);
  return { type, value };
}

function normalizeJobInput(jobIn) {
  const j = jobIn || {};
  const id = safeStr(j.id, 64) || `job-${uuidv4()}`;
  const date = isoDateOnly(j.date) || isoDateOnly(new Date());
  const start = safeStr(j.start || "", 10);
  const slot = Math.trunc(safeNum(j.slot, 0));
  const client = safeStr(j.client || "", 200);
  const pickup = safeStr(j.pickup || "", 200);
  const dropoff = safeStr(j.dropoff || "", 200);
  const durationHours = safeNum(j.durationHours, 0);
  const pricing = j.pricing || {};
  const pricingType = pricing.type === "fixed" ? "fixed" : "per_km";
  const pricingValue = safeNum(pricing.value, 0);
  const tractorId = safeStr(j.tractorId || "", 64).trim() || null;
  const trailerId = safeStr(j.trailerId || "", 64).trim() || null;
  const notes = String(j.notes || "");
  const driverIds = safeArray(j.driverIds)
    .map((x) => safeStr(x, 64).trim())
    .filter(Boolean);

  return {
    id,
    date,
    start,
    slot,
    client,
    pickup,
    dropoff,
    durationHours,
    pricingType,
    pricingValue,
    tractorId,
    trailerId,
    notes,
    driverIds,
  };
}

function mapJobRow(r, driverMap) {
  const pricing = normalizePricing({
    type: r.pricing_type,
    value: r.pricing_value,
  });

  return {
    id: r.id,
    date: isoDateOnly(r.date) || isoDateOnly(new Date()),
    start: r.start || "",
    slot: r.slot ?? 0,
    client: r.client || "",
    pickup: r.pickup || "",
    dropoff: r.dropoff || "",
    durationHours: safeNum(r.duration_hours, 0),
    pricing,
    tractorId: r.tractor_id || "",
    trailerId: r.trailer_id || "",
    driverIds: driverMap.get(r.id) || [],
    notes: r.notes || "",
  };
}

async function selectJobs(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, date, start, slot, client, pickup, dropoff, duration_hours, pricing_type, pricing_value,
            tractor_id, trailer_id, notes
     FROM jobs
     ORDER BY date ASC, slot ASC, start ASC`
  );

  const [drvRows] = await conn.query(
    `SELECT job_id, driver_id FROM job_drivers ORDER BY job_id ASC`
  );

  const driverMap = new Map();
  for (const r of drvRows) {
    if (!driverMap.has(r.job_id)) driverMap.set(r.job_id, []);
    driverMap.get(r.job_id).push(r.driver_id);
  }

  return rows.map((r) => mapJobRow(r, driverMap));
}

async function getJobs(req, res) {
  try {
    const jobs = await selectJobs();
    return res.json({ jobs });
  } catch (e) {
    console.error("getJobs error:", e);
    return res.status(500).json({ error: "Failed to load jobs" });
  }
}

async function createJob(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const jobIn = body.job || body;

  const job = normalizeJobInput(jobIn);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `INSERT INTO jobs
        (id, date, start, slot, client, pickup, dropoff, duration_hours, pricing_type, pricing_value, tractor_id, trailer_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.date,
        job.start,
        job.slot,
        job.client,
        job.pickup,
        job.dropoff,
        job.durationHours,
        job.pricingType,
        job.pricingValue,
        job.tractorId,
        job.trailerId,
        job.notes,
      ]
    );

    if (job.driverIds.length > 0) {
      const values = job.driverIds.map((d) => [job.id, d]);
      await conn.query(
        `INSERT IGNORE INTO job_drivers (job_id, driver_id) VALUES ?`,
        [values]
      );
    }

    const meta = await bumpVersion(conn);
    await conn.commit();

    const jobs = await selectJobs();
    broadcast("jobs:updated", { meta });

    return res.json({ jobs, meta });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    console.error("createJob error:", e);
    const status = e.status || 500;
    return res
      .status(status)
      .json({
        error: e.message || "Failed to create job",
        code: e.code,
        meta: e.meta,
      });
  } finally {
    conn.release();
  }
}

async function updateJob(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const jobIn = body.job || body;
  const id = safeStr(req.params.id, 64) || safeStr(jobIn.id, 64);

  if (!id) return res.status(400).json({ error: "Missing job id" });

  const job = normalizeJobInput({ ...jobIn, id });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(
      `UPDATE jobs
       SET date=?, start=?, slot=?, client=?, pickup=?, dropoff=?, duration_hours=?, pricing_type=?, pricing_value=?,
           tractor_id=?, trailer_id=?, notes=?
       WHERE id=?`,
      [
        job.date,
        job.start,
        job.slot,
        job.client,
        job.pickup,
        job.dropoff,
        job.durationHours,
        job.pricingType,
        job.pricingValue,
        job.tractorId,
        job.trailerId,
        job.notes,
        job.id,
      ]
    );

    // replace drivers
    await conn.query(`DELETE FROM job_drivers WHERE job_id = ?`, [job.id]);
    if (job.driverIds.length > 0) {
      const values = job.driverIds.map((d) => [job.id, d]);
      await conn.query(
        `INSERT IGNORE INTO job_drivers (job_id, driver_id) VALUES ?`,
        [values]
      );
    }

    const meta = await bumpVersion(conn);
    await conn.commit();

    const jobs = await selectJobs();
    broadcast("jobs:updated", { meta });

    return res.json({ jobs, meta });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    console.error("updateJob error:", e);
    const status = e.status || 500;
    return res
      .status(status)
      .json({
        error: e.message || "Failed to update job",
        code: e.code,
        meta: e.meta,
      });
  } finally {
    conn.release();
  }
}

async function deleteJob(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const id = safeStr(req.params.id, 64);

  if (!id) return res.status(400).json({ error: "Missing job id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    await conn.query(`DELETE FROM jobs WHERE id = ?`, [id]);

    const meta = await bumpVersion(conn);
    await conn.commit();

    const jobs = await selectJobs();
    broadcast("jobs:updated", { meta });

    return res.json({ jobs, meta });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    console.error("deleteJob error:", e);
    const status = e.status || 500;
    return res
      .status(status)
      .json({
        error: e.message || "Failed to delete job",
        code: e.code,
        meta: e.meta,
      });
  } finally {
    conn.release();
  }
}

async function batchJobs(req, res) {
  const incomingVersion = parseIncomingVersion(req);
  const body = req.body || {};
  const upsertsIn = safeArray(body.upserts || []);
  const deletesIn = safeArray(body.deletes || []);

  const upserts = upsertsIn.map(normalizeJobInput);
  const deletes = deletesIn.map((x) => safeStr(x, 64).trim()).filter(Boolean);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertVersion(conn, incomingVersion);

    if (deletes.length > 0) {
      await conn.query(
        `DELETE FROM jobs WHERE id IN (${deletes.map(() => "?").join(",")})`,
        deletes
      );
    }

    for (const j of upserts) {
      await conn.query(
        `INSERT INTO jobs
          (id, date, start, slot, client, pickup, dropoff, duration_hours, pricing_type, pricing_value, tractor_id, trailer_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           date=VALUES(date),
           start=VALUES(start),
           slot=VALUES(slot),
           client=VALUES(client),
           pickup=VALUES(pickup),
           dropoff=VALUES(dropoff),
           duration_hours=VALUES(duration_hours),
           pricing_type=VALUES(pricing_type),
           pricing_value=VALUES(pricing_value),
           tractor_id=VALUES(tractor_id),
           trailer_id=VALUES(trailer_id),
           notes=VALUES(notes)`,
        [
          j.id,
          j.date,
          j.start,
          j.slot,
          j.client,
          j.pickup,
          j.dropoff,
          j.durationHours,
          j.pricingType,
          j.pricingValue,
          j.tractorId,
          j.trailerId,
          j.notes,
        ]
      );

      await conn.query(`DELETE FROM job_drivers WHERE job_id = ?`, [j.id]);
      if (j.driverIds.length > 0) {
        const values = j.driverIds.map((d) => [j.id, d]);
        await conn.query(
          `INSERT IGNORE INTO job_drivers (job_id, driver_id) VALUES ?`,
          [values]
        );
      }
    }

    const meta = await bumpVersion(conn);
    await conn.commit();

    const jobs = await selectJobs();
    broadcast("jobs:updated", { meta });

    return res.json({ jobs, meta });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    console.error("batchJobs error:", e);
    const status = e.status || 500;
    return res
      .status(status)
      .json({
        error: e.message || "Failed to batch jobs",
        code: e.code,
        meta: e.meta,
      });
  } finally {
    conn.release();
  }
}

module.exports = {
  getJobs,
  createJob,
  updateJob,
  deleteJob,
  batchJobs,
};
