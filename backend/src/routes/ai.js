import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware
router.use(authMiddleware);

router.post('/summarize', async (req, res) => {
  const { title, transcript } = req.body;

  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return res.status(400).json({ error: 'Transcript array is required and cannot be empty' });
  }

  // Format the transcript for Gemini
  const formattedTranscript = transcript
    .map(item => `[${item.speaker || 'Unknown'}]: ${item.text}`)
    .join('\n');

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not defined in the backend environment. Returning a mock summary for development.');
    
    // Generate a high-quality mock summary if API key is missing, so user flow doesn't break
    const mockSummary = `### 📝 Toplantı Özeti: ${title || 'Akıllı Toplantı'}
    
Bu özet, **GEMINI_API_KEY** bulunamadığı için sistem tarafından geliştirici modunda otomatik olarak üretilmiştir.

#### 👥 Katılımcılar ve Katkılar
${Array.from(new Set(transcript.map(item => item.speaker))).map(sp => `- **${sp}**: Görüşmelere aktif katılım sağladı ve fikirlerini belirtti.`).join('\n')}

#### 📌 Konuşulan Temel Konular
- Toplantı genelinde gündem maddeleri ve yürütülen çalışmalar tartışıldı.
- Katılımcılar kendi sorumluluk alanlarındaki ilerlemeleri paylaştı.

#### 🎯 Alınan Kararlar
- Gündem maddelerindeki hedeflerin planlandığı şekilde devam etmesine karar verildi.
- Süreçlerin takibi için haftalık senkronizasyonların yapılması kararlaştırıldı.

#### ⚡ Aksiyon Planı / Sonraki Adımlar
- **Tüm Katılımcılar**: Kendi paylaştıkları maddelerle ilgili ilerleme raporu hazırlayacak.
- **Yönetici**: Bir sonraki takip toplantısı tarihini netleştirecek.`;

    return res.json({ summary: mockSummary, isMock: true });
  }

  try {
    // Initialize Google Gen AI SDK
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `Aşağıdaki toplantı deşifresini incele ve profesyonel, Türkçe bir toplantı özeti çıkar. 
Formatın Markdown yapısında olmalı ve şu bölümleri içermelidir:
1. **Toplantı Özeti**: Toplantının ana konusunu açıklayan kısa bir paragraf.
2. **Konuşulan Temel Konular**: Toplantıda öne çıkan başlıklar (madde işaretli).
3. **Alınan Kararlar**: Kararlaştırılan önemli konular (madde işaretli).
4. **Aksiyon Planı / Sonraki Adımlar**: Kimin neyi, ne zamana kadar yapacağına dair görev dağılımı (eğer konuşmada geçiyorsa ismen belirt, geçmiyorsa genel görev olarak yaz).

Toplantı Başlığı: ${title || 'Belirtilmedi'}

Deşifre Metni:
${formattedTranscript}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    res.json({ summary, isMock: false });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Yapay zeka özeti oluşturulurken bir hata oluştu: ' + error.message });
  }
});

export default router;
