// backend/src/routes/meta.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const { getMeta, patchMeta } = require("../controllers/metaController");

const router = express.Router();

router.get("/", auth, getMeta);
router.patch("/", auth, admin, patchMeta);

module.exports = router;
