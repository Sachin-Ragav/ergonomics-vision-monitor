import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { analyzeImage } from './services/aiService';
import './App.css';

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedResult, setCapturedResult] = useState(null);
  const [capturedAnalyzing, setCapturedAnalyzing] = useState(false);

  // Available cameras and the camera selected by the user.
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const webcamRef = useRef(null);

  // Get camera devices after permission has been granted.
  const loadCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Camera device enumeration is not supported by this browser.');
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === 'videoinput'
      );

      setCameras(videoDevices);

      // Prefer a real laptop/integrated camera when one is available.
      // Otherwise use the first available camera.
      if (!selectedCameraId && videoDevices.length > 0) {
        const preferredCamera =
          videoDevices.find((device) => {
            const label = device.label.toLowerCase();
            return (
              label.includes('integrated') ||
              label.includes('built-in') ||
              label.includes('internal') ||
              label.includes('laptop') ||
              label.includes('hd camera') ||
              label.includes('hd webcam') ||
              label.includes('webcam')
            );
          }) || videoDevices[0];

        setSelectedCameraId(preferredCamera.deviceId);
      }
    } catch (err) {
      console.error('Could not enumerate cameras:', err);
      setError(
        'Could not list your cameras. Please check browser camera permissions.'
      );
    }
  };

  // Stop the active stream when the component is unmounted.
  useEffect(() => {
    loadCameras();

    return () => {
      const video = webcamRef.current?.video;
      const stream = video?.srcObject;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStartCamera = async () => {
    setError(null);

    try {
      // Request permission first. This also makes device labels available.
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
      setError(
        'Camera access was denied or unavailable. Please allow camera permission for this site in Chrome and try again.'
      );
    }
  };

  const handleCameraReady = () => {
    setCameraStarting(false);
    setCameraRunning(true);
    setError(null);
  };

  const handleCameraError = (cameraError) => {
    console.error('Webcam error:', cameraError);

    setCameraStarting(false);
    setCameraRunning(false);
    setError(
      'The selected camera could not be opened. Try selecting another camera from the list.'
    );
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
    setError(null);
  };

  const handleCameraChange = (e) => {
    const newCameraId = e.target.value;

    // Stop current camera before switching devices.
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

  const handleCaptureImage = () => {
    if (!cameraRunning || !webcamRef.current) {
      setError('Start the camera and wait until it is running before capturing.');
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();

    if (!imageSrc) {
      setError('Could not capture an image from the camera.');
      return;
    }

    setError(null);
    setCapturedImage(imageSrc);
  };

  const handleAnalyzeCapturedImage = async () => {
    if (!capturedImage) {
      setError('Capture an image before analyzing it.');
      return;
    }

    setCapturedAnalyzing(true);
    setError(null);
    setCapturedResult(null);

    try {
      // Reuse the existing AI service. No second API request is created here.
      const data = await analyzeImage(capturedImage);
      setCapturedResult(data);
    } catch (err) {
      setError(
        err.message ||
          'An error occurred while analyzing the captured image.'
      );
    } finally {
      setCapturedAnalyzing(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
    setResult(null);

    const reader = new FileReader();

    reader.onload = () => {
      setSelectedImage(reader.result);
    };

    reader.onerror = () => {
      setError('Failed to read the selected file.');
    };

    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!selectedImage) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Existing AI integration is intentionally unchanged.
      const data = await analyzeImage(selectedImage);
      setResult(data);
    } catch (err) {
      setError(
        err.message ||
          'An error occurred while contacting the vision server.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        textAlign: 'left',
      }}
    >
      <h1>Ergonomics Vision Test</h1>

      <p style={{ marginBottom: '1.5rem', color: 'var(--text)' }}>
        Testing connection to local Unsloth Qwen3-VL API at{' '}
        <code>http://127.0.0.1:8888/v1</code>
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>LIVE CAMERA</h2>

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="camera-select"
            style={{
              display: 'block',
              marginBottom: '0.4rem',
              fontWeight: 600,
            }}
          >
            Camera Device
          </label>

          <select
            id="camera-select"
            value={selectedCameraId}
            onChange={handleCameraChange}
            disabled={cameraRunning || cameraStarting}
            style={{
              width: '100%',
              maxWidth: '640px',
              padding: '0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--background, #fff)',
              color: 'var(--text, #111)',
            }}
          >
            {cameras.length === 0 ? (
              <option value="">
                Click Start Camera to detect cameras
              </option>
            ) : (
              cameras.map((camera, index) => (
                <option
                  key={camera.deviceId}
                  value={camera.deviceId}
                >
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: '640px',
            aspectRatio: '16 / 9',
            backgroundColor: '#111',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {!cameraRunning && !cameraStarting && (
            <span style={{ color: '#aaa' }}>Camera is stopped</span>
          )}

          {cameraStarting && (
            <span style={{ color: '#aaa' }}>Starting camera...</span>
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
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
        </div>

        <p style={{ margin: '0.75rem 0', fontWeight: 600 }}>
          Camera status:{' '}
          <span
            style={{
              color: cameraRunning
                ? 'green'
                : cameraStarting
                  ? '#b8860b'
                  : 'inherit',
            }}
          >
            {cameraRunning
              ? 'Camera running'
              : cameraStarting
                ? 'Starting camera...'
                : 'Camera stopped'}
          </span>
        </p>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={handleStartCamera}
            disabled={cameraRunning || cameraStarting || !selectedCameraId}
            style={{
              padding: '0.7rem 1.2rem',
              cursor:
                cameraRunning || cameraStarting || !selectedCameraId
                  ? 'not-allowed'
                  : 'pointer',
              border: 'none',
              borderRadius: '6px',
            }}
          >
            {cameraStarting ? 'Starting...' : 'Start Camera'}
          </button>

          <button
            onClick={handleStopCamera}
            disabled={!cameraRunning && !cameraStarting}
            style={{
              padding: '0.7rem 1.2rem',
              cursor:
                !cameraRunning && !cameraStarting
                  ? 'not-allowed'
                  : 'pointer',
              border: 'none',
              borderRadius: '6px',
            }}
          >
            Stop Camera
          </button>

          <button
            onClick={handleCaptureImage}
            disabled={!cameraRunning}
            style={{
              padding: '0.7rem 1.2rem',
              cursor: !cameraRunning ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
            }}
          >
            Capture Image
          </button>
        </div>

        {capturedImage && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3>CAPTURED IMAGE</h3>

            <img
              src={capturedImage}
              alt="Latest captured frame"
              style={{
                maxWidth: '100%',
                maxHeight: '350px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}
            />

            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={handleAnalyzeCapturedImage}
                disabled={capturedAnalyzing}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  cursor: capturedAnalyzing ? 'not-allowed' : 'pointer',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                }}
              >
                {capturedAnalyzing
                  ? 'Analyzing image...'
                  : 'Analyze Captured Image'}
              </button>
            </div>

            {capturedAnalyzing && (
              <p style={{ marginTop: '0.75rem' }}>Analyzing image...</p>
            )}

            {capturedResult && (
              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '1.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--code-bg)',
                }}
              >
                <h3 style={{ marginTop: 0 }}>ERGONOMICS RESULTS</h3>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <strong>Person Visible</strong>
                    <div>
                      {capturedResult.person_visible === true
                        ? 'Yes'
                        : capturedResult.person_visible === false
                          ? 'No'
                          : 'Unknown'}
                    </div>
                  </div>

                  <div>
                    <strong>Sitting</strong>
                    <div>
                      {capturedResult.sitting === true
                        ? 'Yes'
                        : capturedResult.sitting === false
                          ? 'No'
                          : 'Unknown'}
                    </div>
                  </div>

                  <div>
                    <strong>Slouching</strong>
                    <div>
                      {capturedResult.slouching === true
                        ? 'Yes'
                        : capturedResult.slouching === false
                          ? 'No'
                          : 'Unknown'}
                    </div>
                  </div>

                  <div>
                    <strong>Head Position</strong>
                    <div>{capturedResult.head_position || 'Unknown'}</div>
                  </div>

                  <div>
                    <strong>Eyes</strong>
                    <div>{capturedResult.eyes || 'Unknown'}</div>
                  </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <strong>Description</strong>
                  <p style={{ marginBottom: 0 }}>
                    {capturedResult.description || 'No description returned.'}
                  </p>
                </div>

                <details style={{ marginTop: '1rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    Raw JSON (debugging)
                  </summary>
                  <pre
                    style={{
                      marginTop: '0.75rem',
                      overflowX: 'auto',
                      fontSize: '0.9rem',
                    }}
                  >
                    {JSON.stringify(capturedResult, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>IMAGE UPLOAD TEST</h2>

        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
          />
        </div>
      </section>

      {selectedImage && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3>Image Preview:</h3>

          <img
            src={selectedImage}
            alt="Preview"
            style={{
              maxWidth: '100%',
              maxHeight: '350px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          />

          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
              }}
            >
              {loading ? 'Analyzing Image...' : 'Analyze Image'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            border: '1px solid red',
            borderRadius: '6px',
            color: 'red',
            marginBottom: '1.5rem',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: 'var(--code-bg)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Analysis Output:</h2>

          <pre
            style={{
              margin: 0,
              overflowX: 'auto',
              fontSize: '0.95rem',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;