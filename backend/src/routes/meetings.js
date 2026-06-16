import express from 'express';
import db from '../config/db.js';
import authMiddleware from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// Apply auth middleware to all routes in this router
router.use(authMiddleware);

// Get all meetings for user (with search filtering)
router.get('/', (req, res) => {
  const userId = req.user.id;
  const { q } = req.query;

  let query = 'SELECT id, title, date, time, location, participants, created_at FROM meetings WHERE user_id = ? ORDER BY created_at DESC';
  let params = [userId];

  if (q) {
    // If query string 'q' is provided, we search in title, location, participants, and transcript
    query = `
      SELECT id, title, date, time, location, participants, created_at 
      FROM meetings 
      WHERE user_id = ? 
      AND (
        title LIKE ? 
        OR location LIKE ? 
        OR participants LIKE ? 
        OR transcript LIKE ?
      )
      ORDER BY created_at DESC
    `;
    const searchPattern = `%${q}%`;
    params = [userId, searchPattern, searchPattern, searchPattern, searchPattern];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve meetings' });
    }

    // Parse participants JSON strings back to arrays
    const meetings = rows.map(row => {
      try {
        row.participants = JSON.parse(row.participants || '[]');
      } catch (e) {
        row.participants = [];
      }
      return row;
    });

    res.json(meetings);
  });
});

// Get detailed meeting transcript and summary by ID
router.get('/:id', (req, res) => {
  const userId = req.user.id;
  const meetingId = req.params.id;

  db.get('SELECT * FROM meetings WHERE id = ? AND user_id = ?', [meetingId, userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    try {
      row.participants = JSON.parse(row.participants || '[]');
      row.transcript = JSON.parse(row.transcript || '[]');
    } catch (e) {
      row.participants = [];
      row.transcript = [];
    }

    res.json(row);
  });
});

// Save new meeting / update existing meeting
router.post('/', (req, res) => {
  const userId = req.user.id;
  const { id, title, date, time, location, participants, transcript, summary } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Meeting title is required' });
  }

  const participantsStr = JSON.stringify(participants || []);
  const transcriptStr = JSON.stringify(transcript || []);
  const meetingId = id || randomUUID();

  // If ID is provided, check if it exists to do an upsert
  db.get('SELECT id FROM meetings WHERE id = ? AND user_id = ?', [meetingId, userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (row) {
      // Update existing
      db.run(
        `UPDATE meetings 
         SET title = ?, date = ?, time = ?, location = ?, participants = ?, transcript = ?, summary = ?
         WHERE id = ? AND user_id = ?`,
        [title, date, time, location, participantsStr, transcriptStr, summary, meetingId, userId],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to update meeting' });
          }
          res.json({ success: true, id: meetingId });
        }
      );
    } else {
      // Create new
      db.run(
        `INSERT INTO meetings (id, user_id, title, date, time, location, participants, transcript, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [meetingId, userId, title, date, time, location, participantsStr, transcriptStr, summary],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to save meeting' });
          }
          res.status(201).json({ success: true, id: meetingId });
        }
      );
    }
  });
});

// Delete meeting
router.delete('/:id', (req, res) => {
  const userId = req.user.id;
  const meetingId = req.params.id;

  db.run('DELETE FROM meetings WHERE id = ? AND user_id = ?', [meetingId, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json({ success: true, message: 'Meeting deleted' });
  });
});

export default router;
