# Ergonomics Vision Monitor

A computer ergonomics monitoring application that uses a webcam and local vision AI to analyze visible posture.

## 🚧 Project Status

**Current status:** Working prototype

The current version can:

* Upload an image for AI analysis
* Connect to a local Qwen3-VL vision API
* Access the laptop webcam
* Select an available camera device
* Show a live camera preview
* Capture a frame from the webcam
* Display the captured image
* Handle camera permission errors

## 🧠 AI System

The project uses:

* **Unsloth**
* **Qwen3-VL-4B-Instruct-GGUF**

The vision model runs through a local OpenAI-compatible API.

### Current API

```text
http://127.0.0.1:8888/v1/chat/completions
```

The React application sends uploaded images to the local vision API and receives an ergonomics analysis.

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
Capture Image
      ↓
Captured Image
```

The captured image is currently stored as a browser data URL.

**The captured webcam image is not automatically sent to the AI yet.**

## 🖥️ Technology Stack

* React
* Vite
* JavaScript
* react-webcam
* Unsloth
* Qwen3-VL

## 📁 Project Structure

```text
src/
├── services/
│   └── aiService.js
│
├── App.jsx
├── App.css
├── index.css
└── main.jsx

public/
```

## 🔐 Security

API tokens and other secrets should never be committed to GitHub.

The local AI API is currently intended for development and testing.

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

## 🛣️ Future Plans

Planned features include:

* Automatic camera-based analysis
* Periodic posture monitoring
* Ergonomics monitoring dashboard
* Posture history
* More detailed monitoring results
* Additional ergonomics features

## 📌 Current Development Approach

The project is being developed incrementally.

Each major feature is tested independently before being connected to the rest of the system.
