import express from 'express';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware - only authenticated users can get the Deepgram key
router.use(authMiddleware);

// GET /api/deepgram/token - Securely provide Deepgram API key to authenticated clients
router.get('/token', (req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Deepgram API anahtarı sunucu ortam değişkenlerinde bulunamadı. Lütfen yönetici ile iletişime geçin.' 
    });
  }

  res.json({ apiKey });
});

export default router;
