// backend/src/controllers/jobsController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
const { v4: uuidv4 } = require("uuid");
const { audit } = require("../utils/auditLog");
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
  const id = safeStr(j.id, 64).trim() || `job-${uuidv4()}`;
  const date = isoDateOnly(j.date) || isoDateOnly(new Date());
  const start = safeStr(j.start || "", 10);
  // slot can arrive as 0/1 or as strings like "day"/"night" from the UI
  let slot = 0;
  if (typeof j.slot === "string") {
    const s = j.slot.trim().toLowerCase();
    slot = s === "night" || s === "n" || s === "1" ? 1 : 0;
  } else {
    slot = Math.trunc(safeNum(j.slot, 0));
  }
  const client = safeStr(j.client || "", 200);
  const pickup = safeStr(j.pickup || "", 200);
  const dropoff = safeStr(j.dropoff || "", 200);
  const startPoint = safeStr(j.startPoint || j.start_point || "", 200);
  const endPoint = safeStr(j.endPoint || j.end_point || "", 200);
  const allowStartOverride = !!(j.allowStartOverride ?? j.allow_start_override ?? j.overrideStart ?? false);
  const durationHours = safeNum(j.durationHours, 0);
  const pricing = j.pricing || {};
  const pricingType = pricing.type === "fixed" ? "fixed" : "per_km";
  const pricingValue = safeNum(pricing.value, 0);
  const tractorId = safeStr(j.tractorId || "", 64).trim() || null;
  const trailerId = safeStr(j.trailerId || "", 64).trim() || null;
  const notes = String(j.notes || "");
  const revenueTrip = safeNum(j.revenueTrip ?? j.revenue_trip, 0);
  const costDriver = safeNum(j.costDriver ?? j.cost_driver, 0);
  const costTruck = safeNum(j.costTruck ?? j.cost_truck, 0);
  const costDiesel = safeNum(j.costDiesel ?? j.cost_diesel, 0);
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
    startPoint,
    endPoint,
    allowStartOverride,
    durationHours,
    pricingType,
    pricingValue,
    tractorId,
    trailerId,
    notes,
    revenueTrip,
    costDriver,
    costTruck,
    costDiesel,
    driverIds,
  };
}

function make400(code, message) {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  return err;
}

async function assertTwoManRules(conn, job) {
  const driverIds = safeArray(job.driverIds);
  const count = driverIds.length;

  // Global cap: max 2 drivers per job.
  if (count > 2) {
    throw make400(
      "DRIVER_LIMIT_EXCEEDED",
      "A job can have at most 2 drivers."
    );
  }

  if (count <= 1) return;

  // If tractor is specified, it must allow double-manned.
  if (job.tractorId) {
    const [tRows] = await conn.query(
      `SELECT double_manned FROM tractors WHERE id = ? LIMIT 1`,
      [job.tractorId]
    );
    const allows = !!(tRows && tRows[0] && Number(tRows[0].double_manned) === 1);
    if (!allows) {
      throw make400(
        "TRACTOR_NOT_DOUBLE_MANNED",
        "This tractor does not allow double-manned (max 1 driver)."
      );
    }
  }

  // All drivers must be 2-man eligible when there are 2 drivers.
  const ph = driverIds.map(() => "?").join(",");
  const [dRows] = await conn.query(
    `SELECT id, double_manned_eligible FROM drivers WHERE id IN (${ph})`,
    driverIds
  );
  const eligMap = new Map((dRows || []).map((r) => [String(r.id), Number(r.double_manned_eligible)]));

  for (const id of driverIds) {
    if (!eligMap.has(String(id))) {
      throw make400("INVALID_DRIVER_ID", `Invalid driver id: ${id}`);
    }
    if (eligMap.get(String(id)) !== 1) {
      throw make400(
        "DRIVER_NOT_2MAN_ELIGIBLE",
        `Driver ${id} is not eligible for 2-man jobs.`
      );
    }
  }
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
    startPoint: r.start_point || "",
    endPoint: r.end_point || "",
    allowStartOverride: Number(r.allow_start_override) === 1,
    durationHours: safeNum(r.duration_hours, 0),
    pricing,
    tractorId: r.tractor_id || "",
    trailerId: r.trailer_id || "",
    driverIds: driverMap.get(r.id) || [],
    notes: r.notes || "",
    revenueTrip: safeNum(r.revenue_trip, 0),
    costDriver: safeNum(r.cost_driver, 0),
    costTruck: safeNum(r.cost_truck, 0),
    costDiesel: safeNum(r.cost_diesel, 0),
  };
}

