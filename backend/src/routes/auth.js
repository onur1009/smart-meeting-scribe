import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  // Check if email already exists
  db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (row) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = randomUUID();

      db.run(
        "INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'user')",
        [userId, email.toLowerCase(), passwordHash, name],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Error registering user' });
          }

          const token = jwt.sign(
            { id: userId, email: email.toLowerCase(), role: 'user' },
            process.env.JWT_SECRET || 'super_secret_smart_meeting_scribe_jwt_key_2026',
            { expiresIn: '30d' }
          );

          res.status(201).json({
            token,
            user: { id: userId, email: email.toLowerCase(), name, role: 'user' }
          });
        }
      );
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'super_secret_smart_meeting_scribe_jwt_key_2026',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  });
});

export default router;
