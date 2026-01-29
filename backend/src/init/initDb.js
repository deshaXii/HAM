// backend/src/init/initDb.js
const { pool } = require("../config/db");
const { hashPassword } = require("../utils/password");

/**
 * الهدف من الملف ده:
 * 1) يضمن Schema الأساسي للمشروع (users / notices / tasks / task_items) اللي الـ UI لسه محتاجه.
 * 2) يضمن الجداول الـ normalized الجديدة (drivers/jobs/...) بدون أي reliance على planner_state.
 * 3) يعمل “Self-heal” لاختلافات قديمة (users.username أو notices.message... إلخ).
 *
 * NOTE:
 * - تم إزالة planner_state نهائيًا (legacy blob) لأننا انتقلنا للـ normalized resources.
 * - تم إزالة migratePlannerState بالكامل (لم نعد نحتاج أي migration عند الإقلاع).
 */

async function getColumnSet(table) {
  const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set((cols || []).map((c) => c.Field));
}

async function tryQuery(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    // بنسيب التطبيق يشتغل حتى لو ALTER/INDEX فشل بسبب اختلافات موجودة في DB
    console.warn("initDb warning:", e.code || e.message);
    return null;
  }
}

async function ensureUsersSchema() {
  // الشكل “الرسمي” للمشروع (email-based)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL
    ) ENGINE=InnoDB;
  `);

  // Self-heal لو الجدول اتعمل قبل كده بنسخة username-based
  const cols = await getColumnSet("users");

  if (!cols.has("name")) {
    await tryQuery(`ALTER TABLE users ADD COLUMN name VARCHAR(100) NULL`);
  }

  if (!cols.has("email")) {
    await tryQuery(`ALTER TABLE users ADD COLUMN email VARCHAR(150) NULL`);
    await tryQuery(`CREATE UNIQUE INDEX idx_users_email ON users(email)`);
  }

  if (!cols.has("password_hash") && cols.has("password")) {
    await tryQuery(
      `ALTER TABLE users CHANGE COLUMN password password_hash VARCHAR(255) NOT NULL`
    );
  }

  if (!cols.has("role")) {
    await tryQuery(
      `ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`
    );
  } else {
    await tryQuery(
      `ALTER TABLE users MODIFY COLUMN role ENUM('user','admin','viewer') NOT NULL DEFAULT 'user'`
    );
    await tryQuery(`UPDATE users SET role='user' WHERE role='viewer'`);
  }

  
  // Soft delete support
  const cols3 = await getColumnSet("users");
  if (!cols3.has("deleted_at")) {
    await tryQuery(`ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL`);
    await tryQuery(`CREATE INDEX idx_users_deleted_at ON users(deleted_at)`);
  }

// لو عندنا username ومفيش email/name، نملأهم
  const cols2 = await getColumnSet("users");
  if (cols2.has("username")) {
    await tryQuery(
      `
      UPDATE users
      SET
        email = CASE
          WHEN (email IS NULL OR email = '') THEN CONCAT(username,'@fleet.local')
          ELSE email
        END,
        name = CASE
          WHEN (name IS NULL OR name = '') THEN username
          ELSE name
        END
      `
    );
  }

  // تأكد إن admin@fleet.local موجود
  const [admins] = await pool.query(
    `SELECT id FROM users WHERE email = 'admin@fleet.local'`
  );
  if (!admins || admins.length === 0) {
    const pass = await hashPassword("admin123");
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`,
      ["Super Admin", "admin@fleet.local", pass, "admin"]
    );
    console.log("Created default admin: admin@fleet.local / admin123");
  }
}

async function ensureLegacyTables() {
  // notices (legacy) — schema المتوقع في noticeController
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id INT PRIMARY KEY,
      content TEXT,
      updated_by INT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // Self-heal لو اتعملت بنسخة pinned/message
  const ncols = await getColumnSet("notices");
  if (!ncols.has("content") && ncols.has("message")) {
    await tryQuery(`ALTER TABLE notices CHANGE COLUMN message content TEXT`);
  }
  if (!ncols.has("updated_by")) {
    await tryQuery(`ALTER TABLE notices ADD COLUMN updated_by INT NULL`);
  }
  if (!ncols.has("updated_at") && ncols.has("created_at")) {
    await tryQuery(
      `ALTER TABLE notices CHANGE COLUMN created_at updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );
  }

  // tasks / task_items (legacy) — schema المتوقع في tasksController
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      title VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      text VARCHAR(255),
      done TINYINT(1) DEFAULT 0,
      comment TEXT,
      deleted_at DATETIME NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Self-heal لو اتعملت بنسخة assigned_to/status...
  const tcols = await getColumnSet("tasks");
  if (!tcols.has("user_id") && tcols.has("assigned_to")) {
    await tryQuery(`ALTER TABLE tasks ADD COLUMN user_id INT NULL`);
    await tryQuery(
      `UPDATE tasks SET user_id = assigned_to WHERE user_id IS NULL`
    );
  }
  if (!tcols.has("created_at") && tcols.has("updated_at")) {
    await tryQuery(
      `ALTER TABLE tasks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    );
  }

  const itCols = await getColumnSet("task_items");
  if (!itCols.has("comment")) {
    await tryQuery(`ALTER TABLE task_items ADD COLUMN comment TEXT NULL`);
  }
  // Soft delete support for legacy tasks tables
  const tcols2 = await getColumnSet("tasks");
  if (!tcols2.has("deleted_at")) {
    await tryQuery(`ALTER TABLE tasks ADD COLUMN deleted_at DATETIME NULL`);
    await tryQuery(`CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at)`);
  }

  const itCols2 = await getColumnSet("task_items");
  if (!itCols2.has("deleted_at")) {
    await tryQuery(`ALTER TABLE task_items ADD COLUMN deleted_at DATETIME NULL`);
    await tryQuery(`CREATE INDEX idx_task_items_deleted_at ON task_items(deleted_at)`);
  }


}

