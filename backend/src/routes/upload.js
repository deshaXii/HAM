const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const { uploadDriverPhoto } = require("../controllers/uploadController");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || ".png");
    cb(null, "driver-" + unique + ext);
  },
});

const upload = multer({ storage });

router.post(
  "/driver-photo/:driverId",
  auth,
  admin,
  upload.single("file"),
  uploadDriverPhoto
);

module.exports = router;
