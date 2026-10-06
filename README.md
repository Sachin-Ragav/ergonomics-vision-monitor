# Ergonomics Vision Monitor

A computer ergonomics and focus monitoring application that uses a webcam and local vision AI to analyze visible posture, attention, and distraction-related signals.

The application is built with React and connects directly to a locally running Qwen3-VL vision model through Unsloth.

## 🚧 Project Status

**Current status:** Working prototype

The current version can:

* Upload an image for AI analysis
* Connect to a local Qwen3-VL vision API
* Access the laptop webcam
* Select an available camera device
* Show a live camera preview
* Capture frames from the webcam
* Automatically send captured webcam frames to the local AI
* Analyze webcam frames periodically
* Detect whether a person is visible
* Detect visible sitting posture
* Detect visible slouching
* Detect head position
* Detect visible eye state
* Detect a visible phone
* Detect whether the person appears to be looking away
* Display AI analysis results in the dashboard
* Maintain recent analysis history
* Provide posture and focus reminders
* Provide audible reminders
* Use alert cooldowns to avoid repeated notifications
* Run different monitoring modes
* Track a focus score
* Display a tired/fatigue indicator
* Run Focus Mode
* Run Study Mode
* Run Recovery Mode
* Start and stop monitoring sessions
* Display a session timer
* Support dark and light themes
* Provide a responsive interface for different screen sizes
* Handle camera permission errors
* Handle AI/API errors
* Analyze individual uploaded images for testing

> AI results are intended as productivity and ergonomic reminders, not medical or psychological diagnoses.

## 🧠 AI System

The project uses:

* **Unsloth**
* **Qwen3-VL-4B-Instruct-GGUF**
* **Q4_K_M quantization**

The vision model runs through a local OpenAI-compatible API.

### Current API

```text
http://127.0.0.1:8888/v1/chat/completions
```

The React application sends images to the local vision API and receives structured ergonomics and focus-related analysis.

A typical AI response contains information such as:

```json
{
  "person_visible": true,
  "sitting": true,
  "slouching": false,
  "head_position": "forward",
  "eyes": "open",
  "phone_visible": false,
  "looking_away": false,
  "fatigue_level": 18,
  "focus_level": 91,
  "confidence": 87,
  "description": "Person is seated and facing the screen with stable posture."
}
```

The exact result can vary depending on the image, lighting, camera angle, and model response.

## 📷 Webcam System

The application uses:

* **react-webcam**
* Browser camera APIs

The current camera flow is:

```text
Start Camera
      ↓
Select Camera
      ↓
Live Webcam Preview
      ↓
Capture Webcam Frame
      ↓
Send Frame to Local AI
      ↓
Receive JSON Analysis
      ↓
Update Dashboard
```

The application can periodically capture webcam frames while monitoring is active.

The captured image is converted into a browser data URL and sent to the local AI service for analysis.

## 🔄 Automatic Monitoring

When monitoring is enabled, the application periodically captures a webcam frame and sends it to the local Qwen3-VL model.

The general flow is:

```text
Webcam
   ↓
Capture Frame
   ↓
React
   ↓
aiService
   ↓
Local Unsloth API
   ↓
Qwen3-VL
   ↓
JSON Response
   ↓
Ergonomics / Focus Analysis
   ↓
Dashboard + Alerts
```

The current monitoring interval is approximately **10 seconds**.

The application also prevents overlapping AI analysis requests so that multiple webcam frames are not unnecessarily processed at the same time.

## 🎯 Monitoring Modes

### Focus Mode

Focus Mode is designed for focused work sessions.

It monitors visible signals such as:

* Looking away
* Eye state
* Phone visibility
* Posture
* Focus-related signals

When a distraction signal persists, the application can provide a visual or audible reminder.

### 📚 Study Mode

Study Mode is designed for study sessions and includes phone detection.

If a phone is visibly detected by the webcam, the application can display a reminder and optionally provide an audible alert.

Study Mode does **not** physically lock or control a separate mobile phone.

It only detects a visible phone and provides a reminder.

