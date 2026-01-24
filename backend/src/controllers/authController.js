const { pool } = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/password");
const { signToken } = require("../utils/jwt");

async function signup(req, res) {
  // تفعيل/تعطيل التسجيل من ENV
  const allow =
    String(process.env.ALLOW_SIGNUP || "false").toLowerCase() === "true";
  if (!allow) {
    return res.status(403).json({ message: "Registration is disabled" });
  }

  const { name, email, password, inviteCode } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "name, email, password required" });
  }

  // التحقق من كود الدعوة
  const expectedInvite = (process.env.INVITE_CODE || "").trim();
  if (expectedInvite && String(inviteCode || "").trim() !== expectedInvite) {
    // بنرجّع 403 عشان واضح إنها سياسة منع، مش فورمات ناقص
    return res.status(403).json({ message: "Invalid invite code" });
  }

  // فحص البريد
  const [exists] = await pool.query(`SELECT id, deleted_at FROM users WHERE email=?`, [
    email,
  ]);

  if (exists.length > 0) {
    // لو الحساب كان معمول Soft Delete قبل كده، نرجّعه بدل ما نفشل بسبب unique email
    if (exists[0].deleted_at) {
      const password_hash_restore = await hashPassword(password);
      await pool.query(
        `UPDATE users SET name=?, password_hash=?, role='user', deleted_at=NULL WHERE id=?`,
        [name, password_hash_restore, exists[0].id]
      );
      const user = {
        id: exists[0].id,
        name,
        email,
        role: 'user',
      };
      const token = signToken(user);
      return res.json({ token, user });
    }
    return res.status(409).json({ message: "Email already exists" });
  }

  // (اختياري) أول مستخدم = أدمن
  const [countRows] = await pool.query(`SELECT COUNT(*) AS c FROM users`);
  const isFirstUser = countRows[0]?.c === 0;

  const password_hash = await hashPassword(password);
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`,
    [name, email, password_hash, isFirstUser ? "admin" : "user"]
  );

  const user = {
    id: result.insertId,
    name,
    email,
    role: isFirstUser ? "admin" : "user",
  };
  const token = signToken(user);
  return res.json({ token, user });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "email, password required" });

  const [rows] = await pool.query(
    `SELECT id, name, email, password_hash, role FROM users WHERE email=? AND deleted_at IS NULL`,
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
    `SELECT id, name, email, role FROM users WHERE id=? AND deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ message: "Not found" });
  res.json(rows[0]);
}

module.exports = { signup, login, me };
