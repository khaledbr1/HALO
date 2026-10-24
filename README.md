# Halo ✦ (Desktop Circle to Search & Google AI Mode)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-33.2-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Groq LPU](https://img.shields.io/badge/Powered%20By-Groq%20LPU-f55036?logo=groq&logoColor=white)](https://groq.com/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-0078D6?logo=windows&logoColor=white)](https://www.microsoft.com/windows)

**Halo** brings Android's **Circle to Search** and **Google AI Mode** directly to your desktop. Press `Ctrl + Alt + Z` from any application, draw a glowing neon squircle around anything on your screen, and an authoritative, search-grounded Google AI Overview card instantly floats next to your selection.

Powered by **Groq LPU ultra-fast inference** (`qwen/qwen3.8-27b`), visual search analyses are generated in **~1.1 seconds**.

---

## 📸 Interface Preview

```text
  +-----------------------------------------------------------------------------------+
  |                                                                                   |
  |      [ Circled Screen Region ]            +------------------------------------+  |
  |     .-------------------------.           | ✦ AI Overview   [Groq Vision]   ✕ |  |
  |     |   Python 3.14 Release   | --------> |------------------------------------|  |
  |     |   * Feature 1           |           | Python 3.14 is the next major      |  |
  |     |   * Feature 2           |           | release of the Python programming  |  |
  |     '-------------------------'           | language, introducing...           |  |
  |       (Glowing Google Squircle)           |                                    |  |
  |                                           | • New JIT compiler optimizations   |  |
  |                                           | • Improved error diagnostics       |  |
  |                                           |                                    |  |
  |                                           | [Show more ∨]                      |  |
  |                                           |------------------------------------|  |
  |                                           | [Ask a follow up...] [📋] [🌐] [🔄]|  |
  |                                           +------------------------------------+  |
  |                                                                                   |
  +-----------------------------------------------------------------------------------+
```

---

## 🌟 Key Features

### 1. Global Activation & Shortcuts
| Trigger | Action |
|---|---|
| **`Ctrl + Alt + Z`** | Primary shortcut to activate Circle to Search |
| **`Ctrl + Shift + S`** | Alternative shortcut (if `Ctrl+Alt+Z` is bound to another tool) |
| **`Ctrl + Alt + H`** | Halo secondary shortcut |
| **System Tray Icon** | Click or double-click the Halo icon in your Windows taskbar |
| **`Escape`** | Instantly dismiss the overlay and reset selection |

### 2. Google Squircle Selection (`HTML5 Canvas`)
- Fluid selection drawing with Google's signature cyan-to-purple gradient (`#4285F4` → `#8AB4F8` → `#C084FC` → `#EC4899`).
- Dynamic corner radius (12px–24px) with translucent interior highlight wash and corner markers.

### 3. Ultra-Fast Multimodal AI Intelligence
- Integrated with Groq's multimodal vision model (`qwen/qwen3.8-27b`) running on high-speed LPUs.
- Automated image dimension padding to guarantee selections under 32px never trigger dimension constraint errors.
- Offline fallback pipeline using local OCR (`pytesseract`) and translation (`deep-translator`).

### 4. Anchored Google AI Overview Card (Dark Slate `#18191B`)
- **Smart Anchoring**: Automatically docks right next to your selection (`x = maxX + 16px, y = minY`) and flips to the left if near the screen edge.
- **Two-Column Layout**:
  - **Left Column**: Introductory synthesis, inline source pills, key bullet points, and an expandable "Show more ∨" drawer.
  - **Right Column**: Web source cards with live favicons, domain labels, titles, and search snippets.
- **Interactive Bottom Bar**:
  - `Ask a follow up...` input pill with instant multi-turn AI reasoning.
  - `[📋 Copy]`: Copies markdown summary to clipboard.
  - `[🌐 Translate]`: Instantly translates the summary.
  - `[🔄 Rescan]`: Resets the canvas for a new selection.

---

## 📁 Repository Structure

```
HALO/
├── assets/
│   ├── tray_icon.ico        # Native Windows taskbar tray icon
│   ├── tray_icon.png        # PNG tray icon
│   └── app_icon.png         # High-resolution application icon
├── python_backend/
│   ├── requirements.txt     # Python dependencies (groq, pillow, etc.)
│   ├── worker.py            # Persistent sidecar worker communicating over stdio JSON
│   ├── README.md            # Python worker protocol and documentation
│   └── services/
│       ├── ai_grounding.py  # Groq LPU Vision grounding & structured overview engine
│       └── ocr_fallback.py  # Offline local OCR and translation fallback
├── renderer/
│   ├── index.html           # Transparent overlay & AI Overview DOM layout
│   ├── styles.css           # Google AI Overview dark mode styling & shimmer effects
│   ├── canvas.js            # HTML5 glowing squircle selection & crop mechanics
│   └── card_renderer.js     # Anchoring math, UI populator & follow-up chat
├── main.js                  # Electron main process, screen capture, shortcuts & tray
├── preload.js               # Secure IPC context bridge
├── .env.example             # Template for API keys
├── .gitignore               # Ignored files (node_modules, .env, pycache, etc.)
├── package.json             # Node dependencies and scripts
└── kill_halo.ps1            # Utility script to cleanly stop background processes
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18 or higher ([Download Node.js](https://nodejs.org/))
- **Python**: 3.10 or higher ([Download Python](https://www.python.org/))
- **Groq API Key**: Get a free key from [Groq Console](https://console.groq.com/)

### 2. Clone the Repository
```bash
git clone https://github.com/khaledbr1/HALO.git
cd HALO
```

### 3. Install Dependencies
Install Node.js packages:
```bash
npm install
```

Install Python packages:
```bash
pip install -r python_backend/requirements.txt
```

### 4. Configure Your API Key
1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste your Groq API key:
   ```env
   GROQ_API_KEY=Groq api key here
   ```
   *(Replace `Groq api key here` with your actual key)*

### 5. Launch Halo
```bash
npm start
```

---

## 🎮 How to Use

1. Press **`Ctrl + Alt + Z`** (or click the Halo icon in your system tray).
2. The screen freezes with a subtle Google AI scrim.
3. Click and drag a rounded rectangle around any text, code, image, UI button, or object.
4. The **Google AI Overview** card immediately appears anchored next to your selection!
5. Ask follow-up questions, copy the summary, or click source cards to open live web results.
6. Press **`Esc`** or click outside the card to dismiss.

---

## 🛠️ Troubleshooting

- **`Access is denied (0x5)` / Cache errors**:
  Halo includes a single-instance lock. If multiple instances are running, run:
  ```powershell
  .\kill_halo.ps1
  ```
- **PowerShell script execution disabled**:
  If PowerShell blocks `npm`, run via `cmd`:
  ```cmd
  cmd /c npm start
  ```
- **Shortcut not responding**:
  Nvidia GeForce Experience or Radeon Software may occupy `Ctrl + Alt + Z`. Use **`Ctrl + Shift + S`**, **`Ctrl + Alt + H`**, or click the **System Tray icon**.

---

## 🛡️ License

This project is licensed under the [MIT License](LICENSE).
