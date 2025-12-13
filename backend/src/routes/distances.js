// backend/src/routes/distances.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getDistances,
  upsertDistance,
  replaceMatrix,
} = require("../controllers/distancesController");

const router = express.Router();

router.get("/", auth, getDistances);
router.patch("/", auth, admin, upsertDistance);
router.put("/matrix", auth, admin, replaceMatrix);

module.exports = router;
