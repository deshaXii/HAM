const express = require("express");
const { getNotice, updateNotice } = require("../controllers/noticeController");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");

const router = express.Router();

router.get("/", auth, getNotice);
router.put("/", auth, admin, updateNotice);

module.exports = router;
