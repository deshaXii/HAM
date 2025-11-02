const { pool } = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/password");
const { signToken } = require("../utils/jwt");

async function signup(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "name, email, password required" });

  const [exists] = await pool.query(`SELECT id FROM users WHERE email=?`, [
    email,
  ]);
  if (exists.length > 0)
    return res.status(409).json({ message: "Email already exists" });

  const password_hash = await hashPassword(password);
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES (?,?,?)`,
    [name, email, password_hash]
  );
  const user = { id: result.insertId, name, email, role: "user" };
  const token = signToken(user);
  return res.json({ token, user });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "email, password required" });

  const [rows] = await pool.query(
    `SELECT id, name, email, password_hash, role FROM users WHERE email=?`,
    [email]
  );
  if (rows.length === 0)
    return res.status(401).json({ message: "Invalid credentials" });

  const user = rows[0];
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

async function me(req, res) {
  const { id } = req.user;
  const [rows] = await pool.query(
    `SELECT id, name, email, role FROM users WHERE id=?`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  res.json(rows[0]);
}

module.exports = { signup, login, me };
