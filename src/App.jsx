import { useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { analyzeImage } from './services/aiService';
import './App.css';

const MONITOR_INTERVAL = 10000;
const ALERT_COOLDOWN = 2 * 60 * 1000;
const DEFAULT_SESSION_MINUTES = 25;

const MODES = {
  focus: {
    name: 'Focus',
    description: 'Balanced monitoring with gentle audio reminders.',
    accent: 'blue',
    minutes: 25,
    checks: true,
  },
  study: {
    name: 'Study',
    description: 'Deep-work mode with stronger intervention and full-screen enforcement.',
    accent: 'violet',
    minutes: 50,
    checks: true,
  },
  calm: {
    name: 'Calm',
    description: 'Low-pressure mode for reading, planning, and light work.',
    accent: 'green',
    minutes: 15,
    checks: false,
  },
};

function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ergoai-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedResult, setCapturedResult] = useState(null);
  const [capturedAnalyzing, setCapturedAnalyzing] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const [monitoring, setMonitoring] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState('Waiting');
  const [lastAnalysisTime, setLastAnalysisTime] = useState(null);
  const [nextAnalysisAt, setNextAnalysisAt] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ergoai-history') || '[]');
    } catch {
      return [];
    }
  });
  const [activeAlert, setActiveAlert] = useState(null);
  const [aiStatus, setAiStatus] = useState('checking');
  const [aiTesting, setAiTesting] = useState(false);

  // Features
  const [mode, setMode] = useState(() => localStorage.getItem('ergoai-mode') || 'focus');
  const [sessionMinutes, setSessionMinutes] = useState(() =>
    Number(localStorage.getItem('ergoai-session-minutes')) || DEFAULT_SESSION_MINUTES
  );
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [completedSessions, setCompletedSessions] = useState(() =>
    Number(localStorage.getItem('ergoai-completed-sessions')) || 0
  );
  const [focusPoints, setFocusPoints] = useState(() =>
    Number(localStorage.getItem('ergoai-focus-points')) || 0
  );
  const [tiredLevel, setTiredLevel] = useState(0);
  const [selfEnergy, setSelfEnergy] = useState(() =>
    Number(localStorage.getItem('ergoai-energy')) || 70
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('ergoai-sound') !== 'false'
  );
  const [soundVolume, setSoundVolume] = useState(
    () => Number(localStorage.getItem('ergoai-volume')) || 0.45
  );
  const [fullscreenStudy, setFullscreenStudy] = useState(false);
  const [sessionLog, setSessionLog] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ergoai-session-log') || '[]');
    } catch {
      return [];
    }
  });

  const webcamRef = useRef(null);
  const monitoringIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const sessionIntervalRef = useRef(null);
  const analysisInProgressRef = useRef(false);
  const monitoringRef = useRef(false);
  const aiTestControllerRef = useRef(null);
  const audioContextRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const sessionStartedRef = useRef(null);

  const alertCooldownsRef = useRef({
    slouching: 0,
    eyesClosed: 0,
    distracted: 0,
    tired: 0,
    combined: 0,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ergoai-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ergoai-history', JSON.stringify(analysisHistory.slice(0, 40)));
  }, [analysisHistory]);

  useEffect(() => {
    localStorage.setItem('ergoai-mode', mode);
    localStorage.setItem('ergoai-session-minutes', String(sessionMinutes));
  }, [mode, sessionMinutes]);

  useEffect(() => {
    localStorage.setItem('ergoai-completed-sessions', String(completedSessions));
    localStorage.setItem('ergoai-focus-points', String(focusPoints));
  }, [completedSessions, focusPoints]);

  useEffect(() => {
    localStorage.setItem('ergoai-energy', String(selfEnergy));
    localStorage.setItem('ergoai-sound', String(soundEnabled));
    localStorage.setItem('ergoai-volume', String(soundVolume));
  }, [selfEnergy, soundEnabled, soundVolume]);

  useEffect(() => {
    localStorage.setItem('ergoai-session-log', JSON.stringify(sessionLog.slice(0, 30)));
  }, [sessionLog]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
    sessionStartedRef.current = sessionStartedAt;
  }, [sessionActive, sessionStartedAt]);

  useEffect(() => {
    loadCameras();
    return () => {
      clearAllTimers();
      if (aiTestControllerRef.current) aiTestControllerRef.current.abort();
      const video = webcamRef.current?.video;
      const stream = video?.srcObject;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  const currentMode = MODES[mode] || MODES.focus;

  const clearAllTimers = () => {
    if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    monitoringIntervalRef.current = null;
    countdownIntervalRef.current = null;
    sessionIntervalRef.current = null;
  };

  const loadCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Camera device enumeration is not supported by this browser.');
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setCameras(videoDevices);

      if (!selectedCameraId && videoDevices.length) {
        const preferred =
          videoDevices.find((device) =>
            ['integrated', 'built-in', 'internal', 'laptop', 'hd camera', 'webcam']
              .some((name) => device.label.toLowerCase().includes(name))
          ) || videoDevices[0];
        setSelectedCameraId(preferred.deviceId);
      }
    } catch (err) {
      console.error(err);
      setError('Could not list your cameras. Check browser camera permissions.');
    }
  };

  const handleStartCamera = async () => {
    setError(null);
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
      await loadCameras();
      setCameraStarting(true);
      setCameraRunning(false);
    } catch (err) {
      console.error(err);
      setCameraStarting(false);
      setCameraRunning(false);
      setError('Camera access was denied or unavailable. Allow camera permission and try again.');
    }
  };

  const handleCameraReady = () => {
    setCameraStarting(false);
    setCameraRunning(true);
    setError(null);
  };

  const handleCameraError = (cameraError) => {
    console.error(cameraError);
    setCameraStarting(false);
    setCameraRunning(false);
    setError('The selected camera could not be opened. Try another camera.');
    if (monitoringRef.current) stopMonitoring();
  };

  const handleStopCamera = () => {
    const video = webcamRef.current?.video;
    const stream = video?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    setCameraStarting(false);
    setCameraRunning(false);
    if (monitoringRef.current) stopMonitoring();
  };

  const handleCameraChange = (event) => {
    const newCameraId = event.target.value;
    if (cameraRunning || cameraStarting) {
      const video = webcamRef.current?.video;
      const stream = video?.srcObject;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
      setCameraRunning(false);
      setCameraStarting(false);
    }
    setSelectedCameraId(newCameraId);
    setError(null);
  };

  const captureCurrentFrame = () => webcamRef.current?.getScreenshot() || null;

  const addAnalysisToHistory = (data, timestamp = new Date()) => {
    const entry = {
      timestamp,
      person_visible: data?.person_visible,
      sitting: data?.sitting,
      slouching: data?.slouching,
      head_position: data?.head_position,
      eyes: data?.eyes,
      description: data?.description,
    };
    setAnalysisHistory((previous) => [entry, ...previous].slice(0, 40));
  };

  const resetAlertCooldowns = () => {
    alertCooldownsRef.current = {
      slouching: 0,
      eyesClosed: 0,
      distracted: 0,
      tired: 0,
      combined: 0,
    };
  };

  const ensureAudio = async () => {
    if (!soundEnabled) return null;
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  };

  const playReminderSound = async (kind = 'gentle') => {
    const ctx = await ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = kind === 'tired' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(kind === 'focus' ? 660 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'tired' ? 380 : 440, now + 0.32);
    gain.gain.setValueAtTime(Math.max(0.01, soundVolume * 0.18), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.58);
  };

  const showSmartAlert = async (data) => {
    if (!monitoringRef.current || !data) return;

    const slouching = data.slouching === true;
    const eyesClosed = data.eyes === 'closed';
    const noPerson = data.person_visible === false;

    let level = 0;
    if (slouching) level += 35;
    if (eyesClosed) level += 45;
    if (noPerson) level += 35;
    if (String(data.head_position || '').toLowerCase().includes('down')) level += 25;

    setTiredLevel((previous) => {
      const target = Math.min(100, Math.max(previous * 0.72, level));
      return Math.round(target);
    });

    if (!slouching && !eyesClosed && !noPerson) return;

    const now = Date.now();
    let type = 'slouching';
    let title = 'Refocus gently';
    let message = 'Reset your posture and bring your attention back to the task.';
    let sound = 'gentle';

    if (eyesClosed && slouching) {
      type = 'combined';
      title = 'You may need a break';
      message = 'Your posture and eye cues suggest fatigue. Take 60 seconds to reset.';
      sound = 'tired';
    } else if (eyesClosed) {
      type = 'eyesClosed';
      title = 'Eye break';
      message = 'Look away from the screen for a few seconds and relax your eyes.';
      sound = 'tired';
    } else if (noPerson) {
      type = 'distracted';
      title = mode === 'study' ? 'Study mode: return to your desk' : 'Where did you go?';
      message = 'The camera cannot see you. Return when you are ready to continue.';
      sound = 'focus';
    }

    const lastShown = alertCooldownsRef.current[type] || 0;
    if (now - lastShown < ALERT_COOLDOWN) return;

    alertCooldownsRef.current[type] = now;
    setActiveAlert({ id: now, type, title, message });
    await playReminderSound(sound);
  };

  const dismissSmartAlert = () => setActiveAlert(null);

  const formatTime = (date) =>
    date
      ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Never';

  const formatShortTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatDuration = (seconds) => {
    const safe = Math.max(0, Math.round(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const getCurrentStatus = (analysis) => {
    if (!analysis) return 'Waiting for analysis';
    if (analysis.person_visible === false) return 'Not at desk';
    if (analysis.eyes === 'closed') return 'Possible fatigue';
    if (analysis.slouching === true) return 'Posture reminder';
    if (analysis.slouching === false) return 'Good posture';
    return 'Waiting for analysis';
  };

  const getRecommendation = (analysis) => {
    if (!analysis) return 'Start a focus session and the AI will begin checking your workspace.';
    if (analysis.person_visible === false) return 'Return to your workspace when you are ready.';
    if (analysis.eyes === 'closed') return 'Take a short eye break and come back refreshed.';
    if (analysis.slouching === true) return 'Sit a little taller, relax your shoulders and continue.';
    return 'You look ready. Keep working at a comfortable pace.';
  };

  const currentStatus = getCurrentStatus(capturedResult);
  const recommendation = getRecommendation(capturedResult);
  const eyeStatus = capturedResult?.eyes === 'closed'
    ? 'Eyes closed'
    : capturedResult?.eyes === 'open'
      ? 'Eyes open'
      : 'Unknown';
  const headStatus = capturedResult?.head_position
    ? String(capturedResult.head_position).replace(/_/g, ' ')
    : 'Unknown';

  const runMonitoringAnalysis = async () => {
    if (!monitoringRef.current || !cameraRunning || !webcamRef.current || analysisInProgressRef.current) return;
    const imageData = captureCurrentFrame();
    if (!imageData) {
      setMonitorStatus('Error');
      setError('Monitoring could not capture a webcam frame.');
      return;
    }

    analysisInProgressRef.current = true;
    setMonitorStatus('Analyzing');
    setError(null);
    setNextAnalysisAt(null);
    setCapturedImage(imageData);

    try {
      const data = await analyzeImage(imageData);
      setCapturedResult(data);
      setLastAnalysisTime(new Date());
      addAnalysisToHistory(data);
      await showSmartAlert(data);
      setMonitorStatus('Complete');
      setAiStatus('connected');
    } catch (err) {
      console.error(err);
      setMonitorStatus('Error');
      setAiStatus('disconnected');
      setError(err.message || 'The latest frame could not be analyzed.');
    } finally {
      analysisInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!monitoring || !cameraRunning || !currentMode.checks) {
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      monitoringIntervalRef.current = null;
      countdownIntervalRef.current = null;
      setNextAnalysisAt(null);
      return undefined;
    }

    runMonitoringAnalysis();

    const scheduleNext = () => setNextAnalysisAt(Date.now() + MONITOR_INTERVAL);
    scheduleNext();

    monitoringIntervalRef.current = setInterval(() => {
      runMonitoringAnalysis();
      scheduleNext();
    }, MONITOR_INTERVAL);

    countdownIntervalRef.current = setInterval(() => {
      setNextAnalysisAt((current) => current);
    }, 1000);

    return () => {
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      monitoringIntervalRef.current = null;
      countdownIntervalRef.current = null;
    };
  }, [monitoring, cameraRunning, mode]);

  const startMonitoring = async () => {
    if (monitoringRef.current) return;
    monitoringRef.current = true;
    resetAlertCooldowns();
    setActiveAlert(null);
    setMonitoring(true);
    setMonitorStatus('Waiting');
    setError(null);

    if (!cameraRunning && !cameraStarting) {
      await handleStartCamera();
    }
  };

  const stopMonitoring = () => {
    monitoringRef.current = false;
    resetAlertCooldowns();
    setActiveAlert(null);
    setMonitoring(false);
    setMonitorStatus('Waiting');
    setNextAnalysisAt(null);
    if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    monitoringIntervalRef.current = null;
    countdownIntervalRef.current = null;
  };

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        setFullscreenStudy(true);
      } else {
        await document.exitFullscreen?.();
        setFullscreenStudy(false);
      }
    } catch {
      setError('Fullscreen is not available in this browser.');
    }
  };

  const changeMode = (nextMode) => {
    if (sessionActive) return;
    setMode(nextMode);
    setSessionMinutes(MODES[nextMode].minutes);
    setTiredLevel(0);
  };

  const startSession = async () => {
    if (sessionActive) return;
    await ensureAudio();
    setError(null);
    const seconds = sessionMinutes * 60;
    setSessionSecondsLeft(seconds);
    setSessionStartedAt(new Date());
    setSessionActive(true);
    setTiredLevel(0);

    if (mode === 'study') {
      await enterFullscreen();
    }

    if (currentMode.checks) {
      await startMonitoring();
    }
    await playReminderSound('focus');
  };

  const finishSession = (completed = true) => {
    const started = sessionStartedRef.current;
    const elapsed = started ? Math.max(0, Math.round((Date.now() - new Date(started).getTime()) / 1000)) : 0;

    if (started) {
      const points = Math.max(1, Math.round(elapsed / 60));
      setFocusPoints((previous) => previous + points);
      setSessionLog((previous) => [
        {
          startedAt: started,
          endedAt: new Date(),
          duration: elapsed,
          mode,
          completed,
          tired: tiredLevel,
        },
        ...previous,
      ].slice(0, 30));
    }

    setSessionActive(false);
    setSessionSecondsLeft(0);
    setSessionStartedAt(null);
    stopMonitoring();
    playReminderSound(completed ? 'focus' : 'gentle');

    if (fullscreenStudy && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreenStudy(false);

    if (completed) setCompletedSessions((previous) => previous + 1);
  };

  useEffect(() => {
    if (!sessionActive) {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
      return undefined;
    }

    sessionIntervalRef.current = setInterval(() => {
      setSessionSecondsLeft((previous) => {
        if (previous <= 1) {
          setTimeout(() => finishSession(true), 0);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    };
  }, [sessionActive]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreenStudy(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleCaptureImage = () => {
    if (!cameraRunning) {
      setError('Start the camera before capturing a frame.');
      return;
    }
    const imageSrc = captureCurrentFrame();
    if (!imageSrc) {
      setError('Could not capture an image from the camera.');
      return;
    }
    setError(null);
    setCapturedImage(imageSrc);
    setCapturedResult(null);
  };

  const handleAnalyzeCapturedImage = async () => {
    if (!capturedImage) return;
    if (analysisInProgressRef.current) {
      setError('Another image analysis is already running.');
      return;
    }

    analysisInProgressRef.current = true;
    setCapturedAnalyzing(true);
    setError(null);

    try {
      const data = await analyzeImage(capturedImage);
      setCapturedResult(data);
      setLastAnalysisTime(new Date());
      addAnalysisToHistory(data);
      setAiStatus('connected');
    } catch (err) {
      setAiStatus('disconnected');
      setError(err.message || 'Could not analyze the captured image.');
    } finally {
      analysisInProgressRef.current = false;
      setCapturedAnalyzing(false);
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result);
    reader.onerror = () => setError('Failed to read the selected file.');
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!selectedImage || analysisInProgressRef.current) return;
    analysisInProgressRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeImage(selectedImage);
      setResult(data);
      setAiStatus('connected');
    } catch (err) {
      setAiStatus('disconnected');
      setError(err.message || 'Could not contact the local vision server.');
    } finally {
      analysisInProgressRef.current = false;
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (aiTesting) return;
    setAiTesting(true);
    setAiStatus('checking');
    setError(null);
    try {
      const controller = new AbortController();
      aiTestControllerRef.current = controller;
      const response = await fetch('http://127.0.0.1:8888/v1/models', {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Local AI server returned HTTP ${response.status}.`);
      setAiStatus('connected');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setAiStatus('disconnected');
        setError('AI engine is not reachable. Start Unsloth Studio and load the model.');
      }
    } finally {
      aiTestControllerRef.current = null;
      setAiTesting(false);
    }
  };

  const checksToday = useMemo(() => {
    const today = new Date().toDateString();
    return analysisHistory.filter((entry) => new Date(entry.timestamp).toDateString() === today).length;
  }, [analysisHistory]);

  const goodPostureCount = analysisHistory.filter(
    (entry) => entry.person_visible === true && entry.slouching === false
  ).length;

  const reminderCount = analysisHistory.filter((entry) => entry.slouching === true).length;

  const focusRate = analysisHistory.length
    ? Math.round((goodPostureCount / analysisHistory.length) * 100)
    : 0;

  const countdownSeconds = nextAnalysisAt
    ? Math.max(0, Math.ceil((nextAnalysisAt - Date.now()) / 1000))
    : null;

  const sessionProgress = sessionActive
    ? Math.max(0, Math.min(100, 100 - (sessionSecondsLeft / (sessionMinutes * 60)) * 100))
    : 0;

  const getHistoryStatus = (entry) => {
    if (entry.person_visible === false) return ['Not at desk', 'neutral'];
    if (entry.eyes === 'closed') return ['Possible fatigue', 'warning'];
    if (entry.slouching === true) return ['Posture reminder', 'warning'];
    if (entry.slouching === false) return ['Good posture', 'success'];
    return ['Unknown', 'neutral'];
  };

  const tiredLabel =
    tiredLevel >= 75 ? 'Very tired' :
    tiredLevel >= 50 ? 'Getting tired' :
    tiredLevel >= 25 ? 'Slight fatigue' : 'Fresh';

  const statusTone =
    currentStatus === 'Good posture'
      ? 'success'
      : currentStatus === 'Posture reminder' || currentStatus === 'Possible fatigue'
        ? 'warning'
        : currentStatus === 'Not at desk'
          ? 'neutral'
          : 'info';

  return (
    <div className={`app-shell mode-${mode} ${sessionActive ? 'session-live' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">ErgoAI Focus</div>
            <div className="brand-subtitle">AI-assisted focus & workspace awareness</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className={`system-pill ${aiStatus}`}>
            <span className="status-dot" />
            {aiStatus === 'connected' ? 'AI Connected' : aiStatus === 'checking' ? 'Checking AI' : 'AI Offline'}
          </div>
          <button className="theme-toggle" onClick={() => setTheme((v) => v === 'dark' ? 'light' : 'dark')}>
            <span className="theme-icon">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div>
            <p className="eyebrow">FOCUS ENGINE · LOCAL AI</p>
            <h1>Don't just monitor.<br /><span>Help me focus.</span></h1>
            <p className="hero-copy">
              ErgoAI turns webcam observations into practical focus interventions: scheduled sessions, gentle sound reminders, fatigue signals, and workspace tracking.
            </p>
          </div>
          <div className={`hero-monitor ${monitoring || sessionActive ? 'is-active' : ''}`}>
            <span className="status-dot" />
            {sessionActive ? `${currentMode.name} session active` : 'Ready for a session'}
          </div>
        </section>

        {activeAlert && (
          <section className={`alert-card smart-alert ${activeAlert.type}`}>
            <div className="alert-icon">!</div>
            <div className="alert-content">
              <div className="alert-title">{activeAlert.title}</div>
              <div className="alert-message">{activeAlert.message}</div>
              <div className="alert-time">Intervention · {formatTime(activeAlert.id)}</div>
            </div>
            <button className="button secondary" onClick={dismissSmartAlert}>Got it</button>
          </section>
        )}

        {error && (
          <section className="error-card" role="alert">
            <div className="error-icon">!</div>
            <div className="error-content">
              <strong>Something needs attention</strong>
              <p>{error}</p>
            </div>
            <button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </section>
        )}

        <section className="focus-layout">
          <article className="card focus-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">FOCUS CONTROL</div>
                <h2>Choose how you want to work</h2>
              </div>
              <div className={`state-badge ${sessionActive ? 'active' : ''}`}>
                <span className="status-dot" /> {sessionActive ? 'Live session' : 'Not running'}
              </div>
            </div>

            <div className="mode-grid">
              {Object.entries(MODES).map(([key, item]) => (
                <button
                  key={key}
                  className={`mode-card ${mode === key ? 'selected' : ''}`}
                  onClick={() => changeMode(key)}
                  disabled={sessionActive}
                >
                  <span className={`mode-icon ${item.accent}`}>{key === 'study' ? 'S' : key === 'focus' ? 'F' : 'C'}</span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                  <span className="mode-time">{item.minutes} min</span>
                </button>
              ))}
            </div>

            <div className="session-control">
              <div className="timer-ring" style={{ '--progress': `${sessionProgress}%` }}>
                <div>
                  <span>{sessionActive ? formatDuration(sessionSecondsLeft) : `${sessionMinutes}:00`}</span>
                  <small>{sessionActive ? 'remaining' : 'session'}</small>
                </div>
              </div>

              <div className="session-copy">
                <span className="section-kicker">{currentMode.name.toUpperCase()} MODE</span>
                <h3>{sessionActive ? 'Stay with the task.' : 'Make your next block count.'}</h3>
                <p>{currentMode.description}</p>
                <div className="session-buttons">
                  {!sessionActive ? (
                    <button className="button primary large" onClick={startSession}>Start {currentMode.name} Session</button>
                  ) : (
                    <button className="button danger large" onClick={() => finishSession(false)}>End Session</button>
                  )}
                  <button className="ghost-button large" onClick={() => setSoundEnabled((v) => !v)}>
                    {soundEnabled ? 'Sound reminders on' : 'Sound reminders off'}
                  </button>
                  {mode === 'study' && (
                    <button className="ghost-button large" onClick={enterFullscreen}>
                      {fullscreenStudy ? 'Exit fullscreen' : 'Enter fullscreen'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="session-settings">
              <label>
                <span>Session length</span>
                <select value={sessionMinutes} disabled={sessionActive} onChange={(e) => setSessionMinutes(Number(e.target.value))}>
                  <option value={15}>15 minutes</option>
                  <option value={25}>25 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={50}>50 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                </select>
              </label>
              <label>
                <span>Reminder volume</span>
                <input type="range" min="0.05" max="1" step="0.05" value={soundVolume} onChange={(e) => setSoundVolume(Number(e.target.value))} />
              </label>
            </div>

            <div className="study-note">
              <strong>Study mode notice</strong>
              <span>Browser security limits prevent full OS-level locking of mobile devices or other desktop applications. Study Mode enforces full-screen display, desk presence monitoring, and instant sound alerts on this browser environment.</span>
            </div>
          </article>

          <aside className="card tired-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">TIREDNESS SIGNAL</div>
                <h2>How are you holding up?</h2>
              </div>
              <span className={`tired-badge level-${Math.round(tiredLevel / 25)}`}>{tiredLabel}</span>
            </div>

            <div className="tired-meter">
              <div className="meter-head">
                <strong>{tiredLevel}%</strong>
                <span>AI estimate</span>
              </div>
              <div className="meter-track"><div className="meter-fill" style={{ width: `${tiredLevel}%` }} /></div>
              <div className="meter-labels"><span>Fresh</span><span>Take a break</span></div>
            </div>

            <p className="muted">Cues like closed eyes, head slouching, or missing presence increment this value. Use it as a gentle signal to pause or stretch.</p>

            <div className="energy-question">
              <span>Quick self-check</span>
              <strong>How much energy do you feel?</strong>
              <input type="range" min="0" max="100" value={selfEnergy} onChange={(e) => setSelfEnergy(Number(e.target.value))} />
              <div className="energy-row"><span>Low</span><strong>{selfEnergy}%</strong><span>High</span></div>
            </div>

            <button className="button secondary full" onClick={() => {
              setTiredLevel(0);
              playReminderSound('gentle');
            }}>
              Reset tiredness signal
            </button>
          </aside>
        </section>

        <section className="primary-grid">
          <article className="card camera-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">LIVE CAMERA</div>
                <h2>Workspace view</h2>
              </div>
              <div className={`live-badge ${cameraRunning ? 'on' : ''}`}>
                <span className="status-dot" /> {cameraRunning ? 'LIVE' : 'OFFLINE'}
              </div>
            </div>

            <div className="camera-frame">
              {!cameraRunning && !cameraStarting && (
                <div className="camera-empty">
                  <div className="empty-icon">CAM</div>
                  <strong>Camera is paused</strong>
                  <span>Start it when you want AI-assisted focus interventions.</span>
                </div>
              )}
              {cameraStarting && (
                <div className="camera-empty"><div className="pulse-loader" /><strong>Starting camera...</strong><span>Waiting for browser permission.</span></div>
              )}
              {(cameraRunning || cameraStarting) && selectedCameraId && (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  mirrored
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.92}
                  videoConstraints={{ deviceId: selectedCameraId, width: { ideal: 1280 }, height: { ideal: 720 } }}
                  onUserMedia={handleCameraReady}
                  onUserMediaError={handleCameraError}
                  className="webcam"
                />
              )}
              {cameraRunning && (
                <div className="camera-overlay">
                  <span className="overlay-chip">LOCAL CAMERA</span>
                  <span className="overlay-chip">{monitoring ? 'AI MONITORING' : 'READY'}</span>
                </div>
              )}
            </div>

            <div className="camera-meta">
              <label htmlFor="camera-select">Camera source</label>
              <select id="camera-select" className="camera-select" value={selectedCameraId} onChange={handleCameraChange} disabled={cameraRunning || cameraStarting}>
                {cameras.length === 0 ? <option value="">Start camera to detect devices</option> : cameras.map((camera, index) => (
                  <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>
                ))}
              </select>
            </div>

            <div className="button-row">
              <button className="button primary large" onClick={handleStartCamera} disabled={cameraRunning || cameraStarting || !selectedCameraId}>{cameraStarting ? 'Starting...' : 'Start Camera'}</button>
              <button className="button secondary large" onClick={handleStopCamera} disabled={!cameraRunning && !cameraStarting}>Stop Camera</button>
              <button className="button secondary large" onClick={handleCaptureImage} disabled={!cameraRunning}>Capture Frame</button>
              <button className={`button ${monitoring ? 'danger' : 'secondary'} large`} onClick={monitoring ? stopMonitoring : startMonitoring} disabled={!cameraRunning && !cameraStarting}>
                {monitoring ? 'Stop AI Monitoring' : 'Start AI Monitoring'}
              </button>
            </div>
          </article>

          <article className={`card status-card status-${statusTone}`}>
            <div className="card-header">
              <div>
                <div className="section-kicker">LIVE INSIGHT</div>
                <h2>What should you do now?</h2>
              </div>
              <div className={`status-symbol ${statusTone}`}>{statusTone === 'success' ? '✓' : statusTone === 'warning' ? '!' : '•'}</div>
            </div>

            {monitorStatus === 'Analyzing' && <div className="analysis-loading"><span className="pulse-loader" /><div><strong>AI analyzing</strong><span>Reviewing the latest frame...</span></div></div>}

            <div className="status-main">
              <div className="status-label">{currentStatus}</div>
              <p>{recommendation}</p>
            </div>

            <div className="metric-grid">
              <div className="metric"><span>POSTURE</span><strong>{capturedResult?.slouching === false ? 'Good' : capturedResult?.slouching === true ? 'Reminder' : 'Unknown'}</strong></div>
              <div className="metric"><span>EYES</span><strong>{eyeStatus}</strong></div>
              <div className="metric"><span>HEAD</span><strong>{headStatus}</strong></div>
              <div className="metric"><span>LAST CHECK</span><strong>{formatTime(lastAnalysisTime)}</strong></div>
            </div>

            <div className="monitor-details">
              <div><span>INTERVAL</span><strong>{currentMode.checks ? '10 sec' : 'Off'}</strong></div>
              <div><span>STATUS</span><strong>{monitorStatus}</strong></div>
              <div><span>NEXT CHECK</span><strong>{monitoring && countdownSeconds !== null ? `${countdownSeconds}s` : '—'}</strong></div>
            </div>

            <div className="recommendation"><div className="recommendation-label">INTERVENTION</div><p>{recommendation}</p></div>
          </article>
        </section>

        <section className="stats-grid">
          <div className="stat-card"><span>FOCUS POINTS</span><strong>{focusPoints}</strong><small>Minutes invested</small></div>
          <div className="stat-card"><span>SESSIONS DONE</span><strong>{completedSessions}</strong><small>Completed focus blocks</small></div>
          <div className="stat-card"><span>AI CHECKS TODAY</span><strong>{checksToday}</strong><small>Workspace observations</small></div>
          <div className="stat-card"><span>POSTURE RATE</span><strong>{focusRate}%</strong><small>{reminderCount} reminders recorded</small></div>
        </section>

        {capturedImage && (
          <section className="card captured-card">
            <div className="card-header"><div><div className="section-kicker">CAPTURED FRAME</div><h2>One-time AI check</h2></div></div>
            <div className="captured-content">
              <img src={capturedImage} alt="Latest captured frame" />
              <div className="captured-actions">
                <p className="muted">Analyze this frame without starting a continuous loop.</p>
                <button className="button primary" onClick={handleAnalyzeCapturedImage} disabled={capturedAnalyzing}>{capturedAnalyzing ? 'Analyzing...' : 'Analyze Captured Image'}</button>
              </div>
            </div>
          </section>
        )}

        <section className="card history-card">
          <div className="card-header">
            <div><div className="section-kicker">MEMORY OF YOUR WORK</div><h2>Recent observations</h2></div>
            <button className="ghost-button" onClick={() => setAnalysisHistory([])} disabled={!analysisHistory.length}>Clear History</button>
          </div>

          {analysisHistory.length === 0 ? (
            <div className="empty-state compact"><div className="empty-icon">LOG</div><strong>No observations yet</strong><span>Start a focus session to build your timeline.</span></div>
          ) : (
            <div className="history-list">
              {analysisHistory.map((entry, index) => {
                const [historyStatus, historyTone] = getHistoryStatus(entry);
                return (
                  <details className="history-item" key={`${entry.timestamp}-${index}`}>
                    <summary>
                      <span className={`history-marker ${historyTone}`}>{historyTone === 'success' ? '✓' : historyTone === 'warning' ? '!' : '•'}</span>
                      <span className="history-time">{formatShortTime(entry.timestamp)}</span>
                      <span className="history-status">{historyStatus}</span>
                      <span className="history-meta">{entry.eyes || 'Eyes unknown'} · {entry.head_position || 'Head unknown'}</span>
                      <span className="history-chevron">›</span>
                    </summary>
                    <div className="history-details">
                      <div><span>POSTURE</span><strong>{entry.slouching === false ? 'Good' : entry.slouching === true ? 'Reminder' : 'Unknown'}</strong></div>
                      <div><span>EYES</span><strong>{entry.eyes || 'Unknown'}</strong></div>
                      <div><span>HEAD</span><strong>{entry.head_position || 'Unknown'}</strong></div>
                      <div><span>PERSON</span><strong>{entry.person_visible === true ? 'Detected' : entry.person_visible === false ? 'Not detected' : 'Unknown'}</strong></div>
                      {entry.description && <div className="history-description"><span>MODEL NOTE</span><strong>{entry.description}</strong></div>}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <section className="card quick-card">
          <div className="card-header"><div><div className="section-kicker">QUICK ANALYSIS</div><h2>Test a single image</h2></div><span className="state-badge">One-time</span></div>
          <p className="muted">Upload an image file to run a manual analysis with the local AI service.</p>
          <div className="upload-row">
            <label className="upload-button"><input type="file" accept="image/*" onChange={handleImageSelect} />Choose image</label>
            {selectedImage && <button className="button primary" onClick={handleAnalyze} disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Image'}</button>}
          </div>
          {selectedImage && <img className="upload-preview" src={selectedImage} alt="Selected preview" />}
          {result && <pre className="json-result">{JSON.stringify(result, null, 2)}</pre>}
        </section>

        <section className="card system-card">
          <div>
            <div className="section-kicker">SYSTEM</div>
            <h2>Local AI connection</h2>
            <p className="muted">Vision requests route directly to <code>http://127.0.0.1:8888/v1</code>.</p>
          </div>
          <button className="button secondary" onClick={handleTestConnection} disabled={aiTesting}>{aiTesting ? 'Testing...' : 'Test AI Connection'}</button>
        </section>

        <footer className="footer-note">
          <span>ErgoAI Focus · Built around your existing local vision workflow</span>
          <span>Camera analysis is informational, not medical advice.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;