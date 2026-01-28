// backend/src/app.js
const express = require("express");
const cors = require("cors");
const path = require("path");

const { auth } = require("./middleware/auth");
const { me } = require("./controllers/authController");

const authRoutes = require("./routes/auth");
const noticeRoutes = require("./routes/notice");
const usersRoutes = require("./routes/users");
const tasksRoutes = require("./routes/tasks");
const uploadRoutes = require("./routes/upload");
const healthRoutes = require("./routes/health");

// New normalized planner resources
const driversRoutes = require("./routes/drivers");
const tractorsRoutes = require("./routes/tractors");
const trailersRoutes = require("./routes/trailers");
const jobsRoutes = require("./routes/jobs");
const locationsRoutes = require("./routes/locations");
const distancesRoutes = require("./routes/distances");
const settingsRoutes = require("./routes/settings");
const metaRoutes = require("./routes/meta");
const agendaRoutes = require("./routes/agenda");

const app = express();

app.use(
  cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "X-Planner-Version", "X-Delete-Intent"],
    exposedHeaders: ["X-Planner-Version"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use("/api/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use(require("./routes/realtime"));

app.use("/auth", authRoutes);

// Normalized planner resources
app.use("/drivers", driversRoutes);
app.use("/tractors", tractorsRoutes);
app.use("/trailers", trailersRoutes);
app.use("/jobs", jobsRoutes);
app.use("/locations", locationsRoutes);
app.use("/distances", distancesRoutes);
app.use("/settings", settingsRoutes);
app.use("/meta", metaRoutes);
app.use("/agenda", agendaRoutes);

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