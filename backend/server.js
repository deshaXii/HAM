require("dotenv").config();
const app = require("./src/app");
const { ensureInit } = require("./src/init/initDb");

const PORT = process.env.PORT || 4000;

(async () => {
  await ensureInit(); // يتأكد إن الجداول موجودة وفيه أدمن
  app.listen(PORT, () => {
    console.log("API running on http://localhost:" + PORT);
  });
})();
