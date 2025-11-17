// backend/src/controllers/stateController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");
/**
 * ده الـ default اللي هنرجعله لو الـ DB فاضية أو JSON بايظ
 */
const DEFAULT_STATE = {
  jobs: [],
  drivers: [],
  tractors: [],
  trailers: [],
  locations: [],
  distanceKm: {},
  settings: {
    rates: {
      emptyKmCost: 0.25,
      tractorKmCostLoaded: 0.3,
      driverHourCost: 22.5,
      nightPremiumPct: 25,
    },
    trailerDayCost: {
      reefer: 35,
      box: 20,
      taut: 18,
      chassis: 15,
    },
  },
  weekStart: new Date().toISOString().slice(0, 10),
};

/**
 * تطبيع للـ state عشان نضمن إن كل الحقول موجودة
 */
function normalizeState(raw) {
  const src = raw || {};
  const normalizeTrailers = (list) =>
    (Array.isArray(list) ? list : []).map((t) => ({
      ...t,
      types: Array.isArray(t.types) ? t.types : t.type ? [t.type] : [],
    }));
  return {
    ...DEFAULT_STATE,
    ...src,
    drivers: Array.isArray(src.drivers) ? src.drivers : [],
    tractors: Array.isArray(src.tractors) ? src.tractors : [],
    trailers: normalizeTrailers(src.trailers),
    jobs: Array.isArray(src.jobs) ? src.jobs : [],
    locations: Array.isArray(src.locations)
      ? src.locations
      : [...DEFAULT_STATE.locations],
    distanceKm:
      typeof src.distanceKm === "object" && src.distanceKm !== null
        ? src.distanceKm
        : {},
    settings:
      typeof src.settings === "object" && src.settings !== null
        ? { ...DEFAULT_STATE.settings, ...src.settings }
        : { ...DEFAULT_STATE.settings },
  };
}

/**
 * دمج آمن:
 * - ماينفعش فجأة drivers تبقى [] لو كان عندي drivers قبل كده
 * - ماينفعش jobs تتمسح
 * - لو admin فعلا كان قصده يفضي حاجة يبعت _forceEmpty=true
 */
function mergeStates(dbState, incoming) {
  const current = normalizeState(dbState);
  const next = normalizeState(incoming);

  const force = incoming && incoming._forceEmpty === true;

  // 1) نحمي الـ master lists
  const mergedDrivers =
    next.drivers.length === 0 && current.drivers.length > 0 && !force
      ? current.drivers
      : next.drivers;

  const mergedTractors =
    next.tractors.length === 0 && current.tractors.length > 0 && !force
      ? current.tractors
      : next.tractors;

  const mergedTrailers =
    next.trailers.length === 0 && current.trailers.length > 0 && !force
      ? current.trailers
      : next.trailers;

  // 2) الـ jobs ممنوع تتمسح تحت أي ظرف (إلا لو _forceEmpty)
  const mergedJobs =
    next.jobs.length === 0 && current.jobs.length > 0 && !force
      ? current.jobs
      : next.jobs;

  // 3) لو حد شال driver/tractor/trailer من الليست، ما نمسحش الـ jobs
  //    نعالج الـ jobs ونخلي المراجع اللي مش موجودة = null
  const driverIdsSet = new Set(mergedDrivers.map((d) => d.id));
  const tractorIdsSet = new Set(mergedTractors.map((t) => t.id));
  const trailerIdsSet = new Set(mergedTrailers.map((t) => t.id));

  const cleanedJobs = mergedJobs.map((job) => {
    const j = { ...job };

    // tractor
    if (j.tractorId && !tractorIdsSet.has(j.tractorId)) {
      j.tractorId = null;
    }

    // trailer
    if (j.trailerId && !trailerIdsSet.has(j.trailerId)) {
      j.trailerId = null;
    }

    // drivers (array)
    if (Array.isArray(j.driverIds) && j.driverIds.length > 0) {
      j.driverIds = j.driverIds.filter((id) => driverIdsSet.has(id));
    } else {
      j.driverIds = [];
    }

    return j;
  });

  return {
    ...current,
    ...next,
    drivers: mergedDrivers,
    tractors: mergedTractors,
    trailers: mergedTrailers,
    jobs: cleanedJobs,
  };
}

async function getState(req, res) {
  const [rows] = await pool.query(
    "SELECT data, updated_at FROM planner_state WHERE id = 1"
  );
  if (!rows.length || !rows[0].data) {
    return res.json(DEFAULT_STATE);
  }
  try {
    const parsed = JSON.parse(rows[0].data);
    // نرجع normalized عشان الفرونت يبقى دايمًا مبسوط
    const safe = normalizeState(parsed);
    return res.json(safe);
  } catch (e) {
    console.error("Failed to parse planner_state:", e);
    return res.json(DEFAULT_STATE);
  }
}

async function saveState(req, res) {
  try {
    // 1) هات اللي في الداتابيز الأول
    const [rows] = await pool.query(
      "SELECT data FROM planner_state WHERE id = 1"
    );
    const dbState =
      rows.length && rows[0].data ? JSON.parse(rows[0].data) : DEFAULT_STATE;

    // 2) دمج آمن
    const merged = mergeStates(dbState, req.body || {});

    // 3) خزّن
    await pool.query(
      "UPDATE planner_state SET data = ?, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(merged)]
    );

    // 4) مهم جدًا: نرجّع الـ state نفسه مش {ok:true}
    return res.json(merged);
  } catch (err) {
    console.error("saveState error:", err);
    broadcast("state:updated", { updatedAt: Date.now() });
    return res.status(500).json({ error: "Failed to save state" });
  }
}
//  s
module.exports = { getState, saveState };