### 😌 Recovery Mode

Recovery Mode focuses more on break awareness and visible fatigue-related signals.

It can be used for shorter work/recovery sessions rather than continuous long-duration work.

## 🔊 Audible Reminders

The application can provide gentle audio reminders when certain conditions are detected.

Possible reminder events include:

* Posture reminder
* Focus drifting
* Phone detected
* High fatigue signal
* Session completion

A cooldown system prevents the same reminder from playing repeatedly in a short period.

Browser audio permissions may require the user to interact with the page before sound can be played.

## 😴 Tired Meter

The application includes a tired/fatigue indicator based on visible signals returned by the vision model.

The meter is intended as a **productivity/recovery indicator**.

It is not a medical measurement.

For example:

```text
Low
████░░░░░░

Moderate
██████░░░░

High
████████░░
```

The model may make mistakes depending on the camera angle, lighting, image quality, and visible information.

## 🎯 Focus Score

The dashboard provides a focus score based on visible signals returned by the AI.

Relevant signals can include:

* Head direction
* Eye state
* Looking away
* Phone visibility
* Posture
* Fatigue-related signals

The focus score is an application-level productivity estimate.

It does not determine a person's actual mental state or psychological condition.

## 🪑 Posture Monitoring

The AI can analyze visible sitting posture.

Current posture-related information includes:

* Whether a person is visible
* Whether the person is sitting
* Whether visible slouching is present
* Head position

The application can provide reminders when a visible posture issue is detected.

The system is intended for general ergonomic awareness rather than medical assessment.

## 📱 Phone Detection

Study Mode can use the vision model to detect whether a phone is visibly present in the camera frame.

Example:

```text
Phone not detected
       ↓
      ✓

Phone detected
       ↓
      ⚠
Reminder
```

This feature is intended to help reduce visible distractions during study sessions.

## 👀 Attention Signals

The application can use visible camera signals such as:

* Head position
* Eye state
* Looking away

to estimate whether attention may be drifting.

Looking away does not necessarily mean that someone is distracted, so the results should be treated as approximate visual signals.

## ⏱️ Session System

The application supports monitoring sessions with:

* Session timer
* Start session
* End session
* Active monitoring state
* Selected monitoring mode
* Session completion reminder

Different modes can use different session durations.

## 📊 Analysis History

The application keeps recent analysis results during the current application session.

The history can contain information such as:

* Timestamp
* Posture state
* Eye state
* Focus level
* Fatigue level
* Phone visibility
* Looking-away state
* AI description

This allows the dashboard to show recent monitoring activity instead of only the latest AI result.

## 🔔 Smart Alerts

The application uses an alert cooldown system to avoid repeatedly notifying the user about the same condition.

Example:

```text
Slouching detected
       ↓
Posture reminder
       ↓
Cooldown
       ↓
Repeated slouching
       ↓
No immediate repeated alert
```

Alerts can also be dismissed from the application.

## 🌓 Dark and Light Theme

The interface supports:

* **Dark theme**
* **Light theme**

The theme is designed to make the dashboard comfortable to use during different environments and times of day.

## 📱 Responsive Interface

The interface is designed to adapt to different screen sizes.

The dashboard supports:

* Desktop screens
* Laptop screens
* Smaller browser windows
* Narrow displays

The layout automatically adjusts the camera area, metrics, monitoring controls, alerts, and history.

## 🧪 Image Analysis

The application also supports testing individual images.

A user can provide an image and send it to the local vision model without starting continuous webcam monitoring.

This is useful for:

* Testing the AI
* Testing JSON responses
* Debugging
* Experimenting with different camera images
* Verifying model behavior

## 🖥️ Technology Stack

### Frontend

* React
* Vite
* JavaScript
* CSS
* react-webcam
* Browser Web APIs

### AI

* Unsloth
* Qwen3-VL
* GGUF
* Q4_K_M

### Communication

* JavaScript `fetch()`
* OpenAI-compatible local API
* JSON

No separate Express backend is required for the current architecture.

