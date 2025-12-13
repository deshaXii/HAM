// backend/src/routes/tractors.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getTractors,
  createTractor,
  updateTractor,
  deleteTractor,
} = require("../controllers/tractorsController");

const router = express.Router();

router.get("/", auth, getTractors);
router.post("/", auth, admin, createTractor);
router.patch("/:id", auth, admin, updateTractor);
router.delete("/:id", auth, admin, deleteTractor);

module.exports = router;
