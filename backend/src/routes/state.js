const express = require("express");
const { getState, saveState } = require("../controllers/stateController");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");

const router = express.Router();

router.get("/", auth, getState);
router.put("/", auth, admin, saveState);

module.exports = router;
