// backend/src/routes/settings.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getSettings,
  patchSettings,
} = require("../controllers/settingsController");

const router = express.Router();

router.get("/", auth, getSettings);
router.patch("/", auth, admin, patchSettings);

module.exports = router;
