# Halo Python AI Sidecar Worker

This sub-package powers the AI intelligence for **Halo**. It runs as a persistent background process communicating with the Electron main process via newline-delimited JSON over `stdio` (stdin/stdout).

---

## ⚡ Core Engine

- **Primary Engine**: [Groq](https://groq.com/) Cloud LPU Multimodal Inference.
- **Vision Model**: `qwen/qwen3.8-27b` (Processes screenshots and returns structured JSON in ~1.1s).
- **Text Reasoning**: `qwen/qwen3.8-27b` and `openai/gpt-oss-120b` for multi-turn follow-up queries.
- **Offline Fallback**: `pytesseract` (Tesseract OCR) and `deep-translator`.

---

## 📁 Architecture

```
python_backend/
├── requirements.txt       # Dependencies: groq, pillow, pytesseract, deep-translator, python-dotenv
├── worker.py              # stdio JSON communication loop
└── services/
    ├── ai_grounding.py    # Groq API integration, image preparation & JSON schema parsing
    └── ocr_fallback.py    # Offline OCR extraction & machine translation
```

---

## 🔌 stdio JSON Protocol

The worker reads a single line of JSON from `stdin` and writes a response line to `stdout`:

### 1. `ping`
**Request:**
```json
{"id": "req-1", "action": "ping", "payload": {}}
```
**Response:**
```json
{"id": "req-1", "status": "success", "data": {"status": "pong", "engine": "groq"}}
```

### 2. `analyze` (Screen Crop Analysis)
**Request:**
```json
{
  "id": "req-2",
  "action": "analyze",
  "payload": {
    "image_base64": "<base64-encoded-png-bytes>"
  }
}
```
**Response:**
```json
{
  "id": "req-2",
  "status": "success",
  "data": {
    "status": "success",
    "engine": "groq",
    "model": "qwen/qwen3.8-27b (Groq LPU)",
    "title": "Identified Subject",
    "summary": "1-2 sentence core overview.",
    "key_features": ["Feature bullet 1", "Feature bullet 2"],
    "extended_details": "Comprehensive context...",
    "sources": [
      {
        "title": "Google Search: Subject",
        "url": "https://www.google.com/search?q=Subject",
        "domain": "google.com",
        "snippet": "Live web results...",
        "favicon": "https://www.google.com/s2/favicons?domain=google.com&sz=64"
      }
    ]
  }
}
```

### 3. `follow_up` (Multi-Turn Chat)
**Request:**
```json
{
  "id": "req-3",
  "action": "follow_up",
  "payload": {
    "context_summary": "Previous screen context...",
    "question": "What does this function return?"
  }
}
```

---

## 🧪 Testing Standalone

You can test the Python worker directly in the terminal without launching Electron:

```bash
# Install dependencies
pip install -r requirements.txt

# Run a test query over stdio
python -c "import subprocess, json; p = subprocess.Popen(['python', 'worker.py'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True); p.stdin.write(json.dumps({'id': 'test', 'action': 'ping'}) + '\n'); p.stdin.flush(); print(p.stdout.readline()); p.terminate()"
```
