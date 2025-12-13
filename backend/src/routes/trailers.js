// backend/src/routes/trailers.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getTrailers,
  createTrailer,
  updateTrailer,
  deleteTrailer,
} = require("../controllers/trailersController");

const router = express.Router();

router.get("/", auth, getTrailers);
router.post("/", auth, admin, createTrailer);
router.patch("/:id", auth, admin, updateTrailer);
router.delete("/:id", auth, admin, deleteTrailer);

module.exports = router;
