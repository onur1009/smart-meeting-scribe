import express from 'express';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// Get mock upcoming events for Outlook and Google Calendar
router.get('/events', (req, res) => {
  const today = new Date();
  
  const formatDate = (daysOffset) => {
    const d = new Date(today);
    d.setDate(today.getDate() + daysOffset);
    return d.toISOString().split('T')[0];
  };

  const mockEvents = [
    {
      id: 'gcal_1',
      source: 'Google Calendar',
      title: 'TubeScribe Yeni Versiyon Planlaması',
      date: formatDate(0), // Today
      time: '14:30',
      location: 'Google Meet (meet.google.com/abc-defg-hij)',
      participants: ['onur@tubescribe.com', 'can@tubescribe.com', 'elif@tubescribe.com']
    },
    {
      id: 'outlook_1',
      source: 'Outlook Calendar',
      title: 'Haftalık Proje Değerlendirme ve Tasarım Senkronizasyonu',
      date: formatDate(1), // Tomorrow
      time: '10:00',
      location: 'Microsoft Teams Linki',
      participants: ['onur@tubescribe.com', 'zeynep@partnerfirma.com', 'hakan@tubescribe.com', 'merve@tasarimci.com']
    },
    {
      id: 'gcal_2',
      source: 'Google Calendar',
      title: 'Müşteri Geri Bildirim ve Onay Toplantısı',
      date: formatDate(2),
      time: '16:00',
      location: 'Zoom Oda 4',
      participants: ['onur@tubescribe.com', 'client.ahmet@musteri.com']
    },
    {
      id: 'outlook_2',
      source: 'Outlook Calendar',
      title: 'Bütçe Planlama & Yatırımcı Sunumu Provası',
      date: formatDate(3),
      time: '11:00',
      location: 'Merkez Ofis - Toplantı Odası A',
      participants: ['onur@tubescribe.com', 'selin@tubescribe.com', 'bora@investor.com']
    }
  ];

  res.json(mockEvents);
});

export default router;
