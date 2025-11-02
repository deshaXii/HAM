const { pool } = require("../config/db");
const { hashPassword } = require("../utils/password");

async function ensureInit() {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // planner_state
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_state (
      id INT PRIMARY KEY,
      data LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // notices
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id INT PRIMARY KEY,
      content TEXT,
      updated_by INT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // tasks
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      title VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);

  // task_items
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      text VARCHAR(255),
      done TINYINT(1) DEFAULT 0,
      comment TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // seed: planner_state row 1
  const [rows] = await pool.query(`SELECT id FROM planner_state WHERE id = 1`);
  if (rows.length === 0) {
    const defaultState = {
      jobs: [],
      drivers: [],
      tractors: [],
      trailers: [],
      locations: [],
      distanceKm: {},
      settings: {
        rates: {
          emptyKmCost: 0.25,
          tractorKmCostLoaded: 0.3,
          driverHourCost: 22.5,
          nightPremiumPct: 25,
        },
        trailerDayCost: {
          reefer: 35,
          box: 20,
          taut: 18,
          chassis: 15,
        },
      },
      weekStart: null,
    };
    await pool.query(`INSERT INTO planner_state (id, data) VALUES (1, ?)`, [
      JSON.stringify(defaultState),
    ]);
  }

  // seed: notices
  const [nrows] = await pool.query(`SELECT id FROM notices WHERE id = 1`);
  if (nrows.length === 0) {
    await pool.query(
      `INSERT INTO notices (id, content, updated_by) VALUES (1, 'Welcome! No notices yet.', NULL)`
    );
  }

  // seed: admin user
  const [admins] = await pool.query(
    `SELECT id FROM users WHERE email = 'admin@fleet.local'`
  );
  if (admins.length === 0) {
    const pass = await hashPassword("admin123");
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`,
      ["Super Admin", "admin@fleet.local", pass, "admin"]
    );
    console.log("Created default admin: admin@fleet.local / admin123");
  }
}

module.exports = { ensureInit };
