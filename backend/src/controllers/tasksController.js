const { pool } = require("../config/db");
const { broadcast } = require("../realtime/sse");

async function getTasks(req, res) {
  // نجيب التاسكات ومعاها الايتيمز
  const [tasks] = await pool.query(
    `SELECT t.id, t.user_id, t.title, t.created_at, u.name AS user_name
     FROM tasks t
     LEFT JOIN users u ON t.user_id = u.id
     ORDER BY t.id DESC`
  );

  const [items] = await pool.query(
    `SELECT id, task_id, text, done, comment FROM task_items ORDER BY id ASC`
  );

  const map = {};
  tasks.forEach((t) => {
    map[t.id] = {
      id: t.id,
      userId: t.user_id,
      title: t.title,
      createdAt: t.created_at,
      user: t.user_name
        ? { id: t.user_id, name: t.user_name }
        : t.user_id
        ? { id: t.user_id }
        : null,
      items: [],
    };
  });

  items.forEach((it) => {
    if (map[it.task_id]) {
      map[it.task_id].items.push({
        id: it.id,
        text: it.text,
        done: !!it.done,
        comment: it.comment,
      });
    }
  });

  res.json({ tasks: Object.values(map) });
}

// POST /tasks/:userId
async function createTaskForUser(req, res) {
  const { userId } = req.params;
  const { title, items } = req.body;
  const [result] = await pool.query(
    `INSERT INTO tasks (user_id, title) VALUES (?,?)`,
    [userId || null, title || "Untitled task"]
  );
  const taskId = result.insertId;

  if (Array.isArray(items)) {
    for (const it of items) {
      await pool.query(
        `INSERT INTO task_items (task_id, text, done, comment) VALUES (?,?,?,?)`,
        [taskId, it.text || "", it.done ? 1 : 0, it.comment || null]
      );
    }
  }
  broadcast("task:created", { taskId });
  return res.json({ ok: true, id: taskId });
}

async function getMyTasks(req, res) {
  const userId = req.user.id;
  const [tasks] = await pool.query(
    `SELECT id, user_id, title, created_at FROM tasks WHERE user_id=? ORDER BY id DESC`,
    [userId]
  );
  const taskIds = tasks.map((t) => t.id);
  let items = [];
  if (taskIds.length) {
    const [rows] = await pool.query(
      `SELECT id, task_id, text, done, comment
       FROM task_items
       WHERE task_id IN (${taskIds.map(() => "?").join(",")})`,
      taskIds
    );
    items = rows;
  }
  const map = {};
  tasks.forEach((t) => (map[t.id] = { ...t, items: [] }));
  items.forEach((it) =>
    map[it.task_id]?.items.push({
      id: it.id,
      text: it.text,
      done: !!it.done,
      comment: it.comment,
    })
  );
  res.json({ tasks: Object.values(map) });
}

// POST /tasks  (alternate)
async function createTask(req, res) {
  const { userId, title, items } = req.body;
  req.params.userId = userId;
  return createTaskForUser(req, res);
}

async function updateTask(req, res) {
  const { taskId } = req.params;
  const { title, userId } = req.body;
  const updates = [];
  const params = [];

  if (title) {
    updates.push("title=?");
    params.push(title);
  }
  if (typeof userId !== "undefined") {
    updates.push("user_id=?");
    params.push(userId);
  }
  if (updates.length) {
    params.push(taskId);
    await pool.query(
      `UPDATE tasks SET ${updates.join(", ")} WHERE id=?`,
      params
    );
  }
  broadcast("task:updated", { taskId });
  res.json({ ok: true });
}

async function deleteTask(req, res) {
  const { taskId } = req.params;
  await pool.query(`DELETE FROM tasks WHERE id=?`, [taskId]);
  broadcast("task:deleted", { taskId });
  res.json({ ok: true });
}

async function canEditItem(reqUser, itemId) {
  // لو مفيش auth middleware بيملا req.user، لازم تتأكد منه
  if (!reqUser) return false;
  if (reqUser.role === "admin") return true;

  const [rows] = await pool.query(
    `SELECT t.user_id
     FROM task_items i
     JOIN tasks t ON t.id = i.task_id
     WHERE i.id = ?`,
    [itemId]
  );
  if (rows.length === 0) return false;
  return String(rows[0].user_id) === String(reqUser.id);
}

async function updateTaskItem(req, res) {
  const { itemId } = req.params;
  const { text, done, comment } = req.body;

  if (!(await canEditItem(req.user, itemId))) {
    return res.status(403).json({ message: "Forbidden: owner or admin only" });
  }

  const fields = [];
  const params = [];
  if (typeof text !== "undefined") {
    fields.push("text=?");
    params.push(text);
  }
  if (typeof done !== "undefined") {
    fields.push("done=?");
    params.push(done ? 1 : 0);
  }
  if (typeof comment !== "undefined") {
    fields.push("comment=?");
    params.push(comment);
  }

  if (fields.length === 0) return res.json({ ok: true });

  params.push(itemId);
  await pool.query(
    `UPDATE task_items SET ${fields.join(", ")} WHERE id=?`,
    params
  );
  broadcast("task:item-updated", { itemId });
  res.json({ ok: true });
}

async function deleteTaskItem(req, res) {
  const { itemId } = req.params;

  if (!(await canEditItem(req.user, itemId))) {
    return res.status(403).json({ message: "Forbidden: owner or admin only" });
  }

  await pool.query(`DELETE FROM task_items WHERE id=?`, [itemId]);
  broadcast("task:item-deleted", { itemId });
  res.json({ ok: true });
}

module.exports = {
  getTasks,
  createTaskForUser,
  createTask,
  updateTask,
  deleteTask,
  getMyTasks,
  updateTaskItem,
  deleteTaskItem,
};
