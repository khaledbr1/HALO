import sys
import json
import base64
import traceback
import os

# Ensure UTF-8 I/O encoding on Windows
if sys.platform == "win32":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Add parent directory to path to allow absolute imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from dotenv import load_dotenv

# Load .env file from project root
project_root = os.path.dirname(current_dir)
load_dotenv(os.path.join(project_root, ".env"))
load_dotenv()

from services.ai_grounding import GroqGroundingService
from services.ocr_fallback import OCRFallbackService

def log_err(msg: str):
    sys.stderr.write(f"[Halo Worker] {msg}\n")
    sys.stderr.flush()

def main():
    log_err("Starting Python AI Sidecar Worker (Powered by Groq LPUs)...")
    
    # Initialize services
    try:
        groq_service = GroqGroundingService()
        log_err("GroqGroundingService initialized with qwen/qwen3.8-27b vision model.")
    except Exception as e:
        groq_service = None
        log_err(f"Warning: GroqGroundingService init error: {e}")

    ocr_service = OCRFallbackService()
    log_err("OCRFallbackService initialized. Ready for JSON requests over stdio.")

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # EOF reached (Electron closed stdin)
                break

            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError as jde:
                log_err(f"JSON decode error: {jde}")
                continue

            req_id = request.get("id", "req-unknown")
            action = request.get("action", "analyze")
            payload = request.get("payload", {})

            response_data = None
            response_error = None

            if action == "ping":
                response_data = {"status": "pong", "engine": "groq"}

            elif action == "analyze":
                image_base64 = payload.get("image_base64") or payload.get("imageBase64") or ""
                custom_prompt = payload.get("prompt")
                
                if not image_base64:
                    response_error = f"Missing image_base64 in payload. Received keys: {list(payload.keys())}"
                else:
                    # Strip data URL header if present (e.g. data:image/png;base64,...)
                    if "," in image_base64:
                        image_base64 = image_base64.split(",", 1)[1]
                    
                    try:
                        image_bytes = base64.b64decode(image_base64)
                    except Exception as b64_err:
                        response_error = f"Invalid base64 image data: {b64_err}"
                        image_bytes = None

                    if image_bytes:
                        # Attempt Groq Grounding first
                        try:
                            if groq_service:
                                log_err("Analyzing image with Groq LPU Vision (qwen/qwen3.8-27b)...")
                                response_data = groq_service.analyze_image_with_search(image_bytes, custom_prompt)
                            else:
                                raise RuntimeError("Groq service unavailable")
                        except Exception as groq_err:
                            log_err(f"Groq vision failed ({groq_err}). Triggering local OCR fallback...")
                            # Fallback to local OCR + translator
                            try:
                                response_data = ocr_service.synthesize_offline_overview(image_bytes)
                                response_data["fallback_reason"] = str(groq_err)
                            except Exception as fallback_err:
                                response_error = f"Both Groq vision and OCR fallback failed: {fallback_err}"

            elif action == "follow_up":
                context_summary = payload.get("context_summary", "")
                question = payload.get("question", "")
                
                if not question:
                    response_error = "Missing question in follow-up payload"
                else:
                    try:
                        if groq_service:
                            response_data = groq_service.ask_follow_up(context_summary, question)
                        else:
                            raise RuntimeError("Groq service unavailable")
                    except Exception as err:
                        response_error = f"Follow up failed: {str(err)}"

            elif action == "translate":
                text = payload.get("text", "")
                target_lang = payload.get("target_lang", "en")
                try:
                    translated = ocr_service.translate(text, target_lang)
                    response_data = {"translated_text": translated, "target_lang": target_lang}
                except Exception as err:
                    response_error = f"Translation error: {str(err)}"

            else:
                response_error = f"Unknown action: {action}"

            # Format outgoing message
            if response_error:
                out_msg = {
                    "id": req_id,
                    "status": "error",
                    "message": response_error
                }
            else:
                out_msg = {
                    "id": req_id,
                    "status": "success",
                    "data": response_data
                }

            # Write single line JSON to stdout and flush immediately
            sys.stdout.write(json.dumps(out_msg, ensure_ascii=False) + "\n")
            sys.stdout.flush()

        except Exception as loop_err:
            log_err(f"Fatal worker loop exception: {traceback.format_exc()}")

if __name__ == "__main__":
    main()
