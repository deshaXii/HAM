// server/src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { getFleetState, saveFleetState } from "./services/stateService.js";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));
app.use(morgan("dev"));

const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change_me";

/* ================= helpers ================= */
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function getUserCount() {
  return await prisma.user.count();
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN")
    return res.status(403).json({ error: "Admin only" });
  next();
}

/* ============== شكل الداتا الافتراضي ============== */
const DEFAULT_STATE = {
  drivers: [],
  tractors: [],
  trailers: [],
  jobs: [],
  locations: [
    "Depot-Hoofddorp",
    "AH-Zaandam",
    "Aldi-Culemborg",
    "Action-Zwaagdijk",
    "PostNL-Amsterdam",
  ],
  distanceKm: {},
  weekStart: new Date().toISOString().slice(0, 10),
  settings: {
    rates: {
      loadedKmRevenue: 1.4,
      emptyKmCost: 0.6,
      tractorKmCostLoaded: 0.3,
      driverHourCost: 22.5,
      nightPremiumPct: 25,
    },
    trailerDayCost: { reefer: 35, box: 20, taut: 18, chassis: 15 },
  },
};

/* ============== health ============== */
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ============== /state ============== */
app.get("/state", async (req, res) => {
  try {
    const st = await getFleetState();
    res.status(200).json(st);
  } catch (err) {
    console.error("GET /state error:", err);
    res.status(500).json({ error: "failed-to-get-state" });
  }
});

app.put("/state", async (req, res) => {
  try {
    const incoming = req.body;
    await saveFleetState(incoming);
    // رجّع state متعقّم
    const st = await getFleetState();
    res.status(200).json(st);
  } catch (err) {
    console.error("PUT /state error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============== Auth ============== */
app.post("/auth/signup", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res
      .status(400)
      .json({ error: "email, password, and name are required" });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(400).json({ error: "Email already in use" });

  const hashed = await bcrypt.hash(password, 10);
  const count = await getUserCount();
  const role = count === 0 ? "ADMIN" : "USER";

  const user = await prisma.user.create({
    data: { email, password: hashed, name, role },
  });
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

app.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json(user);
});

/* ============== Users (admin panel) ============== */
app.get("/users", authMiddleware, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
  });
  res.json(users);
});

app.patch(
  "/users/:id/admin",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    const targetId = Number(req.params.id);
    const { isAdmin } = req.body || {};
    if (typeof isAdmin !== "boolean")
      return res.status(400).json({ error: "isAdmin boolean required" });

    if (req.user.id === targetId && !isAdmin) {
      return res
        .status(400)
        .json({ error: "You cannot remove your own admin role" });
    }

    const newRole = isAdmin ? "ADMIN" : "USER";
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { role: newRole },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json({ user: updated });
  }
);

app.patch("/users/:id", authMiddleware, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const { name, email } = req.body || {};
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json({ user: updated });
});

app.delete("/users/:id", authMiddleware, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (req.user.id === targetId)
    return res.status(400).json({ error: "You cannot delete yourself" });

  await prisma.user.delete({ where: { id: targetId } });
  res.json({ ok: true });
});

/* ============== Notice board ============== */
app.get("/notice", async (_req, res) => {
  const n = await prisma.notice.findUnique({ where: { id: 1 } });
  res.json(n || { id: 1, content: "" });
});
app.put("/notice", authMiddleware, requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  const up = await prisma.notice.upsert({
    where: { id: 1 },
    update: { content },
    create: { id: 1, content: content || "" },
  });
  res.json(up);
});

/* ============== Tasks ============== */
app.get("/tasks/all", authMiddleware, requireAdmin, async (_req, res) => {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  res.json({ tasks });
});

app.get("/tasks/me", authMiddleware, async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  res.json({ tasks });
});

app.post("/tasks/:userId", authMiddleware, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const { title, items } = req.body || {};
  if (!title || !Array.isArray(items)) {
    return res.status(400).json({ error: "title and items[] are required" });
  }
  const task = await prisma.task.create({
    data: {
      title,
      userId,
    },
  });
  await Promise.all(
    items.map((text) =>
      prisma.taskItem.create({ data: { text, taskId: task.id } })
    )
  );
  const full = await prisma.task.findUnique({
    where: { id: task.id },
    include: { items: true },
  });
  res.json(full);
});

app.patch("/tasks/:taskId", authMiddleware, requireAdmin, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const { title } = req.body || {};
  const up = await prisma.task.update({
    where: { id: taskId },
    data: { ...(title ? { title } : {}) },
    include: { items: true },
  });
  res.json(up);
});

app.patch("/tasks/item/:itemId", authMiddleware, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const { done, comment, text } = req.body || {};

  const item = await prisma.taskItem.findUnique({
    where: { id: itemId },
    include: { task: true },
  });
  if (!item) return res.status(404).json({ error: "Task item not found" });

  if (req.user.role !== "ADMIN" && item.task.userId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const data = {};
  if (typeof done === "boolean") data.done = done;
  if (comment !== undefined) data.comment = comment;
  if (req.user.role === "ADMIN" && text !== undefined) data.text = text;

  const up = await prisma.taskItem.update({
    where: { id: itemId },
    data,
  });
  res.json(up);
});

app.delete("/tasks/:taskId", authMiddleware, requireAdmin, async (req, res) => {
  const taskId = Number(req.params.taskId);
  await prisma.taskItem.deleteMany({ where: { taskId } });
  await prisma.task.delete({ where: { id: taskId } });
  res.json({ ok: true });
});

/* ============== Tractors CRUD ============== */
app.get("/tractors", authMiddleware, requireAdmin, async (_req, res) => {
  const tractors = await prisma.tractor.findMany();
  res.json(tractors);
});

app.post("/tractors", authMiddleware, requireAdmin, async (req, res) => {
  const { code, plate } = req.body || {};
  if (!code) return res.status(400).json({ error: "code required" });
  const t = await prisma.tractor.create({ data: { code, plate } });
  res.json(t);
});

app.get("/", (_req, res) => res.json({ ok: true }));

export default app;
