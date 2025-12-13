// backend/src/routes/drivers.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
} = require("../controllers/driversController");

const router = express.Router();

router.get("/", auth, getDrivers);
router.post("/", auth, admin, createDriver);
router.patch("/:id", auth, admin, updateDriver);
router.delete("/:id", auth, admin, deleteDriver);

module.exports = router;
