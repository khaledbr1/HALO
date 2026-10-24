import os
import re
import io
import json
import base64
import urllib.parse
from typing import Dict, Any, List, Optional
from PIL import Image
from groq import Groq
from dotenv import load_dotenv

# Load from project root .env
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
load_dotenv(os.path.join(project_root, ".env"))
load_dotenv()

# Fallback Groq API Key
DEFAULT_GROQ_API_KEY = "Groq api key here"

class GroqGroundingService:
    def __init__(self, api_key: Optional[str] = None):
        raw_key = api_key or os.environ.get("GROQ_API_KEY") or DEFAULT_GROQ_API_KEY
        if not raw_key or raw_key.strip() == "Groq api key here":
            self.api_key = ""
            self.client = None
        else:
            self.api_key = raw_key
            self.client = Groq(api_key=self.api_key)
        # qwen/qwen3.8-27b is the fastest and best multimodal vision model on Groq free tier
        self.vision_model = "qwen/qwen3.8-27b"
        # Reasoning models for text / follow-ups
        self.text_models = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]

    def _prepare_image(self, image_bytes: bytes) -> str:
        """
        Validates and ensures the image meets Groq's minimum dimension requirement (>= 32x32).
        Returns base64 encoded string.
        """
        try:
            img = Image.open(io.BytesIO(image_bytes))
            # If smaller than 64px in either dimension, upscale/pad with background
            if img.width < 64 or img.height < 64:
                target_w = max(img.width, 64)
                target_h = max(img.height, 64)
                # Maintain color mode
                mode = "RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB"
                pad_color = (0, 0, 0, 0) if mode == "RGBA" else (24, 25, 27)
                padded = Image.new(mode, (target_w, target_h), pad_color)
                offset_x = (target_w - img.width) // 2
                offset_y = (target_h - img.height) // 2
                padded.paste(img, (offset_x, offset_y))
                buf = io.BytesIO()
                padded.save(buf, format="PNG")
                image_bytes = buf.getvalue()
        except Exception as e:
            # If PIL fails to process, use original bytes
            pass

        return base64.b64encode(image_bytes).decode("utf-8")

    def analyze_image_with_search(self, image_bytes: bytes, custom_prompt: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyzes a cropped screen region using Groq's multimodal vision LPU engine.
        Returns a structured Google AI Overview response in under ~1 second.
        """
        if not self.client:
            raise RuntimeError("Groq API key not configured. Please add GROQ_API_KEY=your_key in your .env file.")

        b64_image = self._prepare_image(image_bytes)

        system_prompt = (
            "You are the visual search intelligence for 'Halo', a desktop Circle to Search & Google AI Mode application.\n"
            "The user drew a selection ring around an area on their computer screen.\n"
            "Analyze the image accurately and thoroughly.\n\n"
            "Identify what is shown: whether it is text, a UI element, code, diagram, formula, physical object, "
            "product, person, animal, error message, or scenery.\n\n"
            "You MUST respond ONLY with a valid JSON object matching this schema:\n"
            "{\n"
            '  "title": "Concise 2-5 word title identifying the subject",\n'
            '  "summary": "1-2 bold, crystal-clear sentences giving the definitive answer, identity, or meaning",\n'
            '  "key_features": ["3-5 high-readability bullet points highlighting key traits, explanation, specs, or context"],\n'
            '  "extended_details": "1-2 comprehensive paragraphs providing deeper technical context, background, solution, or actionable next steps",\n'
            '  "search_query": "The ideal Google search query to find more info or verify this subject",\n'
            '  "suggested_sources": [\n'
            '     {"title": "Page or site title", "domain": "domain.com", "snippet": "Why this source is relevant"}\n'
            '  ]\n'
            "}"
        )

        user_content = [
            {
                "type": "text", 
                "text": custom_prompt or "Analyze this cropped screen region and return the Google AI Overview JSON."
            },
            {
                "type": "image_url", 
                "image_url": {
                    "url": f"data:image/png;base64,{b64_image}"
                }
            }
        ]

        try:
            completion = self.client.chat.completions.create(
                model=self.vision_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=900
            )
            raw_json = completion.choices[0].message.content
            parsed = json.loads(raw_json)
        except Exception as groq_err:
            raise RuntimeError(f"Groq Vision analysis failed: {groq_err}")

        # Extract fields
        title = parsed.get("title", "Visual Overview")
        summary = parsed.get("summary", "Analysis complete.")
        key_features = parsed.get("key_features", [])
        extended_details = parsed.get("extended_details", "")
        search_query = parsed.get("search_query", title)
        suggested_sources = parsed.get("suggested_sources", [])

        # Build grounded search sources
        sources = self._build_grounded_sources(search_query, title, suggested_sources)

        raw_markdown = f"### {title}\n\n{summary}\n\n"
        if key_features:
            raw_markdown += "\n".join([f"- {f}" for f in key_features]) + "\n\n"
        if extended_details:
            raw_markdown += f"{extended_details}\n"

        return {
            "status": "success",
            "engine": "groq",
            "model": f"{self.vision_model} (Groq LPU)",
            "title": title,
            "summary": summary,
            "key_features": key_features,
            "extended_details": extended_details,
            "sources": sources,
            "search_queries": [search_query],
            "raw_markdown": raw_markdown
        }

    def ask_follow_up(self, context_summary: str, question: str, previous_queries: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Answers a follow-up query with ultra-fast Groq LPU reasoning.
        """
        if not self.client:
            raise RuntimeError("Groq API key not configured. Please add GROQ_API_KEY=your_key in your .env file.")

        system_prompt = (
            "You are Halo's AI assistant answering a follow-up question regarding a previously circled screen selection.\n"
            "Format your answer as a clean, structured Google AI Overview JSON object with:\n"
            "{\n"
            '  "summary": "1-2 bold, direct sentences answering the question directly",\n'
            '  "key_features": ["2-4 bullet points highlighting key details, steps, or facts"],\n'
            '  "extended_details": "1 paragraph of additional depth or context",\n'
            '  "search_query": "Suggested query to explore further"\n'
            "}"
        )

        user_prompt = (
            f"Screen Context:\n{context_summary}\n\n"
            f"User Question:\n{question}"
        )

        last_error = None
        for model in self.text_models:
            try:
                completion = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=600
                )
                data = json.loads(completion.choices[0].message.content)
                summary = data.get("summary", "")
                key_features = data.get("key_features", [])
                extended_details = data.get("extended_details", "")
                search_query = data.get("search_query", question)

                sources = self._build_grounded_sources(search_query, search_query, [])

                return {
                    "status": "success",
                    "engine": "groq",
                    "model": f"{model} (Groq)",
                    "summary": summary,
                    "key_features": key_features,
                    "extended_details": extended_details,
                    "sources": sources,
                    "search_queries": [search_query]
                }
            except Exception as e:
                last_error = e
                continue

        raise RuntimeError(f"Groq follow-up failed on all models: {last_error}")

    def _build_grounded_sources(self, query: str, title: str, suggestions: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        Creates clickable Google search and verified web reference cards.
        """
        sources: List[Dict[str, str]] = []
        clean_q = re.sub(r"[^\w\s]", "", query).strip()
        encoded_q = urllib.parse.quote_plus(clean_q or title or "search")

        # 1. Primary Google Search Grounding Card
        sources.append({
            "title": f"Google Search: {clean_q[:35]}",
            "url": f"https://www.google.com/search?q={encoded_q}",
            "domain": "google.com",
            "snippet": f"Explore live web results, articles, and knowledge panel for '{clean_q[:40]}'",
            "favicon": "https://www.google.com/s2/favicons?domain=google.com&sz=64"
        })

        # 2. Suggested authoritative sources from Groq
        for sug in suggestions:
            dom = sug.get("domain", "").strip().lower()
            if not dom:
                continue
            dom_clean = dom.replace("https://", "").replace("http://", "").split("/")[0]
            sug_url = f"https://www.google.com/search?q=site%3A{dom_clean}+{encoded_q}"
            sources.append({
                "title": sug.get("title") or f"Reference on {dom_clean}",
                "url": sug_url,
                "domain": dom_clean,
                "snippet": sug.get("snippet") or f"Relevant topic reference on {dom_clean}",
                "favicon": f"https://www.google.com/s2/favicons?domain={dom_clean}&sz=64"
            })

        # 3. If no suggestions, add Wikipedia/Docs search link
        if len(sources) < 2:
            sources.append({
                "title": f"Wikipedia / Reference: {clean_q[:30]}",
                "url": f"https://en.wikipedia.org/w/index.php?search={encoded_q}",
                "domain": "wikipedia.org",
                "snippet": "Check encyclopedia and authoritative documentation",
                "favicon": "https://www.google.com/s2/favicons?domain=wikipedia.org&sz=64"
            })

        return sources

# Alias for backward compatibility if imported elsewhere
GeminiGroundingService = GroqGroundingService
