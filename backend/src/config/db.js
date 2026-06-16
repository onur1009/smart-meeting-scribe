import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPostgres = !!process.env.DATABASE_URL;
let db;

// Helper to convert "?" placeholders in query to "$1, $2, ..." for PostgreSQL
function convertSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

if (isPostgres) {
  console.log('Connecting to PostgreSQL database using DATABASE_URL...');
  
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Vercel/Render/Supabase/Neon Postgres
  });

  // Wrapper object that emulates the sqlite3 API
  db = {
    serialize(fn) {
      fn();
    },
    run(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const convertedSql = convertSql(sql);
      pool.query(convertedSql, params)
        .then((res) => {
          if (callback) {
            // Mock context this
            const ctx = { changes: res.rowCount, lastID: null };
            callback.call(ctx, null);
          }
        })
        .catch((err) => {
          if (callback) callback(err);
        });
    },
    get(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const convertedSql = convertSql(sql);
      pool.query(convertedSql, params)
        .then((res) => {
          if (callback) callback(null, res.rows[0]);
        })
        .catch((err) => {
          if (callback) callback(err);
        });
    },
    all(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const convertedSql = convertSql(sql);
      pool.query(convertedSql, params)
        .then((res) => {
          if (callback) callback(null, res.rows);
        })
        .catch((err) => {
          if (callback) callback(err);
        });
    }
  };

  // Initialize Postgres tables
  initializePostgresTables(pool);

} else {
  console.log('Connecting to SQLite local database...');
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../database.sqlite');
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to the SQLite database at:', dbPath);
      initializeSQLiteTables();
    }
  });
}

function initializeSQLiteTables() {
  db.serialize(() => {
    // Create Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      // Gracefully run ALTER TABLE in case role column was missing in an existing DB file
      db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => {
        // Ignore if column already exists
        seedAdminUser();
      });
    });

    // Create Meetings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT,
        time TEXT,
        location TEXT,
        participants TEXT, -- JSON string of arrays
        transcript TEXT, -- JSON string of arrays
        summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  });
}

async function initializePostgresTables(pool) {
  try {
    // Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Alter table to add role if not exists
    try {
      await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'");
    } catch (e) {
      // Column already exists, ignore
    }

    // Meetings Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        date VARCHAR(50),
        time VARCHAR(50),
        location VARCHAR(255),
        participants TEXT,
        transcript TEXT,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Seed Admin
    seedAdminUser();
    console.log('PostgreSQL database initialized successfully');
  } catch (err) {
    console.error('Error initializing PostgreSQL tables:', err);
  }
}

function seedAdminUser() {
  const adminEmail = 'admin@scribe.com';
  db.get('SELECT id FROM users WHERE email = ?', [adminEmail], async (err, row) => {
    if (err) {
      console.error('Error checking admin user:', err);
      return;
    }
    if (!row) {
      try {
        const passwordHash = await bcrypt.hash('admin123', 10);
        const adminId = randomUUID();
        db.run(
          "INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'admin')",
          [adminId, adminEmail, passwordHash, 'System Administrator'],
          (err) => {
            if (err) {
              console.error('Failed to seed admin user:', err);
            } else {
              console.log('Successfully seeded default admin account (admin@scribe.com / admin123)');
            }
          }
        );
      } catch (e) {
        console.error('Error seeding admin user:', e);
      }
    }
  });
}

export default db;
