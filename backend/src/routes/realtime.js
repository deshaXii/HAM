const express = require("express");
const router = express.Router();
const { sseHandler } = require("../realtime/sse");
// لو محتاج auth عبر query token، تحقّق هنا
router.get("/events", sseHandler);
module.exports = router;
