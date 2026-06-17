import express from 'express';
import db from '../config/db.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(authMiddleware);

// Admin validation check
const adminCheck = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Erişim engellendi. Bu işlem için yönetici yetkisi gereklidir.' });
  }
  next();
};

router.use(adminCheck);

// GET /api/admin/users - List all users
router.get('/users', (req, res) => {
  db.all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Kullanıcılar listelenirken bir hata oluştu.' });
    }
    res.json(rows);
  });
});

// PUT /api/admin/users/:id/role - Update a user's role (grant/revoke admin status)
router.put('/users/:id/role', (req, res) => {
  const targetUserId = req.params.id;
  const { role } = req.body;

  if (role !== 'user' && role !== 'admin') {
    return res.status(400).json({ error: 'Geçersiz rol tanımı. Rol sadece "user" veya "admin" olabilir.' });
  }

  // Prevent admin from removing their own admin status to avoid locking themselves out
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'Kendi yöneticilik yetkinizi kaldıramazsınız.' });
  }

  db.run('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Kullanıcı rolü güncellenemedi.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
    res.json({ success: true, message: 'Kullanıcı rolü başarıyla güncellendi.' });
  });
});

// GET /api/admin/meetings - List all meetings across the system
router.get('/meetings', (req, res) => {
  const query = `
    SELECT meetings.id, meetings.title, meetings.date, meetings.time, meetings.location, meetings.created_at,
           users.email AS creator_email, users.name AS creator_name
    FROM meetings
    JOIN users ON meetings.user_id = users.id
    ORDER BY meetings.created_at DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Tüm toplantılar çekilirken hata oluştu.' });
    }
    res.json(rows);
  });
});

// DELETE /api/admin/meetings/:id - Moderate/delete any meeting in the system
router.delete('/meetings/:id', (req, res) => {
  const meetingId = req.params.id;

  db.run('DELETE FROM meetings WHERE id = ?', [meetingId], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Toplantı silinirken veritabanı hatası oluştu.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Silinecek toplantı bulunamadı.' });
    }
    res.json({ success: true, message: 'Toplantı başarıyla sistemden silindi.' });
  });
});

// GET /api/admin/meetings/:id - Inspect any meeting details (admin can view any user's meeting)
router.get('/meetings/:id', (req, res) => {
  const meetingId = req.params.id;

  const query = `
    SELECT meetings.*, users.email AS creator_email, users.name AS creator_name
    FROM meetings
    JOIN users ON meetings.user_id = users.id
    WHERE meetings.id = ?
  `;

  db.get(query, [meetingId], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Toplantı detayları alınırken hata oluştu.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Toplantı bulunamadı.' });
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

export default router;
