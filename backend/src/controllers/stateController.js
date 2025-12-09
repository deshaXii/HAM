// backend/src/controllers/stateController.js
const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");

/**
 * ده الـ default اللي هنرجعله لو الـ DB فاضية أو JSON بايظ
 * مهم: فيه version عشان نعمل حمايه من التعديل من أكتر من تاب/أدمن
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
  version: 1, // 👈 رقم الإصدار
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

  const version =
    typeof src.version === "number" && Number.isFinite(src.version)
      ? src.version
      : typeof DEFAULT_STATE.version === "number"
      ? DEFAULT_STATE.version
      : 1;

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
    version,
  };
}

/**
 * دمج آمن:
 * - ماينفعش فجأة drivers تبقى [] لو كان عندي drivers قبل كده (إلا لو force)
 * - ماينفعش jobs تتمسح بالكامل من غير force
 * - ينضف المراجع اللي في jobs لو الـ resource اتحذف
 */
function mergeStates(dbState, incoming) {
  const current = normalizeState(dbState);
  const next = normalizeState(incoming);

  const force = incoming && incoming._forceEmpty === true;

  // 1) نحمي الـ master lists (drivers/tractors/trailers)
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

  // 2) الـ jobs ممنوع تتمسح بالكامل إلا لو force
  const mergedJobs =
    next.jobs.length === 0 && current.jobs.length > 0 && !force
      ? current.jobs
      : next.jobs;

  // 3) ننضف الـ jobs من مراجع لموارد اتحذفت
  const driverIdsSet = new Set(mergedDrivers.map((d) => d.id));
  const tractorIdsSet = new Set(mergedTractors.map((t) => t.id));
  const trailerIdsSet = new Set(mergedTrailers.map((t) => t.id));

  const cleanedJobs = mergedJobs.map((job) => {
    const j = { ...job };

    if (j.tractorId && !tractorIdsSet.has(j.tractorId)) {
      j.tractorId = null;
    }

    if (j.trailerId && !trailerIdsSet.has(j.trailerId)) {
      j.trailerId = null;
    }

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

/**
 * helper: يجيب الـ state من الداتابيز بشكل آمن
 */
async function loadDbState() {
  const [rows] = await pool.query(
    "SELECT data FROM planner_state WHERE id = 1"
  );

  if (!rows.length || !rows[0].data) {
    return normalizeState(DEFAULT_STATE);
  }

  try {
    const parsed = JSON.parse(rows[0].data);
    return normalizeState(parsed);
  } catch (e) {
    console.error("Failed to parse planner_state:", e);
    return normalizeState(DEFAULT_STATE);
  }
}

async function getState(req, res) {
  try {
    const safe = await loadDbState();
    return res.json(safe);
  } catch (err) {
    console.error("getState error:", err);
    return res.status(500).json({ error: "Failed to load state" });
  }
}

async function saveState(req, res) {
  try {
    const incoming = req.body || {};

    // 1) هات اللي في الداتابيز الأول
    const dbState = await loadDbState();
    const dbVersion =
      typeof dbState.version === "number" && Number.isFinite(dbState.version)
        ? dbState.version
        : 1;

    const incomingVersion =
      typeof incoming.version === "number" && Number.isFinite(incoming.version)
        ? incoming.version
        : null;

    // 2) حماية من التاب/الأدمن القديم:
    // لو الفرونت بعت version أقدم من اللي في الداتابيز → نرفض التعديل
    if (incomingVersion !== null && incomingVersion !== dbVersion) {
      return res.status(409).json({
        error: "STATE_VERSION_CONFLICT",
        message:
          "State was updated by another user/session. Please reload the planner and try again.",
        serverState: dbState,
      });
    }

    // 3) دمج آمن
    const merged = mergeStates(dbState, incoming);

    // 4) زوّد الـ version
    merged.version = dbVersion + 1;

    // 5) خزّن (UPSERT)
    const json = JSON.stringify(merged);
    await pool.query(
      `
        INSERT INTO planner_state (id, data, updated_at)
        VALUES (1, ?, NOW())
        ON DUPLICATE KEY UPDATE
          data = VALUES(data),
          updated_at = VALUES(updated_at)
      `,
      [json]
    );

    // 6) ابعت event لكل الكلاينتس
    broadcast("state:updated", {
      updatedAt: Date.now(),
      version: merged.version,
    });

    // 7) رجّع الـ state نفسه
    return res.json(merged);
  } catch (err) {
    console.error("saveState error:", err);
    return res.status(500).json({ error: "Failed to save state" });
  }
}

module.exports = { getState, saveState };