async function selectJobs(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, date, start, slot, client, pickup, dropoff, start_point, end_point, allow_start_override,
            revenue_trip, cost_driver, cost_truck, cost_diesel,
            duration_hours, pricing_type, pricing_value, tractor_id, trailer_id, notes
     FROM jobs
     WHERE deleted_at IS NULL
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


async function selectJobById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, date, start, slot, client, pickup, dropoff, start_point, end_point, allow_start_override,
            revenue_trip, cost_driver, cost_truck, cost_diesel,
            duration_hours, pricing_type, pricing_value, tractor_id, trailer_id, notes
     FROM jobs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows || !rows[0]) return null;
  const [drvRows] = await conn.query(
    `SELECT driver_id FROM job_drivers WHERE job_id = ? ORDER BY driver_id ASC`,
    [id]
  );
  const driverMap = new Map();
  driverMap.set(id, (drvRows || []).map((r) => r.driver_id));
  return mapJobRow(rows[0], driverMap);
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

    // enforce 2-man rules server-side
    await assertTwoManRules(conn, job);

    await conn.query(
      `INSERT INTO jobs
        (id, date, start, slot, client, pickup, dropoff, start_point, end_point, allow_start_override,
         revenue_trip, cost_driver, cost_truck, cost_diesel,
         duration_hours, pricing_type, pricing_value, tractor_id, trailer_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.date,
        job.start,
        job.slot,
        job.client,
        job.pickup,
        job.dropoff,
        job.startPoint,
        job.endPoint,
        job.allowStartOverride ? 1 : 0,
        job.revenueTrip,
        job.costDriver,
        job.costTruck,
        job.costDiesel,
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

    await audit(conn, req, { action: "create", entity_type: "job", entity_id: job.id, before: null, after: job });

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

    // enforce 2-man rules server-side
    await assertTwoManRules(conn, job);

    const before = await selectJobById(id, conn);

    await conn.query(
      `UPDATE jobs
       SET date=?, start=?, slot=?, client=?, pickup=?, dropoff=?, start_point=?, end_point=?, allow_start_override=?,
           revenue_trip=?, cost_driver=?, cost_truck=?, cost_diesel=?,
           duration_hours=?, pricing_type=?, pricing_value=?, tractor_id=?, trailer_id=?, notes=?
       WHERE id=? AND deleted_at IS NULL`,
      [
        job.date,
        job.start,
        job.slot,
        job.client,
        job.pickup,
        job.dropoff,
        job.startPoint,
        job.endPoint,
        job.allowStartOverride ? 1 : 0,
        job.revenueTrip,
        job.costDriver,
        job.costTruck,
        job.costDiesel,
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

    const after = await selectJobById(id, conn);
    await audit(conn, req, {
      action: "update",
      entity_type: "job",
      entity_id: id,
      before,
      after,
    });

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
    return res.status(status).json({
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

    const before = await selectJobById(id, conn);

    // Soft delete to prevent permanent data loss.
    await conn.query(
      `UPDATE jobs SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    await audit(conn, req, {
      action: "delete",
      entity_type: "job",
      entity_id: id,
      before,
      after: null,
    });

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
    return res.status(status).json({
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
      const err = new Error("Batch delete is disabled; use DELETE /jobs/:id");
      err.status = 400;
      err.code = "BATCH_DELETE_DISABLED";
      throw err;
    }

    for (const j of upserts) {
      // enforce 2-man rules server-side
      await assertTwoManRules(conn, j);
      await conn.query(
        `INSERT INTO jobs
          (id, date, start, slot, client, pickup, dropoff,
           start_point, end_point, allow_start_override,
           revenue_trip, cost_driver, cost_truck, cost_diesel,
           duration_hours, pricing_type, pricing_value,
           tractor_id, trailer_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           date=VALUES(date),
           start=VALUES(start),
           slot=VALUES(slot),
           client=VALUES(client),
           pickup=VALUES(pickup),
           dropoff=VALUES(dropoff),
           start_point=VALUES(start_point),
           end_point=VALUES(end_point),
           allow_start_override=VALUES(allow_start_override),
           revenue_trip=VALUES(revenue_trip),
           cost_driver=VALUES(cost_driver),
           cost_truck=VALUES(cost_truck),
           cost_diesel=VALUES(cost_diesel),
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
          j.startPoint,
          j.endPoint,
          j.allowStartOverride ? 1 : 0,
          j.revenueTrip,
          j.costDriver,
          j.costTruck,
          j.costDiesel,
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
