// controllers/usersController.js
const { pool } = require("../config/db");
const { hashPassword } = require("../utils/password");
const { broadcast } = require("../realtime/sse");

async function listUsers(req, res) {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, created_at FROM users ORDER BY id DESC`
  );
  res.json(rows);
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { name, email, password /* role (مرفوض هنا) */ } = req.body;

  // لا نسمح بتغيير role من هنا إطلاقًا (خليه عبر setAdmin بس)
  if (typeof req.body.role !== "undefined") {
    return res
      .status(400)
      .json({ message: "Role cannot be updated here. Use /users/:id/admin." });
  }

  const fields = [];
  const params = [];

  if (name) {
    fields.push("name=?");
    params.push(name);
  }
  if (email) {
    fields.push("email=?");
    params.push(email);
  }
  if (password) {
    fields.push("password_hash=?");
    params.push(await hashPassword(password));
  }

  if (fields.length === 0) {
    return res.json({ ok: true });
  }

  params.push(id);
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id=?`, params);

  broadcast("user:updated", { userId: Number(id) });
  res.json({ ok: true });
}

async function setAdmin(req, res) {
  const { id } = req.params;
  const { role } = req.body; // { role: 'admin' | 'user' }

  if (!role) return res.status(400).json({ message: "role required" });

  // تقدر تحتفظ بقواعد إضافية هنا لو عايز تمنع تنزيل صلاحيات آخر أدمن مثلًا
  await pool.query(`UPDATE users SET role=? WHERE id=?`, [role, id]);
  if (role === "user") {
    const [admins] = await pool.query(
      `SELECT COUNT(*) AS c FROM users WHERE role='admin'`
    );
    if (admins[0].c <= 1) {
      return res.status(403).json({ message: "Cannot demote the last admin" });
    }
  }
  broadcast("user:role", { userId: Number(id), role });
  res.json({ ok: true });
}

async function deleteUser(req, res) {
  const { id } = req.params;

  // 1) هات بيانات المستخدم المستهدف
  const [rows] = await pool.query(`SELECT id, role FROM users WHERE id=?`, [
    id,
  ]);
  if (rows.length === 0)
    return res.status(404).json({ message: "User not found" });

  // 2) امنع حذف أي أدمن تمامًا
  if (rows[0].role === "admin") {
    return res
      .status(403)
      .json({ message: "Deleting admin accounts is not allowed" });
  }

  await pool.query(`DELETE FROM users WHERE id=?`, [id]);
  broadcast("user:deleted", { userId: Number(id) });
  res.json({ ok: true });
}

module.exports = { listUsers, updateUser, setAdmin, deleteUser };
