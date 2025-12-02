require("dotenv").config();
const app = require("./src/app");
const { ensureInit } = require("./src/init/initDb");

const PORT = process.env.PORT || 4000;
app.set("trust proxy", 1);
(async () => {
  await ensureInit(); // يتأكد إن الجداول موجودة وفيه أدمن
  app.listen(PORT, "0.0.0.0");
})();
