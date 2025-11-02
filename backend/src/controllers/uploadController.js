const path = require("path");

async function uploadDriverPhoto(req, res) {
  // multer حط الملف في req.file
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const base =
    process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
  const url = base + "/uploads/" + req.file.filename;
  // مش هنخزنها في DB هنا، الفرونت اصلاً بيستخدمها مباشرة
  return res.json({ url });
}

module.exports = { uploadDriverPhoto };
