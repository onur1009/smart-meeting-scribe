import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database at:', dbPath);
    initializeTables();
  }
});

function initializeTables() {
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
          'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
          [adminId, adminEmail, passwordHash, 'System Administrator', 'admin'],
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
