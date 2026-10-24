import io
from typing import Dict, Any, Optional
from PIL import Image

# Check pytesseract availability
try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False

# Check deep-translator availability
try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
except ImportError:
    TRANSLATOR_AVAILABLE = False


class OCRFallbackService:
    def __init__(self):
        pass

    def extract_text(self, image_bytes: bytes) -> str:
        """
        Performs local offline OCR on the cropped image buffer.
        """
        if not PYTESSERACT_AVAILABLE:
            return ""

        try:
            image = Image.open(io.BytesIO(image_bytes))
            # Convert to RGB if needed
            if image.mode != "RGB":
                image = image.convert("RGB")
            text = pytesseract.image_to_string(image)
            return text.strip()
        except Exception as e:
            # Tesseract binary might not be installed on host system PATH
            return ""

    def translate(self, text: str, target_lang: str = "en") -> str:
        """
        Translates text using deep-translator (Google Translator engine).
        """
        if not text.strip():
            return "No text to translate."

        if not TRANSLATOR_AVAILABLE:
            return f"[Translation unavailable] {text}"

        try:
            translated = GoogleTranslator(source="auto", target=target_lang).translate(text)
            return translated or text
        except Exception as e:
            return f"Translation error ({str(e)}): {text}"

    def synthesize_offline_overview(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Produces a structured AI Overview fallback when online Gemini grounding fails.
        """
        text = self.extract_text(image_bytes)
        
        if text:
            # We detected text
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            summary = f"**Extracted Text ({len(lines)} lines detected)**: {lines[0] if lines else text[:120]}"
            key_features = lines[1:6] if len(lines) > 1 else ["Text recognized via local optical character recognition engine."]
            extended_details = text
            sources = [{
                "title": "Local OCR Engine (pytesseract)",
                "url": "https://github.com/tesseract-ocr/tesseract",
                "domain": "offline-ocr",
                "snippet": "Local on-device text recognition",
                "favicon": "https://www.google.com/s2/favicons?domain=github.com&sz=64"
            }]
        else:
            summary = "**Offline Mode Active**: Could not reach Gemini Cloud API and no clear text was detected in the circled area."
            key_features = [
                "Ensure your network connection is active for Google Search Grounding.",
                "Verify your GEMINI_API_KEY environment variable if customized.",
                "Circle high-contrast text or clear subject areas for offline OCR."
            ]
            extended_details = "The Halo desktop client gracefully fell back to local diagnostics. Click [🔄 Rescan] to try circling another area."
            sources = []

        return {
            "status": "success",
            "engine": "pytesseract-fallback",
            "model": "local-fallback",
            "summary": summary,
            "key_features": key_features,
            "extended_details": extended_details,
            "sources": sources,
            "search_queries": ["offline fallback"],
            "raw_markdown": f"{summary}\n\n" + "\n".join(f"- {f}" for f in key_features) + f"\n\n{extended_details}"
        }
