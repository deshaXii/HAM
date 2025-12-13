// backend/src/routes/locations.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} = require("../controllers/locationsController");

const router = express.Router();

router.get("/", auth, getLocations);
router.post("/", auth, admin, createLocation);
router.patch("/:id", auth, admin, updateLocation);
router.delete("/:id", auth, admin, deleteLocation);

module.exports = router;
