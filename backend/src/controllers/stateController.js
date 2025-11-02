// backend/src/controllers/stateController.js
const { pool } = require("../config/db");

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

async function getState(req, res) {
  const [rows] = await pool.query(
    "SELECT data FROM planner_state WHERE id = 1"
  );
  if (!rows.length || !rows[0].data) {
    return res.json(DEFAULT_STATE);
  }
  try {
    const parsed = JSON.parse(rows[0].data);
    return res.json(parsed);
  } catch (e) {
    console.error("Failed to parse planner_state:", e);
    return res.json(DEFAULT_STATE);
  }
}

async function saveState(req, res) {
  const nextState = req.body || {};
  const json = JSON.stringify(nextState);
  await pool.query(
    "UPDATE planner_state SET data = ?, updated_at = NOW() WHERE id = 1",
    [json]
  );
  return res.json({ ok: true });
}

module.exports = { getState, saveState };