## 📁 Project Structure

```text
src/

├── services/
│   ├── aiService.js
│   └── App_webcam_ai_analysis.js
│
├── App.jsx
├── App.css
├── index.css
└── main.jsx

public/

package.json
package-lock.json
vite.config.js
README.md
```

### Service Files

#### `aiService.js`

Handles communication between the React application and the local Unsloth/Qwen3-VL API.

It is responsible for sending images to the AI and processing the returned response.

#### `App_webcam_ai_analysis.js`

Contains the webcam/AI analysis functionality used as part of the application's development and testing workflow.

It is kept separately inside the services directory so that webcam-related AI analysis logic can be maintained independently from the main application UI.

## 🔐 Privacy & Security

The project is designed around local AI processing.

The intended architecture is:

```text
Webcam
   ↓
React Application
   ↓
Local API
   ↓
Local Qwen3-VL Model
   ↓
React Dashboard
```

The project does not require a cloud AI API for the current implementation.

No Firebase backend is required.

No external AI server is required.

No API keys are required for the local Unsloth API.

### Important

API tokens, passwords, credentials, and other secrets should never be committed to GitHub.

The local AI API is currently intended for development and testing.

Camera access is controlled by the browser and operating system permissions.

## ⚙️ Requirements

The project requires:

* Node.js
* npm
* Git
* A modern web browser
* Unsloth
* A compatible Qwen3-VL multimodal model
* A webcam for live monitoring

The current development system uses an NVIDIA RTX 3050 Laptop GPU with 6 GB VRAM.

Hardware requirements may vary depending on the selected AI model and quantization.

## 🚀 Running the Project

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The application will then be available through the local Vite development server.

Before using AI analysis, make sure Unsloth is running and the Qwen3-VL model is loaded.

The local API should be available at:

```text
http://127.0.0.1:8888/v1
```

## 🤖 Running the AI

1. Open Unsloth.
2. Load the Qwen3-VL model.
3. Make sure the model status is ready.
4. Confirm the local API is running.
5. Start the React application.
6. Allow webcam access.
7. Start monitoring.

The React application communicates with the local AI using the OpenAI-compatible chat completions endpoint.

## ⚠️ Limitations

The AI analysis is based only on what is visible in individual webcam frames.

Accuracy can be affected by:

* Poor lighting
* Camera angle
* Low image quality
* Occlusion
* Distance from the camera
* Multiple people
* Objects blocking the face or body
* Model limitations

The application should therefore be treated as a **productivity and ergonomic reminder system**, not as a medical, psychological, or scientific measurement system.

The focus and fatigue values are estimates based on visible signals and should not be interpreted as measurements of a person's actual mental state.

## 🛣️ Future Plans

Planned improvements include:

* More accurate temporal focus analysis
* Improved fatigue estimation
* Better posture analysis
* More detailed session analytics
* Focus trends
* Productivity graphs
* Weekly reports
* Custom session durations
* Custom alert sounds
* Improved phone detection
* Better camera calibration
* More advanced ergonomic analysis
* Additional monitoring modes
* Improved AI prompt engineering
* Model selection options
* More detailed history
* Better long-term productivity insights

## 📌 Current Development Approach

The project is being developed incrementally.

Each major feature is tested independently before being connected to the rest of the application.

The development process currently follows:

```text
AI Model Testing
      ↓
Local API Testing
      ↓
Image Analysis
      ↓
React Integration
      ↓
Webcam Integration
      ↓
Automatic Analysis
      ↓
Monitoring Dashboard
      ↓
Focus & Productivity Features
      ↓
UI Refinement
```

This approach makes it easier to identify problems at each stage while building the application.

## 🎯 Project Goal

The long-term goal of the project is to create a local AI-powered computer companion that can help users maintain better work habits through simple, timely, and privacy-focused feedback.

Instead of only measuring how long someone works, the project explores whether local vision AI can provide useful reminders about visible posture, distractions, focus signals, and recovery.

**Ergonomics Vision Monitor — work better, not just longer.**
