const path = require("path");

async function uploadDriverPhoto(req, res) {
  // multer حط الملف في req.file
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";

  let base;

  if (process.env.BASE_URL) {
    // لو حطيت BASE_URL في الـ .env (مثلاً https://hamtransport.cloud/api)
    base = process.env.BASE_URL.replace(/\/+$/, "");
  } else {
    // نبني الـ base من الريكوست نفسه
    base = `${proto}://${host}`.replace(/\/+$/, "");

    // في البرودكشن: الـ API ماشي تحت /api → نزودها في الـ base
    if (host === "hamtransport.cloud" || host === "www.hamtransport.cloud") {
      base += "/api";
    }
  }

  const url = `${base}/uploads/${req.file.filename}`;

  // مش هنخزنها في DB هنا، الفرونت اصلاً بيستخدمها مباشرة
  return res.json({ url });
}

module.exports = { uploadDriverPhoto };
