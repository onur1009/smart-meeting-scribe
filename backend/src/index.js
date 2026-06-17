import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import meetingRoutes from './routes/meetings.js';
import calendarRoutes from './routes/calendar.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import deepgramRoutes from './routes/deepgram.js';
import db from './config/db.js'; // Ensure database is initialized

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, '../public');

// Enable CORS for frontend client
app.use(cors({
  origin: '*', // For development flexibility
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increase body size limit for long meeting transcripts
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/deepgram', deepgramRoutes);

// Serve static assets from built frontend
app.use(express.static(publicPath));

// SPA Route handling
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) {
      // If public folder doesn't exist yet (in local dev), return health or 404
      res.status(404).send('Not found');
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke on the server!' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Meeting Scribe backend running on http://localhost:${PORT}`);
});
