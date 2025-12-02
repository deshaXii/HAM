// backend/controllers/uploadController.js (مثال)
const path = require("path");

async function uploadDriverPhoto(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // مهم: تأكد في app.js إنك عامل:
  // app.set("trust proxy", true);

  const host = req.get("host"); // مثلا hamtransport.cloud
  const proto = req.protocol || "http"; // http أو https حسب الطلب
  const base =
    process.env.BASE_URL ||
    (host ? `${proto}://${host}` : "http://localhost:4000");

  const url = `${base.replace(/\/+$/, "")}/uploads/${req.file.filename}`;

  return res.json({ url });
}

module.exports = { uploadDriverPhoto };
