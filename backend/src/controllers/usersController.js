const { pool } = require("../config/db");
const { hashPassword } = require("../utils/password");

async function listUsers(req, res) {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, created_at FROM users ORDER BY id DESC`
  );
  res.json(rows);
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { name, email, password, role } = req.body;

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
  if (role) {
    fields.push("role=?");
    params.push(role);
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
  broadcast("user:updated", { userId });
  res.json({ ok: true });
}

async function setAdmin(req, res) {
  const { id } = req.params;
  const { role } = req.body; // {role:'admin'|'user'}
  if (!role) return res.status(400).json({ message: "role required" });
  await pool.query(`UPDATE users SET role=? WHERE id=?`, [role, id]);
  broadcast("user:role", { userId, role });
  res.json({ ok: true });
}

async function deleteUser(req, res) {
  const { id } = req.params;
  await pool.query(`DELETE FROM users WHERE id=?`, [id]);
  broadcast("user:deleted", { userId });
  res.json({ ok: true });
}

module.exports = { listUsers, updateUser, setAdmin, deleteUser };
