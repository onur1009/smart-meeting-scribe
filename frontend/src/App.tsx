import { useState, useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Users, Search, LogOut, Calendar, Download, Plus, 
  ChevronLeft, Trash2, Play, Square, Save, Brain, Clock, MapPin, 
  UserCheck, AlertCircle, FileText, ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

const API_BASE = 'http://localhost:5000/api';
const DEEPGRAM_API_KEY = '05d2e929a2417549a8ad9703a8221a8e1cdadb16';

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  created_at?: string;
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  participants: string[];
  transcript: TranscriptSegment[];
  summary: string | null;
  created_at?: string;
  isOnlineMode?: boolean;
}

interface CalendarEvent {
  id: string;
  source: string;
  title: string;
  date: string;
  time: string;
  location: string;
  participants: string[];
}

export default function App() {
  // Auth State
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<User | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Dashboard State
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingIds, setSelectedMeetingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Create Meeting Form State
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMeetingTime, setNewMeetingTime] = useState('10:00');
  const [newMeetingLocation, setNewMeetingLocation] = useState('');
  const [newMeetingParticipant, setNewMeetingParticipant] = useState('');
  const [newMeetingParticipants, setNewMeetingParticipants] = useState<string[]>([]);
  const [isOnlineMeetingMode, setIsOnlineMeetingMode] = useState(false);
  
  // App Navigation State
  const [view, setView] = useState<'dashboard' | 'meeting' | 'detail' | 'admin'>('dashboard');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // Admin Data State
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminMeetings, setAdminMeetings] = useState<any[]>([]);
  const [adminTab, setAdminTab] = useState<'users' | 'meetings'>('users');
  const [viewingFromAdmin, setViewingFromAdmin] = useState(false);

  // Meeting Room Recording State
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({}); // e.g. {"Speaker 0": "Ahmet"}
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);

  // References for Media/Sockets
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Fetch past meetings and calendar events when logged in
  useEffect(() => {
    if (token) {
      fetchMeetings();
      fetchCalendarEvents();
    }
  }, [token, searchQuery]);

  // Scroll to bottom of transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  // Audio Visualizer logic
  useEffect(() => {
    if (isRecording && !isPaused && visualizerCanvasRef.current && analyserRef.current) {
      const canvas = visualizerCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const analyser = analyserRef.current;
      
      if (!ctx) return;
      
      analyser.fftSize = 64;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const draw = () => {
        if (!isRecording || isPaused) return;
        
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = '#131a2c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] / 2;
          
          // Gradient colors
          const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
          grad.addColorStop(0, '#6366f1');
          grad.addColorStop(1, '#8b5cf6');
          
          ctx.fillStyle = grad;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          
          x += barWidth;
        }
      };
      
      draw();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Timer interval
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording, isPaused]);

  const formatDuration = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs > 0 ? hrs.toString().padStart(2, '0') : null,
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].filter(Boolean).join(':');
  };

  const fetchMeetings = async () => {
    try {
      const url = searchQuery ? `${API_BASE}/meetings?q=${encodeURIComponent(searchQuery)}` : `${API_BASE}/meetings`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
        setSelectedMeetingIds([]); // Clear selection when data changes
      }
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    }
  };

  const fetchCalendarEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/calendar/events`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin users:', err);
    }
  };

  const fetchAdminMeetings = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/meetings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminMeetings(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin meetings:', err);
    }
  };

  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    if (userId === currentUser?.id) {
      alert('Kendi yöneticilik yetkinizi kaldıramazsınız!');
      return;
    }
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setAdminUsers(prev => 
          prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
        );
      } else {
        const data = await res.json();
        alert(data.error || 'Rol güncellenemedi.');
      }
    } catch (err) {
      alert('Bağlantı hatası.');
    }
  };

  const handleDeleteMeetingAdmin = async (meetingId: string) => {
    if (!window.confirm('Bu toplantı kaydını sistemden kalıcı olarak silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setAdminMeetings(prev => prev.filter(m => m.id !== meetingId));
        fetchMeetings(); // Refresh personal list too
      } else {
        alert('Toplantı silinemedi.');
      }
    } catch (err) {
      alert('Bağlantı hatası.');
    }
  };

  const handleInspectMeeting = async (meetingId: string) => {
    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const meeting = await res.json();
        setSelectedMeeting(meeting);
        setView('detail');
        setViewingFromAdmin(true);
      } else {
        alert('Toplantı detayları yüklenemedi.');
      }
    } catch (err) {
      alert('Bağlantı hatası.');
    }
  };

  // Auth Operations
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    const payload = authMode === 'login' 
      ? { email: authEmail, password: authPassword }
      : { email: authEmail, password: authPassword, name: authName };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setAuthError(data.error || 'İşlem başarısız oldu');
        return;
      }
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setCurrentUser(data.user);
      
      // Clean form fields
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
    } catch (err) {
      setAuthError('Sunucu bağlantı hatası oluştu');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
    setSelectedMeetingIds([]);
    setView('dashboard');
  };

  // Select a synced calendar event to prefill form
  const handleSelectCalendarEvent = (event: CalendarEvent) => {
    setNewMeetingTitle(event.title);
    setNewMeetingDate(event.date);
    setNewMeetingTime(event.time);
    setNewMeetingLocation(event.location);
    setNewMeetingParticipants(event.participants);
    setShowCreateModal(true);
  };

  const handleAddParticipant = () => {
    const trimmed = newMeetingParticipant.trim();
    if (trimmed && !newMeetingParticipants.includes(trimmed)) {
      setNewMeetingParticipants([...newMeetingParticipants, trimmed]);
      setNewMeetingParticipant('');
    }
  };

  const handleRemoveParticipant = (email: string) => {
    setNewMeetingParticipants(newMeetingParticipants.filter(p => p !== email));
  };

  // Launch a new meeting and enter the meeting room
  const handleStartNewMeeting = () => {
    if (!newMeetingTitle.trim()) {
      alert('Lütfen toplantı başlığını girin.');
      return;
    }

    const meetingData: Meeting = {
      id: crypto.randomUUID(),
      title: newMeetingTitle,
      date: newMeetingDate,
      time: newMeetingTime,
      location: newMeetingLocation,
      participants: newMeetingParticipants,
      transcript: [],
      summary: null,
      isOnlineMode: isOnlineMeetingMode
    };

    setCurrentMeeting(meetingData);
    setTranscript([]);
    setSpeakerMap({});
    setRecordingSeconds(0);
    setMeetingError(null);
    setIsRecording(false);
    setIsPaused(false);
    
    // Close modal and navigate
    setShowCreateModal(false);
    setView('meeting');
    
    // Clear form
    setNewMeetingTitle('');
    setNewMeetingLocation('');
    setNewMeetingParticipants([]);
    setIsOnlineMeetingMode(false);
  };

  // Setup audio stream and Deepgram connection
  const startRecordingFlow = async () => {
    setMeetingError(null);
    try {
      let stream: MediaStream;
      const isOnlineMode = currentMeeting?.isOnlineMode;

      if (isOnlineMode) {
        // Capture Microphone
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        // Capture Screen/System Audio
        let screenStream: MediaStream;
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
          });
        } catch (e) {
          micStream.getTracks().forEach(t => t.stop());
          throw new Error('Ekran paylaşımı başlatılamadı veya iptal edildi.');
        }

        const screenAudioTracks = screenStream.getAudioTracks();
        if (screenAudioTracks.length === 0) {
          micStream.getTracks().forEach(t => t.stop());
          screenStream.getTracks().forEach(t => t.stop());
          throw new Error("Sistem sesini kaydetmek için ekran paylaşım penceresinde 'Sistem sesini paylaş' (Share system audio) onay kutusunu işaretlemelisiniz.");
        }

        // Mix the two audio streams using Web Audio API
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;

        const micSource = audioCtx.createMediaStreamSource(micStream);
        const screenSource = audioCtx.createMediaStreamSource(screenStream);
        
        const destination = audioCtx.createMediaStreamDestination();

        // Connect sources to mixed destination
        micSource.connect(destination);
        screenSource.connect(destination);

        stream = destination.stream;

        // Keep track of hardware streams so we can stop them on stopRecordingFlow
        activeStreamsRef.current = [micStream, screenStream];

        // If user stops sharing screen from Chrome's native bar, stop recording gracefully
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            console.log('Screen sharing ended by user natively.');
            stopRecordingFlow();
          };
        }
      } else {
        // Standard microphone-only mode
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        activeStreamsRef.current = [stream];
      }

      audioStreamRef.current = stream;

      // Audio visualizer setup
      const audioCtx = audioContextRef.current || new AudioContext();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      analyserRef.current = audioCtx.createAnalyser();
      source.connect(analyserRef.current);

      // Connect to Deepgram with Diarization enabled
      const socket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=tr&smart_format=true&interim_results=true&diarize=true`,
        ['token', DEEPGRAM_API_KEY]
      );
      socketRef.current = socket;

      socket.onopen = () => {
        setIsRecording(true);
        setIsPaused(false);
        
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm'
        });

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        mediaRecorderRef.current.start(250);
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const alternatives = received.channel?.alternatives[0];
        const transcriptText = alternatives?.transcript;
        const words = alternatives?.words || [];

        if (transcriptText && received.is_final) {
          if (words.length > 0) {
            // Group words in this final block by their speaker
            const segments: TranscriptSegment[] = [];
            let currentGroup = {
              speaker: `Konuşmacı ${words[0].speaker}`,
              text: words[0].word,
              start: words[0].start
            };

            for (let i = 1; i < words.length; i++) {
              const word = words[i];
              const wordSpeaker = `Konuşmacı ${word.speaker}`;
              
              if (wordSpeaker === currentGroup.speaker) {
                // Attach word, checking for punctuation formatting
                currentGroup.text += (word.word.match(/^[.,!?;:]/) ? '' : ' ') + word.word;
              } else {
                segments.push(currentGroup);
                currentGroup = {
                  speaker: wordSpeaker,
                  text: word.word,
                  start: word.start
                };
              }
            }
            segments.push(currentGroup);

            // Merge these new segments into the active transcript state
            setTranscript(prev => {
              const updated = [...prev];
              segments.forEach(newSeg => {
                if (updated.length > 0 && updated[updated.length - 1].speaker === newSeg.speaker) {
                  // Same speaker continues
                  updated[updated.length - 1].text += ' ' + newSeg.text;
                } else {
                  // New speaker or first segment
                  updated.push(newSeg);
                }
              });
              return updated;
            });
          } else {
            // Fallback for simple transcription without word coordinates
            setTranscript(prev => [
              ...prev,
              { speaker: 'Konuşmacı 0', text: transcriptText, start: received.start }
            ]);
          }
        }
      };

      socket.onerror = () => {
        setMeetingError('Ses analiz sunucusu (Deepgram) ile bağlantı kesildi.');
        stopRecordingFlow();
      };

      socket.onclose = () => {
        console.log('Deepgram socket connection closed.');
      };

    } catch (err: any) {
      setMeetingError(err.message || 'Mikrofona veya sistem sesine erişim sağlanamadı. Lütfen izinlerinizi kontrol edin.');
      stopRecordingFlow();
    }
  };

  const pauseRecordingFlow = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecordingFlow = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecordingFlow = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (activeStreamsRef.current.length > 0) {
      activeStreamsRef.current.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      activeStreamsRef.current = [];
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  };

  // Update a speaker's name in real-time
  const handleRenameSpeaker = (oldName: string, newName: string) => {
    if (!newName.trim()) return;
    
    // Save in speakerMap mapping
    setSpeakerMap(prev => ({ ...prev, [oldName]: newName }));
    
    // Update active transcript list
    setTranscript(prev => 
      prev.map(item => item.speaker === oldName ? { ...item, speaker: newName } : item)
    );
  };

  // Complete meeting, request Gemini AI summary, and save to DB
  const handleFinishAndSaveMeeting = async () => {
    stopRecordingFlow();
    
    if (transcript.length === 0) {
      alert('Kaydedilecek bir deşifre bulunamadı.');
      return;
    }

    setIsSummarizing(true);
    let generatedSummary = '';

    try {
      // 1. Get AI summary from backend
      const sumRes = await fetch(`${API_BASE}/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: currentMeeting?.title,
          transcript: transcript
        })
      });

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        generatedSummary = sumData.summary;
      } else {
        generatedSummary = 'Toplantı özeti yapay zeka tarafından oluşturulamadı.';
      }
    } catch (err) {
      console.error(err);
      generatedSummary = 'Yapay zeka bağlantısı kurulamadı. Özet oluşturma atlandı.';
    } finally {
      setIsSummarizing(false);
    }

    // Save final meeting object to Database
    const finalMeeting: Meeting = {
      ...currentMeeting!,
      transcript: transcript,
      summary: generatedSummary
    };

    try {
      const saveRes = await fetch(`${API_BASE}/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(finalMeeting)
      });

      if (saveRes.ok) {
        // Fire celebration confetti!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        setSelectedMeeting(finalMeeting);
        setView('detail');
        fetchMeetings(); // Refresh meeting list
      } else {
        alert('Toplantı sunucuya kaydedilemedi.');
      }
    } catch (err) {
      alert('Sunucu kaydı sırasında hata oluştu.');
    }
  };

  // Delete meeting operation
  const handleDeleteMeeting = async (meetingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bu toplantı kaydını silmek istediğinize emin misiniz?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setMeetings(meetings.filter(m => m.id !== meetingId));
        setSelectedMeetingIds(prev => prev.filter(id => id !== meetingId));
        if (selectedMeeting?.id === meetingId) {
          setView('dashboard');
          setSelectedMeeting(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSelectMeeting = (meetingId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedMeetingIds(prev => [...prev, meetingId]);
    } else {
      setSelectedMeetingIds(prev => prev.filter(id => id !== meetingId));
    }
  };

  const handleToggleSelectAllMeetings = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedMeetingIds(meetings.map(m => m.id));
    } else {
      setSelectedMeetingIds([]);
    }
  };

  const handleBulkDeleteMeetings = async () => {
    if (selectedMeetingIds.length === 0) return;
    
    const confirmed = window.confirm(`Seçilen ${selectedMeetingIds.length} toplantıyı kalıcı olarak silmek istediğinizden emin misiniz?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/meetings/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedMeetingIds })
      });
      
      if (res.ok) {
        setMeetings(prev => prev.filter(m => !selectedMeetingIds.includes(m.id)));
        setSelectedMeetingIds([]);
      } else {
        const data = await res.json();
        alert(data.error || 'Toplantılar silinirken bir hata oluştu.');
      }
    } catch (err) {
      console.error('Bulk delete failed:', err);
      alert('Sunucu bağlantısı sırasında hata oluştu.');
    }
  };

  // Format timestamp (e.g. 0.2 -> 00:00)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `[${m}:${s}]`;
  };

  // Export fully formatted notes (metadata + summary + transcript) to MS Word
  const handleExportToWord = (meeting: Meeting) => {
    const participantListHtml = meeting.participants.length > 0
      ? meeting.participants.map(p => `<li>${p}</li>`).join('')
      : '<li>Katılımcı belirtilmedi</li>';

    const aiSummaryHtml = meeting.summary 
      ? `<h3>Yapay Zeka Özeti ve Aksiyon Planı</h3><div style="background-color:#f1f5f9; padding:12px; border-radius:6px; border-left:4px solid #6366f1;">${meeting.summary.replace(/\n/g, '<br>')}</div>`
      : '';

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${meeting.title}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; line-height: 1.5; }
        h1 { color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        .meta-box { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; margin-bottom: 20px; }
        .meta-item { font-size: 13px; color: #475569; margin-bottom: 4px; }
        .transcript-line { margin-bottom: 8px; }
        .timestamp { color: #64748b; font-weight: bold; font-family: monospace; }
        .speaker { color: #4f46e5; font-weight: bold; }
      </style>
      </head>
      <body>
        <h1>${meeting.title} - Toplantı Raporu</h1>
        <div class="meta-box">
          <div class="meta-item"><strong>Tarih:</strong> ${meeting.date || '-'}</div>
          <div class="meta-item"><strong>Saat:</strong> ${meeting.time || '-'}</div>
          <div class="meta-item"><strong>Konum:</strong> ${meeting.location || '-'}</div>
          <div class="meta-item"><strong>Katılımcılar:</strong></div>
          <ul style="margin:4px 0 0 20px; font-size:13px;">${participantListHtml}</ul>
        </div>
        ${aiSummaryHtml}
        <h2>Toplantı Deşifresi</h2>
        <div>
          ${meeting.transcript.map(line => `
            <div class="transcript-line">
              <span class="timestamp">${formatTime(line.start)}</span> 
              <span class="speaker">${line.speaker}:</span> 
              <span>${line.text}</span>
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ToplantiNotu_${meeting.title.replace(/\s+/g, '_')}_${meeting.date || 'tarih'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render Login & Registration screen
  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <Brain size={36} />
            <h1>Smart Meeting Scribe</h1>
          </div>
          
          <h2>{authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}</h2>
          <p>Akıllı toplantı deşifre ve not tutma sistemine hoş geldiniz</p>

          <form onSubmit={handleAuth}>
            {authError && (
              <div className="user-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '16px', display: 'flex', width: '100%', borderRadius: '8px' }}>
                <AlertCircle size={16} style={{ marginRight: '6px' }} />
                <span>{authError}</span>
              </div>
            )}

            {authMode === 'register' && (
              <div className="form-group">
                <label>İsim Soyisim</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder="Onur Yıldız" 
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  required 
                />
              </div>
            )}

            <div className="form-group">
              <label>E-posta Adresi</label>
              <input 
                type="email" 
                className="input-control" 
                placeholder="ornek@domain.com" 
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required 
              />
            </div>

            <div className="form-group">
              <label>Şifre</label>
              <input 
                type="password" 
                className="input-control" 
                placeholder="••••••••" 
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required 
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '10px' }}>
              {authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          </form>

          <div style={{ marginTop: '24px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {authMode === 'login' ? (
              <>
                Hesabınız yok mu?{' '}
                <button className="text-btn" onClick={() => { setAuthMode('register'); setAuthError(null); }}>
                  Hesap Oluştur
                </button>
              </>
            ) : (
              <>
                Zaten üye misiniz?{' '}
                <button className="text-btn" onClick={() => { setAuthMode('login'); setAuthError(null); }}>
                  Giriş Yapın
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dashboard View
  if (view === 'dashboard') {
    return (
      <div className="dashboard-layout">
        <header className="navbar">
          <div className="nav-brand">
            <Brain size={28} />
            <h1>Smart Meeting Scribe</h1>
          </div>
          <div className="nav-user">
            {currentUser?.role === 'admin' && (
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '13px' }}
                onClick={() => {
                  setView('admin');
                  setViewingFromAdmin(true);
                  fetchAdminUsers();
                  fetchAdminMeetings();
                }}
              >
                Yönetici Paneli
              </button>
            )}
            <div className="user-badge">
              <UserCheck size={14} />
              <span>{currentUser?.name} ({currentUser?.role})</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          <div className="dashboard-hero">
            <div>
              <h2>Toplantılarınızı Akıllandırın</h2>
              <p>Gerçek zamanlı konuşmacı analizi ve yapay zeka özetleriyle hiçbir kararı gözden kaçırmayın.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              Toplantı Başlat
            </button>
          </div>

          {/* Calendar Integration Widget */}
          <div className="calendar-section">
            <div className="section-title">
              <Calendar size={20} className="text-primary" />
              <h3>Senkronize Takvim Etkinlikleri (Google & Outlook)</h3>
            </div>
            <div className="calendar-grid">
              {calendarEvents.map((event) => (
                <div key={event.id} className="calendar-card">
                  <div className={`event-source ${event.source.toLowerCase().includes('google') ? 'google' : 'outlook'}`}>
                    {event.source}
                  </div>
                  <h4 className="event-title">{event.title}</h4>
                  
                  <div className="event-info">
                    <Calendar size={14} />
                    <span>{event.date} - {event.time}</span>
                  </div>
                  <div className="event-info">
                    <MapPin size={14} />
                    <span>{event.location}</span>
                  </div>

                  <div className="event-participants">
                    <Users size={12} />
                    <span>{event.participants.length} Katılımcı</span>
                  </div>

                  <div className="event-actions">
                    <button className="btn btn-secondary btn-full" style={{ padding: '8px 12px', fontSize: '13px' }} onClick={() => handleSelectCalendarEvent(event)}>
                      Not Tutmayı Başlat <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Past Meetings List */}
          <div style={{ marginTop: '50px' }}>
            <div className="section-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} />
                <h3>Geçmiş Toplantı Notlarınız</h3>
              </div>
              
              {/* Search Bar */}
              <div className="search-bar-container" style={{ marginBottom: 0 }}>
                <Search size={16} />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Başlık, katılımcı veya notlarda ara..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {meetings.length > 0 && (
              <div className="bulk-actions-bar">
                <label className="meeting-checkbox-label">
                  <input 
                    type="checkbox" 
                    className="meeting-checkbox"
                    checked={meetings.length > 0 && selectedMeetingIds.length === meetings.length}
                    onChange={handleToggleSelectAllMeetings}
                  />
                  <span>Tümünü Seç ({meetings.length})</span>
                </label>
                
                {selectedMeetingIds.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {selectedMeetingIds.length} toplantı seçildi
                    </span>
                    <button 
                      className="btn btn-danger" 
                      onClick={handleBulkDeleteMeetings}
                      style={{ padding: '6px 12px', fontSize: '13px', boxShadow: 'none' }}
                    >
                      <Trash2 size={14} /> Seçilenleri Sil
                    </button>
                  </div>
                )}
              </div>
            )}

            {meetings.length === 0 ? (
              <div className="calendar-card" style={{ padding: '40px', textAlign: 'center', alignItems: 'center' }}>
                <FileText size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                <h4 style={{ color: 'var(--text-secondary)' }}>Arama sonucuyla eşleşen veya kaydedilmiş toplantı bulunamadı.</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>Yeni bir toplantı başlatarak ilk kaydınızı oluşturabilirsiniz.</p>
              </div>
            ) : (
              <div className="meetings-grid">
                {meetings.map((meeting) => (
                  <div 
                    key={meeting.id} 
                    className={`meeting-card ${selectedMeetingIds.includes(meeting.id) ? 'selected' : ''}`}
                    onClick={() => { setSelectedMeeting(meeting); setView('detail'); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="meeting-card-header">
                      <input 
                        type="checkbox" 
                        className="meeting-checkbox"
                        checked={selectedMeetingIds.includes(meeting.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleToggleSelectMeeting(meeting.id, e)}
                      />
                      <div className="meeting-meta" style={{ marginBottom: 0, gap: '12px', display: 'flex' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          <span>{meeting.date}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          <span>{meeting.time}</span>
                        </div>
                      </div>
                    </div>

                    <h3>{meeting.title}</h3>

                    <div className="meeting-details">
                      <div className="meeting-detail-item">
                        <MapPin size={14} />
                        <span>{meeting.location || 'Konum Belirtilmedi'}</span>
                      </div>
                      <div className="meeting-detail-item">
                        <Users size={14} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                          {meeting.participants.join(', ') || 'Katılımcı Belirtilmedi'}
                        </span>
                      </div>
                    </div>

                    <div className="meeting-card-footer">
                      <button className="text-btn" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); handleExportToWord(meeting); }}>
                        <Download size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Word İndir
                      </button>
                      <button className="logout-btn" onClick={(e) => handleDeleteMeeting(meeting.id, e)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Create Meeting Overlay Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Yeni Toplantı Yapılandır</div>
              
              <div className="form-group">
                <label>Toplantı Dosya Adı / Başlığı</label>
                <input 
                  type="text" 
                  className="input-control" 
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder="Haftalık Değerlendirme"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Tarih</label>
                  <input 
                    type="date" 
                    className="input-control" 
                    value={newMeetingDate}
                    onChange={(e) => setNewMeetingDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Saat</label>
                  <input 
                    type="time" 
                    className="input-control" 
                    value={newMeetingTime}
                    onChange={(e) => setNewMeetingTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Konum / Link</label>
                <input 
                  type="text" 
                  className="input-control" 
                  value={newMeetingLocation}
                  onChange={(e) => setNewMeetingLocation(e.target.value)}
                  placeholder="Microsoft Teams, Ofis A, vb."
                />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '20px' }}>
                <input 
                  type="checkbox" 
                  id="online-meeting-mode"
                  className="meeting-checkbox"
                  checked={isOnlineMeetingMode}
                  onChange={(e) => setIsOnlineMeetingMode(e.target.checked)}
                />
                <label htmlFor="online-meeting-mode" style={{ margin: 0, textTransform: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)' }}>
                  🌐 Online Toplantı Modu (Zoom, Meet, Teams Sesini Kaydet)
                </label>
              </div>

              <div className="form-group">
                <label>Katılımcı Ekle</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="email" 
                    className="input-control" 
                    value={newMeetingParticipant}
                    onChange={(e) => setNewMeetingParticipant(e.target.value)}
                    placeholder="katilimci@domain.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
                  />
                  <button type="button" className="btn btn-secondary" onClick={handleAddParticipant}>Ekle</button>
                </div>
                {newMeetingParticipants.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {newMeetingParticipants.map(email => (
                      <span key={email} className="user-badge" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {email}
                        <button type="button" onClick={() => handleRemoveParticipant(email)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '30px', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>İptal</button>
                <button className="btn btn-primary" onClick={handleStartNewMeeting}>Not Odasına Gir</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Meeting Room View
  if (view === 'meeting' && currentMeeting) {
    return (
      <div className="meeting-room">
        {/* Main Recorder Section */}
        <div className="recording-area">
          <div className="meeting-room-header">
            <div className="room-details">
              <h2>{currentMeeting.title}</h2>
              <p>Toplantı Başlatıldı • Canlı Ses İşleniyor</p>
            </div>
            
            <div className={`status-badge ${isRecording && !isPaused ? 'active' : ''}`}>
              <Mic size={14} />
              <span>
                {isRecording ? (isPaused ? 'Duraklatıldı' : 'Ses Kaydediliyor') : 'Kayıt Bekliyor'}
              </span>
            </div>
          </div>

          {/* Transcript Panel displaying speakers */}
          <div className="transcript-panel">
            {meetingError && (
              <div className="user-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%', borderRadius: '8px', padding: '12px' }}>
                <AlertCircle size={18} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                <span>{meetingError}</span>
              </div>
            )}
            
            {transcript.length === 0 && !meetingError && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
                <Mic size={48} style={{ marginBottom: '16px', animation: isRecording && !isPaused ? 'pulse 1.5s infinite' : 'none' }} />
                <p>{isRecording ? 'Konuşmalar dinleniyor, ilk veri bekleniyor...' : 'Kayıt butonuna basarak dinlemeyi başlatın.'}</p>
              </div>
            )}

            {transcript.map((line, idx) => (
              <div key={idx} className="dialogue-bubble">
                <div className="speaker-header">
                  <div className="speaker-name">
                    <Users size={12} />
                    <input 
                      type="text" 
                      value={speakerMap[line.speaker] || line.speaker} 
                      onChange={(e) => handleRenameSpeaker(line.speaker, e.target.value)}
                      placeholder="Konuşmacı İsmi"
                    />
                  </div>
                  <span className="dialogue-time">{formatTime(line.start)}</span>
                </div>
                <div className="dialogue-text">{line.text}</div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>

          {/* Active control center */}
          <div className="room-controls">
            <div className="session-timer">
              <Clock size={16} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--text-secondary)' }} />
              {formatDuration(recordingSeconds)}
            </div>

            {/* Audio Wave Visualizer */}
            {isRecording && !isPaused && (
              <canvas ref={visualizerCanvasRef} width="120" height="30" style={{ borderRadius: '6px', opacity: 0.8 }} />
            )}

            <div className="control-buttons">
              {!isRecording ? (
                <button className="btn btn-primary" onClick={startRecordingFlow}>
                  <Play size={16} /> Kaydı Başlat
                </button>
              ) : (
                <>
                  {isPaused ? (
                    <button className="btn btn-secondary" onClick={resumeRecordingFlow}>
                      <Play size={16} /> Devam Et
                    </button>
                  ) : (
                    <button className="btn btn-secondary" onClick={pauseRecordingFlow}>
                      <MicOff size={16} /> Duraklat
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={stopRecordingFlow}>
                    <Square size={16} /> Kaydı Durdur
                  </button>
                </>
              )}
            </div>
            
            <button 
              className="btn btn-primary" 
              style={{ background: 'var(--accent-gradient)' }}
              onClick={handleFinishAndSaveMeeting}
              disabled={isSummarizing || transcript.length === 0}
            >
              <Save size={16} /> {isSummarizing ? 'Özetleniyor...' : 'Tamamla & Kaydet'}
            </button>
          </div>
        </div>

        {/* Sidebar Widget Area */}
        <div className="room-sidebar">
          <div className="sidebar-widget">
            <h3 className="widget-title">
              <Calendar size={16} className="text-primary" /> Toplantı Detayları
            </h3>
            <div className="meeting-detail-item" style={{ marginBottom: '10px' }}>
              <strong>Tarih:</strong> {currentMeeting.date}
            </div>
            <div className="meeting-detail-item" style={{ marginBottom: '10px' }}>
              <strong>Saat:</strong> {currentMeeting.time}
            </div>
            <div className="meeting-detail-item">
              <strong>Konum:</strong> {currentMeeting.location || 'Girilmedi'}
            </div>
          </div>

          <div className="sidebar-widget">
            <h3 className="widget-title">
              <Users size={16} className="text-primary" /> Katılımcılar ({currentMeeting.participants.length})
            </h3>
            <div className="participant-list">
              {currentMeeting.participants.length === 0 ? (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Belirtilmedi</span>
              ) : (
                currentMeeting.participants.map(email => (
                  <div key={email} className="participant-item">
                    <UserCheck size={12} className="text-success" />
                    <span>{email}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <button className="btn btn-secondary" onClick={() => { stopRecordingFlow(); setView('dashboard'); }}>
            <ChevronLeft size={16} /> Panoya Dön (Kaydetmeden Çık)
          </button>
        </div>
      </div>
    );
  }

  // Detailed Past Meeting View
  if (view === 'detail' && selectedMeeting) {
    return (
      <div className="detail-view">
        <div className="back-header">
          <button className="btn btn-secondary" onClick={() => { 
            if (viewingFromAdmin) {
              setView('admin');
            } else {
              setView('dashboard');
            }
            setSelectedMeeting(null); 
          }}>
            <ChevronLeft size={16} /> {viewingFromAdmin ? 'Yönetici Paneline Dön' : 'Panoya Geri Dön'}
          </button>
        </div>

        <div className="dashboard-hero" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '24px', marginBottom: '24px' }}>
          <div>
            <div className="meeting-meta" style={{ justifyContent: 'flex-start', gap: '20px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14} />
                <span>{selectedMeeting.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={14} />
                <span>{selectedMeeting.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={14} />
                <span>{selectedMeeting.location || 'Konum Belirtilmedi'}</span>
              </div>
            </div>
            <h2>{selectedMeeting.title}</h2>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" onClick={() => handleExportToWord(selectedMeeting)}>
              <Download size={16} /> Word Raporu Al
            </button>
            <button className="btn btn-secondary" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={(e) => handleDeleteMeeting(selectedMeeting.id, e)}>
              <Trash2 size={16} /> Sil
            </button>
          </div>
        </div>

        {/* Detailed Grid (Transcript on left, AI Summary on right) */}
        <div className="detail-grid">
          {/* Transcript Panel */}
          <div>
            <div className="section-title">
              <FileText size={18} />
              <h3>Deşifre Metni ({selectedMeeting.transcript.length} Paragraf)</h3>
            </div>
            
            <div className="transcript-panel" style={{ height: '550px', background: 'var(--bg-glass)' }}>
              {selectedMeeting.transcript.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Bu toplantı için kaydedilmiş deşifre kaydı yok.</p>
              ) : (
                selectedMeeting.transcript.map((line, idx) => (
                  <div key={idx} className="dialogue-bubble">
                    <div className="speaker-header">
                      <span className="speaker-name">
                        <Users size={12} /> {line.speaker}
                      </span>
                      <span className="dialogue-time">{formatTime(line.start)}</span>
                    </div>
                    <div className="dialogue-text">{line.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Summary and Metadata Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div className="section-title">
                <Brain size={18} className="text-primary" />
                <h3>Yapay Zeka Toplantı Analizi</h3>
              </div>

              <div className="summary-card" style={{ height: '400px', overflowY: 'auto' }}>
                {selectedMeeting.summary ? (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {/* Render raw/formatted text. Since Gemini gives markdown, we style spacing nicely */}
                    {selectedMeeting.summary}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>Özet bulunamadı.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="sidebar-widget">
              <h3 className="widget-title">
                <Users size={16} className="text-primary" /> Katılımcı Listesi
              </h3>
              <div className="participant-list">
                {selectedMeeting.participants.length === 0 ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Katılımcı eklenmemiş</span>
                ) : (
                  selectedMeeting.participants.map(email => (
                    <div key={email} className="participant-item">
                      <UserCheck size={12} className="text-success" />
                      <span>{email}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin Panel View
  if (view === 'admin' && currentUser?.role === 'admin') {
    return (
      <div className="dashboard-layout">
        <header className="navbar">
          <div className="nav-brand">
            <Brain size={28} />
            <h1>Smart Meeting Scribe - Yönetici Paneli</h1>
          </div>
          <div className="nav-user">
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={() => {
                setView('dashboard');
                setViewingFromAdmin(false);
              }}
            >
              Kişisel Panoya Git
            </button>
            <div className="user-badge">
              <UserCheck size={14} />
              <span>{currentUser?.name} (Admin)</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          <div style={{ display: 'flex', gap: '16px', marginBottom: '30px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
            <button 
              className={`btn ${adminTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminTab('users')}
            >
              Kullanıcı Yönetimi ({adminUsers.length})
            </button>
            <button 
              className={`btn ${adminTab === 'meetings' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminTab('meetings')}
            >
              Tüm Toplantılar ({adminMeetings.length})
            </button>
          </div>

          {adminTab === 'users' ? (
            <div className="calendar-card" style={{ padding: '24px', width: '100%', overflowX: 'auto', background: 'var(--bg-glass)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px' }}>İsim</th>
                    <th style={{ padding: '12px' }}>E-posta</th>
                    <th style={{ padding: '12px' }}>Rol</th>
                    <th style={{ padding: '12px' }}>Kayıt Tarihi</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map(user => (
                    <tr key={user.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{user.name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{user.email}</td>
                      <td style={{ padding: '12px' }}>
                        <span className="user-badge" style={{ 
                          backgroundColor: user.role === 'admin' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                          color: user.role === 'admin' ? '#8b5cf6' : 'var(--text-secondary)',
                          border: 'none',
                          fontSize: '11px',
                          textTransform: 'uppercase'
                        }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => handleToggleUserRole(user.id, user.role || 'user')}
                          disabled={user.id === currentUser?.id}
                        >
                          {user.role === 'admin' ? 'Adminlik Kaldır' : 'Admin Yap'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="calendar-card" style={{ padding: '24px', width: '100%', overflowX: 'auto', background: 'var(--bg-glass)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px' }}>Toplantı Başlığı</th>
                    <th style={{ padding: '12px' }}>Oluşturan</th>
                    <th style={{ padding: '12px' }}>Tarih / Saat</th>
                    <th style={{ padding: '12px' }}>Konum</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMeetings.map(meeting => (
                    <tr key={meeting.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{meeting.title}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontSize: '13px' }}>{meeting.creator_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{meeting.creator_email}</div>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                        {meeting.date} {meeting.time}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{meeting.location || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => handleInspectMeeting(meeting.id)}
                        >
                          İncele
                        </button>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--danger)' }}
                          onClick={() => handleDeleteMeetingAdmin(meeting.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    );
  }

  return null;
}