async function ensureNormalizedPlannerTables() {
  // ---------- normalized planner tables ----------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_meta (
      id INT PRIMARY KEY,
      week_start DATE NULL,
      version INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_settings (
      id INT PRIMARY KEY,
      rates_json LONGTEXT,
      trailer_day_cost_json LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agenda_items (
      id VARCHAR(64) PRIMARY KEY,
      day DATE NOT NULL,
      start_time VARCHAR(10) NOT NULL,
      end_time VARCHAR(10) NOT NULL,
      type ENUM('normal','emergency') DEFAULT 'normal',
      title VARCHAR(200) NOT NULL,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_agenda_day (day)
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(60),
      photo_url VARCHAR(500),
      can_night TINYINT(1) DEFAULT 1,
      sleeps_in_cab TINYINT(1) DEFAULT 0,
      double_manned_eligible TINYINT(1) DEFAULT 1,
      rating DECIMAL(3,1) NOT NULL DEFAULT 0,
      week_availability_json TEXT,
      leaves_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // Self-heal: add rating column if older DB
  const dcols2 = await getColumnSet("drivers");
  if (!dcols2.has("rating")) {
    await tryQuery(`ALTER TABLE drivers ADD COLUMN rating DECIMAL(3,1) NOT NULL DEFAULT 0`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tractors (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(80) NOT NULL,
      plate VARCHAR(80),
      current_location VARCHAR(200),
      double_manned TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tractor_types (
      tractor_id VARCHAR(64) NOT NULL,
      type_value VARCHAR(80) NOT NULL,
      PRIMARY KEY (tractor_id, type_value),
      FOREIGN KEY (tractor_id) REFERENCES tractors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trailers (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(80) NOT NULL,
      plate VARCHAR(80),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trailer_types (
      trailer_id VARCHAR(64) NOT NULL,
      type_value VARCHAR(80) NOT NULL,
      PRIMARY KEY (trailer_id, type_value),
      FOREIGN KEY (trailer_id) REFERENCES trailers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(200) NOT NULL UNIQUE,
      lat DOUBLE NULL,
      lng DOUBLE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS distances (
      from_name VARCHAR(200) NOT NULL,
      to_name VARCHAR(200) NOT NULL,
      km INT NOT NULL DEFAULT 0,
      PRIMARY KEY (from_name, to_name),
      deleted_at DATETIME NULL
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id VARCHAR(64) PRIMARY KEY,
      date DATE NOT NULL,
      start VARCHAR(10),
      end_date DATE NULL,
      end_time VARCHAR(10) NULL,
      code VARCHAR(80) NULL,
      color VARCHAR(20) NULL,
      slot INT DEFAULT 0,
      client VARCHAR(200),
      pickup VARCHAR(200),
      dropoff VARCHAR(200),
      duration_hours DECIMAL(5,2) DEFAULT 0,
      pricing_type ENUM('fixed','per_km') DEFAULT 'per_km',
      pricing_value DECIMAL(10,2) DEFAULT 0,
      tractor_id VARCHAR(64) NULL,
      trailer_id VARCHAR(64) NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_jobs_date (date),
      FOREIGN KEY (tractor_id) REFERENCES tractors(id) ON DELETE SET NULL,
      FOREIGN KEY (trailer_id) REFERENCES trailers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);

  // Extra optional job fields used by the Job modal (route + financials)
  // We ALTER here so existing DBs self-heal without requiring manual migrations.
  const jobCols = await getColumnSet("jobs");
  if (!jobCols.has("start_point")) {
    await tryQuery(`ALTER TABLE jobs ADD COLUMN start_point VARCHAR(200) NULL`);
  }
  if (!jobCols.has("end_point")) {
    await tryQuery(`ALTER TABLE jobs ADD COLUMN end_point VARCHAR(200) NULL`);
  }
  if (!jobCols.has("allow_start_override")) {
    await tryQuery(
      `ALTER TABLE jobs ADD COLUMN allow_start_override TINYINT(1) NOT NULL DEFAULT 0`
    );
  }
  if (!jobCols.has("revenue_trip")) {
    await tryQuery(
      `ALTER TABLE jobs ADD COLUMN revenue_trip DECIMAL(10,2) NOT NULL DEFAULT 0`
    );
  }
  if (!jobCols.has("cost_driver")) {
    await tryQuery(
      `ALTER TABLE jobs ADD COLUMN cost_driver DECIMAL(10,2) NOT NULL DEFAULT 0`
    );
  }
  if (!jobCols.has("cost_truck")) {
    await tryQuery(
      `ALTER TABLE jobs ADD COLUMN cost_truck DECIMAL(10,2) NOT NULL DEFAULT 0`
    );
  }
  if (!jobCols.has("cost_diesel")) {
    await tryQuery(
      `ALTER TABLE jobs ADD COLUMN cost_diesel DECIMAL(10,2) NOT NULL DEFAULT 0`
    );
  }

// Extra optional scheduling & display fields (end date/time + admin code + card color)
if (!jobCols.has("end_date")) {
  await tryQuery(`ALTER TABLE jobs ADD COLUMN end_date DATE NULL`);
}
if (!jobCols.has("end_time")) {
  await tryQuery(`ALTER TABLE jobs ADD COLUMN end_time VARCHAR(10) NULL`);
}
if (!jobCols.has("code")) {
  await tryQuery(`ALTER TABLE jobs ADD COLUMN code VARCHAR(80) NULL`);
}
if (!jobCols.has("color")) {
  await tryQuery(`ALTER TABLE jobs ADD COLUMN color VARCHAR(20) NULL`);
}


  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_drivers (
      job_id VARCHAR(64) NOT NULL,
      driver_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (job_id, driver_id),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // Seed meta/settings row
  await pool.query(
    `INSERT INTO planner_meta (id, week_start, version)
     VALUES (1, NULL, 1)
     ON DUPLICATE KEY UPDATE id = id`
  );

  await pool.query(
    `INSERT INTO planner_settings (id, rates_json, trailer_day_cost_json)
     VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      JSON.stringify({
        emptyKmCost: 0.25,
        tractorKmCostLoaded: 0.3,
        driverHourCost: 22.5,
        nightPremiumPct: 25,
      }),
      JSON.stringify({
        reefer: 35,
        box: 20,
        taut: 18,
        chassis: 15,
      }),
    ]
  );


  // ===== Safety: soft-delete columns (prevent irreversible data loss) =====
  // We NEVER hard-delete planner resources. Instead we set deleted_at.
  // This makes accidental deletion recoverable even before backups.
  const softDeleteTables = ["drivers","tractors","trailers","locations","jobs","agenda_items",'users','tasks','task_items','distances'];
  for (const tbl of softDeleteTables) {
    const cols = await getColumnSet(tbl);
    if (!cols.has("deleted_at")) {
      await tryQuery(`ALTER TABLE \`${tbl}\` ADD COLUMN deleted_at DATETIME NULL`, []);
      await tryQuery(`CREATE INDEX idx_${tbl}_deleted_at ON \`${tbl}\` (deleted_at)`, []);
    }
  }

}

async function ensureAuditLog() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      actor_user_id INT NULL,
      actor_email VARCHAR(150) NULL,
      actor_role VARCHAR(30) NULL,
      action VARCHAR(30) NOT NULL,
      entity_type VARCHAR(60) NOT NULL,
      entity_id VARCHAR(128) NULL,
      before_json JSON NULL,
      after_json JSON NULL,
      request_id VARCHAR(80) NULL,
      ip VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_entity (entity_type, entity_id),
      INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB;
  `);
}

async function seedLegacyRowsIfMissing() {
  // Seed notices row 1 (legacy)
  const [nrows] = await pool.query(`SELECT id FROM notices WHERE id = 1`);
  if (!nrows || nrows.length === 0) {
    await pool.query(
      `INSERT INTO notices (id, content, updated_by) VALUES (1, 'Welcome! No notices yet.', NULL)`
    );
  }
}

async function ensureInit() {
  // 1) users (and self-heal)
  await ensureUsersSchema();

  // 2) legacy tables still used by UI (NOTICES + TASKS only)
  await ensureLegacyTables();

  // 3) normalized planner tables
  await ensureNormalizedPlannerTables();

  // 3.1) audit log table
  await ensureAuditLog();

  // 4) seed legacy essentials (NOTICES only)
  await seedLegacyRowsIfMissing();

  // No planner_state, no migration
}

module.exports = { ensureInit };
