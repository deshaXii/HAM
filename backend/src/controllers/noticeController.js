const { pool } = require("../config/db");

async function getNotice(req, res) {
  const [rows] = await pool.query(
    `SELECT content, updated_at, updated_by FROM notices WHERE id = 1`
  );
  if (rows.length === 0) return res.json({ content: "" });
  return res.json(rows[0]);
}

async function updateNotice(req, res) {
  const { content } = req.body;
  await pool.query(
    `UPDATE notices SET content=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
    [content || "", req.user.id]
  );
  broadcast("notice:updated", { updatedAt: new Date().toISOString() });
  return res.json({ ok: true });
}

module.exports = { getNotice, updateNotice };
