const path = require("path");

async function uploadDriverPhoto(req, res) {
  // multer حط الملف في req.file
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const base = process.env.BASE_URL || `https://hamtransport.cloud`;
  const url = base.replace(/\/+$/, "") + "/uploads/" + req.file.filename;

  // مش هنخزنها في DB هنا، الفرونت اصلاً بيستخدمها مباشرة
  return res.json({ url });
}

module.exports = { uploadDriverPhoto };
