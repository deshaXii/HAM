const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const authRoutes = require("./routes/auth");
const stateRoutes = require("./routes/state");
const noticeRoutes = require("./routes/notice");
const usersRoutes = require("./routes/users");
const tasksRoutes = require("./routes/tasks");
const uploadRoutes = require("./routes/upload");
const healthRoutes = require("./routes/health");

// ✨ استيراد دول
const { auth } = require("./middleware/auth");
const { me } = require("./controllers/authController");

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// ملفات الرفع
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(require("./routes/realtime"));
app.use("/auth", authRoutes);
app.use("/state", stateRoutes);
app.use("/notice", noticeRoutes);
app.use("/users", usersRoutes);
app.use("/tasks", tasksRoutes);
app.use("/upload", uploadRoutes);
app.use("/health", healthRoutes);
app.get("/me", auth, me);

// غلطات
app.use((err, req, res, next) => {
  console.error("ERROR:", err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error" });
});

module.exports = app;
