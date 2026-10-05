import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { analyzeImage } from './services/aiService';
import './App.css';

const MONITOR_INTERVAL = 10000;
const ALERT_COOLDOWN = 2 * 60 * 1000;

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

  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);

  const [aiStatus, setAiStatus] = useState('checking');
  const [aiTesting, setAiTesting] = useState(false);

  const webcamRef = useRef(null);
  const monitoringIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const analysisInProgressRef = useRef(false);
  const monitoringRef = useRef(false);
  const aiTestControllerRef = useRef(null);

  const alertCooldownsRef = useRef({
    slouching: 0,
    eyesClosed: 0,
    combined: 0,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ergoai-theme', theme);
  }, [theme]);

  const loadCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Camera device enumeration is not supported by this browser.');
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setCameras(videoDevices);

      if (!selectedCameraId && videoDevices.length > 0) {
        const preferredCamera =
          videoDevices.find((device) => {
            const label = device.label.toLowerCase();
            return ['integrated', 'built-in', 'internal', 'laptop', 'hd camera', 'hd webcam', 'webcam']
              .some((name) => label.includes(name));
          }) || videoDevices[0];

        setSelectedCameraId(preferredCamera.deviceId);
      }
    } catch (err) {
      console.error('Could not enumerate cameras:', err);
      setError('Could not list your cameras. Please check browser camera permissions.');
    }
  };

  useEffect(() => {
    loadCameras();

    return () => {
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (aiTestControllerRef.current) aiTestControllerRef.current.abort();

      monitoringRef.current = false;

      const video = webcamRef.current?.video;
      const stream = video?.srcObject;
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
      console.error('Camera permission error:', err);
      setCameraStarting(false);
      setCameraRunning(false);
      setError('Camera access was denied or unavailable. Please allow camera permission for this site and try again.');

      if (monitoringRef.current) {
        monitoringRef.current = false;
        resetAlertCooldowns();
        setActiveAlert(null);
        setMonitoring(false);
        setMonitorStatus('Error');
      }
    }
  };

  const handleCameraReady = () => {
    setCameraStarting(false);
    setCameraRunning(true);
    setAiStatus((current) => current);
    setError(null);
  };

  const handleCameraError = (cameraError) => {
    console.error('Webcam error:', cameraError);
    setCameraStarting(false);
    setCameraRunning(false);
    setError('The selected camera could not be opened. Try selecting another camera.');

    if (monitoringRef.current) {
      monitoringRef.current = false;
      setMonitoring(false);
      setMonitorStatus('Error');
    }
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

    if (monitoringRef.current) {
      monitoringRef.current = false;
      setMonitoring(false);
      setMonitorStatus('Waiting');
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      monitoringIntervalRef.current = null;
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
      setNextAnalysisAt(null);
    }

    setError(null);
  };

  const handleCameraChange = (event) => {
    const newCameraId = event.target.value;

    if (cameraRunning || cameraStarting) {
      const video = webcamRef.current?.video;
      const stream = video?.srcObject;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        if (video) video.srcObject = null;
      }

      setCameraRunning(false);
      setCameraStarting(false);
    }

    setSelectedCameraId(newCameraId);
    setError(null);
  };

  const captureCurrentFrame = () => {
    if (!webcamRef.current) return null;
    return webcamRef.current.getScreenshot() || null;
  };

  const addAnalysisToHistory = (data, timestamp = new Date()) => {
    const historyEntry = {
      timestamp,
      person_visible: data?.person_visible,
      sitting: data?.sitting,
      slouching: data?.slouching,
      head_position: data?.head_position,
      eyes: data?.eyes,
      description: data?.description,
    };

    setAnalysisHistory((previous) => [historyEntry, ...previous].slice(0, 20));
  };

  const resetAlertCooldowns = () => {
    alertCooldownsRef.current = { slouching: 0, eyesClosed: 0, combined: 0 };
  };

  const maybeShowSmartAlert = (data) => {
    if (!monitoringRef.current || !data) return;

    const slouching = data.slouching === true;
    const eyesClosed = data.eyes === 'closed';
    if (!slouching && !eyesClosed) return;

    const now = Date.now();
    let alertType;
    let title;
    let message;

    if (slouching && eyesClosed) {
      alertType = 'combined';
      title = 'Gentle break reminder';
      message = 'The latest check suggests adjusting your sitting position and taking a short break if you feel tired.';
    } else if (slouching) {
      alertType = 'slouching';
      title = 'Posture reminder';
      message = 'The latest check suggests sitting a little more upright.';
    } else {
      alertType = 'eyesClosed';
      title = 'Break reminder';
      message = 'Your eyes appear closed. Consider taking a short break if you feel tired.';
    }

    const lastShown = alertCooldownsRef.current[alertType] || 0;
    if (now - lastShown < ALERT_COOLDOWN) return;

    alertCooldownsRef.current[alertType] = now;
    setActiveAlert({ id: now, type: alertType, title, message });
  };

  const dismissSmartAlert = () => setActiveAlert(null);

  const formatTime = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatShortTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getCurrentStatus = (analysis) => {
    if (!analysis) return 'Waiting for analysis';
    if (analysis.person_visible === false) return 'No Person Detected';
    if (analysis.slouching === true) return 'Posture Reminder';
    if (analysis.slouching === false) return 'Good Posture';
    return 'Waiting for analysis';
  };

  const getEyeStatus = (analysis) => {
    if (analysis?.eyes === 'closed') return 'Eyes appear closed';
    if (analysis?.eyes === 'open') return 'Eyes open';
    return 'Unknown';
  };

  const getHeadStatus = (analysis) => {
    if (!analysis?.head_position) return 'Unknown';
    return String(analysis.head_position).replace(/_/g, ' ');
  };

  const getRecommendation = (analysis) => {
    if (!analysis) return 'Start the camera and run an analysis to see your latest visual ergonomics status.';
    if (analysis.person_visible === false) return 'Make sure you are visible in the camera frame.';
    if (analysis.slouching === true) return 'Try sitting a little more upright and relaxing your shoulders.';
    if (analysis.eyes === 'closed') return 'Your eyes appear closed. Consider taking a short break if you feel tired.';
    return 'Your latest visual check looks comfortable. Keep it up.';
  };

  const currentStatus = getCurrentStatus(capturedResult);
  const eyeStatus = getEyeStatus(capturedResult);
  const headStatus = getHeadStatus(capturedResult);
  const recommendation = getRecommendation(capturedResult);

  const statusTone =
    currentStatus === 'Good Posture'
      ? 'success'
      : currentStatus === 'Posture Reminder'
        ? 'warning'
        : currentStatus === 'No Person Detected'
          ? 'neutral'
          : 'info';

  const runMonitoringAnalysis = async () => {
    if (!monitoringRef.current || !cameraRunning || !webcamRef.current || analysisInProgressRef.current) return;

    const imageData = captureCurrentFrame();
    if (!imageData) {
      setMonitorStatus('Error');
      setError('Monitoring could not capture a frame from the webcam.');
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
      maybeShowSmartAlert(data);
      setMonitorStatus('Complete');
      setAiStatus('connected');
    } catch (err) {
      console.error('Monitoring analysis error:', err);
      setMonitorStatus('Error');
      setAiStatus('disconnected');
      setError(err.message || 'The latest frame could not be analyzed. Your previous successful result has been kept.');
    } finally {
      analysisInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!monitoring || !cameraRunning) {
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      monitoringIntervalRef.current = null;
      countdownIntervalRef.current = null;
      setNextAnalysisAt(null);
      return undefined;
    }

    runMonitoringAnalysis();

    const scheduleNext = () => {
      const target = Date.now() + MONITOR_INTERVAL;
      setNextAnalysisAt(target);
    };

    scheduleNext();

    monitoringIntervalRef.current = setInterval(() => {
      runMonitoringAnalysis();
      scheduleNext();
    }, MONITOR_INTERVAL);

    countdownIntervalRef.current = setInterval(() => {
      setNextAnalysisAt((current) => (current ? current : null));
    }, 1000);

    return () => {
      if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      monitoringIntervalRef.current = null;
      countdownIntervalRef.current = null;
    };
  }, [monitoring, cameraRunning]);

  const handleStartMonitoring = async () => {
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

  const handleStopMonitoring = () => {
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

  const handleCaptureImage = () => {
    if (!cameraRunning) {
      setError('Start the camera before capturing an image.');
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
    if (!capturedImage) {
      setError('Capture an image before analyzing it.');
      return;
    }

    if (analysisInProgressRef.current) {
      setError('Another image analysis is already running. Please wait.');
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
      setError(err.message || 'An error occurred while analyzing the captured image.');
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
      setError(err.message || 'An error occurred while contacting the local vision server.');
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
        console.error('AI connection test failed:', err);
        setAiStatus('disconnected');
        setError('AI engine is not reachable. Make sure Unsloth Studio is running and the model is loaded.');
      }
    } finally {
      aiTestControllerRef.current = null;
      setAiTesting(false);
    }
  };

  const handleClearHistory = () => setAnalysisHistory([]);

  const checksToday = analysisHistory.filter((entry) => {
    const date = new Date(entry.timestamp);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  }).length;

  const goodPostureCount = analysisHistory.filter(
    (entry) => entry.person_visible === true && entry.slouching === false
  ).length;

  const reminderCount = analysisHistory.filter((entry) => entry.slouching === true).length;

  const countdownSeconds = nextAnalysisAt
    ? Math.max(0, Math.ceil((nextAnalysisAt - Date.now()) / 1000))
    : null;

  const getHistoryStatus = (entry) => {
    if (entry.person_visible === false) return ['No Person', 'neutral'];
    if (entry.slouching === true) return ['Posture Reminder', 'warning'];
    if (entry.slouching === false) return ['Good Posture', 'success'];
    return ['Unknown', 'neutral'];
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">ErgoAI</div>
            <div className="brand-subtitle">Real-Time Ergonomics Monitor</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className={`system-pill ${aiStatus}`}>
            <span className="status-dot" />
            {aiStatus === 'connected' ? 'AI Connected' : aiStatus === 'checking' ? 'Checking AI' : 'AI Disconnected'}
          </div>

          <button
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <span className="theme-icon">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div>
            <p className="eyebrow">LOCAL AI · PRIVATE BY DESIGN</p>
            <h1>Stay aware.<br /><span>Stay comfortable.</span></h1>
            <p className="hero-copy">
              A local AI workspace that periodically checks visible ergonomics cues and gives simple, non-medical reminders.
            </p>
          </div>

          <div className={`hero-monitor ${monitoring ? 'is-active' : ''}`}>
            <span className="status-dot" />
            {monitoring ? 'Monitoring Active' : 'Monitoring Paused'}
          </div>
        </section>

        {activeAlert && (
          <section className="alert-card" role="status">
            <div className="alert-icon">!</div>
            <div className="alert-content">
              <div className="alert-title">{activeAlert.title}</div>
              <div className="alert-message">{activeAlert.message}</div>
              <div className="alert-time">In-app reminder · cooldown protected</div>
            </div>
            <button className="icon-button" onClick={dismissSmartAlert} aria-label="Dismiss reminder">×</button>
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

        <section className="primary-grid">
          <article className="card camera-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">LIVE CAMERA</div>
                <h2>Workspace view</h2>
              </div>
              <div className={`live-badge ${cameraRunning ? 'on' : ''}`}>
                <span className="status-dot" />
                {cameraRunning ? 'LIVE' : 'OFFLINE'}
              </div>
            </div>

            <div className="camera-frame">
              {!cameraRunning && !cameraStarting && (
                <div className="camera-empty">
                  <div className="empty-icon">CAM</div>
                  <strong>Camera is paused</strong>
                  <span>Start the camera to begin visual monitoring.</span>
                </div>
              )}

              {cameraStarting && (
                <div className="camera-empty">
                  <div className="pulse-loader" />
                  <strong>Starting camera...</strong>
                  <span>Waiting for browser camera access.</span>
                </div>
              )}

              {(cameraRunning || cameraStarting) && selectedCameraId && (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  mirrored
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.92}
                  videoConstraints={{
                    deviceId: selectedCameraId,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                  }}
                  onUserMedia={handleCameraReady}
                  onUserMediaError={handleCameraError}
                  className="webcam"
                />
              )}

              {cameraRunning && (
                <div className="camera-overlay">
                  <span className="overlay-chip">LOCAL CAMERA</span>
                  <span className="overlay-chip">AI READY</span>
                </div>
              )}
            </div>

            <div className="camera-meta">
              <label htmlFor="camera-select">Camera source</label>
              <select
                id="camera-select"
                className="camera-select"
                value={selectedCameraId}
                onChange={handleCameraChange}
                disabled={cameraRunning || cameraStarting}
              >
                {cameras.length === 0 ? (
                  <option value="">Start camera to detect devices</option>
                ) : (
                  cameras.map((camera, index) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${index + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="button-row">
              <button
                className="button primary large"
                onClick={handleStartCamera}
                disabled={cameraRunning || cameraStarting || !selectedCameraId}
              >
                {cameraStarting ? 'Starting...' : 'Start Camera'}
              </button>
              <button
                className="button secondary large"
                onClick={handleStopCamera}
                disabled={!cameraRunning && !cameraStarting}
              >
                Stop Camera
              </button>
              <button
                className="button secondary large"
                onClick={handleCaptureImage}
                disabled={!cameraRunning}
              >
                Capture Frame
              </button>
            </div>
          </article>

          <article className={`card status-card status-${statusTone}`}>
            <div className="card-header">
              <div>
                <div className="section-kicker">CURRENT STATUS</div>
                <h2>AI observation</h2>
              </div>
              <div className={`status-symbol ${statusTone}`}>
                {statusTone === 'success' ? '✓' : statusTone === 'warning' ? '!' : '•'}
              </div>
            </div>

            {monitorStatus === 'Analyzing' && (
              <div className="analysis-loading">
                <span className="pulse-loader" />
                <div>
                  <strong>AI analyzing</strong>
                  <span>Reviewing the latest camera frame...</span>
                </div>
              </div>
            )}

            <div className="status-main">
              <div className="status-label">{currentStatus}</div>
              <p>{recommendation}</p>
            </div>

            <div className="metric-grid">
              <div className="metric">
                <span>POSTURE</span>
                <strong>{capturedResult?.slouching === false ? 'Good' : capturedResult?.slouching === true ? 'Reminder' : 'Unknown'}</strong>
              </div>
              <div className="metric">
                <span>EYES</span>
                <strong>{eyeStatus}</strong>
              </div>
              <div className="metric">
                <span>HEAD</span>
                <strong>{headStatus}</strong>
              </div>
              <div className="metric">
                <span>LAST CHECK</span>
                <strong>{formatTime(lastAnalysisTime)}</strong>
              </div>
            </div>

            <div className="recommendation">
              <div className="recommendation-label">RECOMMENDATION</div>
              <p>{recommendation}</p>
            </div>
          </article>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span>CHECKS TODAY</span>
            <strong>{checksToday}</strong>
            <small>Session history</small>
          </div>
          <div className="stat-card">
            <span>GOOD POSTURE</span>
            <strong>{goodPostureCount}</strong>
            <small>Positive observations</small>
          </div>
          <div className="stat-card">
            <span>REMINDERS</span>
            <strong>{reminderCount}</strong>
            <small>Posture observations</small>
          </div>
          <div className="stat-card">
            <span>LAST CHECK</span>
            <strong className="stat-time">{formatTime(lastAnalysisTime)}</strong>
            <small>{lastAnalysisTime ? 'Latest successful analysis' : 'No analysis yet'}</small>
          </div>
        </section>

        <section className="control-grid">
          <article className="card monitoring-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">AUTOMATION</div>
                <h2>Continuous monitoring</h2>
              </div>
              <div className={`state-badge ${monitoring ? 'active' : ''}`}>
                <span className="status-dot" />
                {monitoring ? 'Active' : 'Paused'}
              </div>
            </div>

            <p className="muted">
              The app captures a frame and sends it to your local model every 10 seconds. Requests never overlap.
            </p>

            <div className="monitor-details">
              <div>
                <span>INTERVAL</span>
                <strong>10 seconds</strong>
              </div>
              <div>
                <span>STATUS</span>
                <strong>{monitorStatus}</strong>
              </div>
              <div>
                <span>NEXT CHECK</span>
                <strong>{monitoring && countdownSeconds !== null ? `${countdownSeconds}s` : '—'}</strong>
              </div>
            </div>

            <div className="button-row">
              <button className="button primary large" onClick={handleStartMonitoring} disabled={monitoring}>
                Start Monitoring
              </button>
              <button className="button secondary large" onClick={handleStopMonitoring} disabled={!monitoring}>
                Stop Monitoring
              </button>
              <button className="ghost-button" onClick={runMonitoringAnalysis} disabled={!cameraRunning || analysisInProgressRef.current}>
                Analyze Now
              </button>
            </div>
          </article>

          <article className="card system-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">SYSTEM</div>
                <h2>Connection status</h2>
              </div>
              <button className="ghost-button" onClick={handleTestConnection} disabled={aiTesting}>
                {aiTesting ? 'Checking...' : 'Test AI'}
              </button>
            </div>

            <div className="system-list">
              <div className="system-row">
                <span>AI ENGINE</span>
                <strong className={aiStatus}>
                  <i className="status-dot" />
                  {aiStatus === 'connected' ? 'Connected' : aiStatus === 'checking' ? 'Checking...' : 'Disconnected'}
                </strong>
              </div>
              <div className="system-row">
                <span>CAMERA</span>
                <strong className={cameraRunning ? 'connected' : 'disconnected'}>
                  <i className="status-dot" />
                  {cameraRunning ? 'Ready' : 'Off'}
                </strong>
              </div>
              <div className="system-row">
                <span>MONITORING</span>
                <strong className={monitoring ? 'connected' : 'disconnected'}>
                  <i className="status-dot" />
                  {monitoring ? 'Active' : 'Paused'}
                </strong>
              </div>
            </div>

            <div className="local-note">
              <strong>Local AI processing</strong>
              <p>Camera frames are analyzed using the AI model running on this computer.</p>
            </div>
          </article>
        </section>

        {capturedImage && (
          <section className="card captured-card">
            <div className="card-header">
              <div>
                <div className="section-kicker">LATEST FRAME</div>
                <h2>Captured image</h2>
              </div>
              {capturedAnalyzing && <span className="state-badge active">Analyzing</span>}
            </div>

            <div className="captured-content">
              <img src={capturedImage} alt="Latest captured frame" />
              <div className="captured-actions">
                <p className="muted">Use this frame for a one-time local AI analysis without starting continuous monitoring.</p>
                <button className="button primary" onClick={handleAnalyzeCapturedImage} disabled={capturedAnalyzing}>
                  {capturedAnalyzing ? 'Analyzing image...' : 'Analyze Captured Image'}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="card history-card">
          <div className="card-header">
            <div>
              <div className="section-kicker">SESSION HISTORY</div>
              <h2>Recent AI observations</h2>
            </div>
            <button className="ghost-button" onClick={handleClearHistory} disabled={!analysisHistory.length}>
              Clear History
            </button>
          </div>

          {analysisHistory.length === 0 ? (
            <div className="empty-state compact">
              <div className="empty-icon">LOG</div>
              <strong>No analysis history yet</strong>
              <span>Start monitoring to build your session timeline.</span>
            </div>
          ) : (
            <div className="history-list">
              {analysisHistory.map((entry, index) => {
                const [historyStatus, historyTone] = getHistoryStatus(entry);
                return (
                  <details className="history-item" key={`${entry.timestamp}-${index}`}>
                    <summary>
                      <span className={`history-marker ${historyTone}`}>
                        {historyTone === 'success' ? '✓' : historyTone === 'warning' ? '!' : '•'}
                      </span>
                      <span className="history-time">{formatShortTime(entry.timestamp)}</span>
                      <span className="history-status">{historyStatus}</span>
                      <span className="history-meta">
                        {entry.eyes === 'open' ? 'Eyes open' : entry.eyes === 'closed' ? 'Eyes closed' : 'Eyes unknown'}
                        {' · '}
                        {entry.head_position || 'Head unknown'}
                      </span>
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
          <div className="card-header">
            <div>
              <div className="section-kicker">QUICK ANALYSIS</div>
              <h2>Test a single image</h2>
            </div>
            <span className="state-badge">One-time</span>
          </div>

          <p className="muted">Upload an image for a one-off analysis. This uses the same local AI service as live monitoring.</p>

          <label className="upload-zone">
            <input type="file" accept="image/*" onChange={handleImageSelect} />
            <div className="upload-icon">IMG</div>
            <strong>{selectedImage ? 'Choose another image' : 'Choose an image'}</strong>
            <span>PNG, JPG, WEBP · analyzed locally</span>
          </label>

          {selectedImage && (
            <div className="quick-preview">
              <img src={selectedImage} alt="Selected preview" />
              <div className="quick-actions">
                <button className="button primary" onClick={handleAnalyze} disabled={loading}>
                  {loading ? 'Analyzing Image...' : 'Analyze Image'}
                </button>

                {result && (
                  <details className="quick-result" open>
                    <summary>View raw JSON result</summary>
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </section>

        <footer className="footer-note">
          <span>ErgoAI · Local visual ergonomics assistant</span>
          <span>Visual reminders only · Not medical advice</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
