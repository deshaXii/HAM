// backend/scripts/force-migrate-legacy.js
const {
  migrateFromLegacyPlannerState,
} = require("../src/init/migratePlannerState");

(async () => {
  try {
    const res = await migrateFromLegacyPlannerState({ force: true });
    console.log("Force migration result:", res);
    process.exit(0);
  } catch (e) {
    console.error("Force migration failed:", e);
    process.exit(1);
  }
})();
