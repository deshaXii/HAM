// backend/src/routes/jobs.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const { requireDeleteIntent } = require("../middleware/requireDeleteIntent");
const {
  getJobs,
  createJob,
  updateJob,
  deleteJob,
  batchJobs,
} = require("../controllers/jobsController");

const router = express.Router();

router.get("/", auth, getJobs);
router.post("/", auth, admin, createJob);
router.post("/batch", auth, admin, batchJobs);
router.patch("/:id", auth, admin, updateJob);
router.delete("/:id", auth, admin, requireDeleteIntent, deleteJob);

module.exports = router;
