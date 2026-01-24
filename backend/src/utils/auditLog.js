// backend/src/utils/auditLog.js
const { pool } = require("../config/db");

function safeJson(x) {
  try {
    if (x === undefined) return null;
    return JSON.stringify(x);
  } catch {
    return JSON.stringify({ _unserializable: true });
  }
}

async function insertAudit(conn, row) {
  const c = conn || pool;
  await c.query(
    `INSERT INTO audit_log
      (actor_user_id, actor_email, actor_role, action, entity_type, entity_id,
       before_json, after_json, request_id, ip, user_agent)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.actor_user_id ?? null,
      row.actor_email ?? null,
      row.actor_role ?? null,
      row.action,
      row.entity_type,
      row.entity_id ?? null,
      safeJson(row.before) ,
      safeJson(row.after),
      row.request_id ?? null,
      row.ip ?? null,
      row.user_agent ?? null,
    ]
  );
}

async function audit(conn, req, { action, entity_type, entity_id, before, after }) {
  const actor = req?.user || {};
  const requestId =
    req?.headers?.["x-request-id"] ||
    req?.headers?.["x-correlation-id"] ||
    null;

  return insertAudit(conn, {
    actor_user_id: actor.id ?? actor.userId ?? null,
    actor_email: actor.email ?? null,
    actor_role: actor.role ?? null,
    action,
    entity_type,
    entity_id,
    before,
    after,
    request_id: requestId,
    ip: req?.ip || null,
    user_agent: req?.headers?.["user-agent"] || null,
  });
}

module.exports = { audit };
