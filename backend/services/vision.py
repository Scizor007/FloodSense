import base64
import json
import logging
import re
from io import BytesIO
from typing import Any, Dict, Optional, Union
import httpx
from PIL import Image

try:
    from backend.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("floodsense.services.vision")

VERIFICATION_PROMPT = """
You are an expert flood damage and urban waterlogging assessment vision model for FloodSense Hyderabad.
Analyze this image carefully to determine if it shows visible evidence of urban flooding, waterlogging, inundated streets, or standing water on roads/infrastructure.

You MUST respond ONLY with a valid JSON object with these exact keys:
{
  "flood_detected": true or false,
  "confidence": float between 0.0 and 1.0,
  "severity": "low" or "moderate" or "high" or "severe",
  "explanation": "concise description of visible waterlogging evidence and road conditions",
  "image_usable": true or false
}

Rules:
1. flood_detected: Set to true ONLY if there is visible evidence of waterlogging, street pooling, submerged roads, or active flood water. Set to false if roads are dry, normal weather/traffic, indoor scenes, or non-flood subjects.
2. confidence: Float between 0.0 and 1.0 indicating your assessment certainty.
3. severity: Evidence-based visual severity:
   - "low": Shallow curb puddles, minor roadside pooling, traffic moving without disruption.
   - "moderate": Substantial water covering portions of lanes, water reaching tire treads.
   - "high": Water covering entire roadway, submerging wheel hubs or sidewalk curbs, traffic slowed or diverted.
   - "severe": Deep inundation, submerged vehicles, flooded underpasses, impassable torrents.
   If flood_detected is false, set severity to "low".
4. explanation: 1-2 sentences summarizing visual evidence (e.g., "Standing water is visibly covering a substantial portion of the roadway.").
5. image_usable: Set to false if the image is too blurry, completely dark, corrupt, or an unrelated screenshot/meme. Otherwise true.
Do NOT attempt to guess an exact millimeter/centimeter physical water depth; focus on visible flooding evidence.
"""


async def fetch_image_bytes(image_input: Union[str, bytes]) -> tuple[bytes, str]:
    """Extract raw image bytes and mime type from URL, data URI, or raw bytes."""
    if isinstance(image_input, bytes):
        return image_input, "image/jpeg"

    if isinstance(image_input, str):
        # Base64 data URI
        if image_input.startswith("data:image/"):
            header, base64_data = image_input.split(",", 1)
            mime_match = re.search(r"data:(image/\w+);", header)
            mime_type = mime_match.group(1) if mime_match else "image/jpeg"
            return base64.b64decode(base64_data), mime_type

        # HTTP/HTTPS URL
        if image_input.startswith("http://") or image_input.startswith("https://"):
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(image_input)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "image/jpeg")
                return resp.content, content_type.split(";")[0]

    raise ValueError("Invalid image input format. Expected HTTP URL, data URI, or raw bytes.")


def _parse_gemini_json(raw_text: str) -> Optional[Dict[str, Any]]:
    """Safely extract and parse JSON from Gemini output, handling code fences."""
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError as err:
        logger.warning(f"Failed to parse Gemini output as JSON: {err}. Raw text: {raw_text[:200]}")
    return None


async def verify_flood_photo(image_input: Optional[Union[str, bytes]]) -> Dict[str, Any]:
    """
    Verify citizen flood photograph using Google Gemini Multimodal Vision API.

    Returns:
        {
            "flood_detected": bool,
            "confidence": float (0.0 to 1.0),
            "severity": str ("low" | "moderate" | "high" | "severe"),
            "explanation": str,
            "image_usable": bool,
            "provider": str ("gemini" | "unconfigured" | "error" | "none")
        }
    """
    if not image_input:
        return {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": "No image provided with report.",
            "image_usable": False,
            "provider": "none",
        }

    try:
        img_bytes, mime_type = await fetch_image_bytes(image_input)
    except Exception as e:
        logger.error(f"Failed to load image for flood verification: {e}")
        return {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": f"Unable to read or decode image file: {str(e)}",
            "image_usable": False,
            "provider": "error",
        }

    # Verify image integrity via PIL
    try:
        with Image.open(BytesIO(img_bytes)) as pil_img:
            pil_img.verify()
    except Exception as e:
        logger.warning(f"Image corrupt or unreadable: {e}")
        return {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": "Uploaded image file appears corrupt or unreadable.",
            "image_usable": False,
            "provider": "error",
        }

    api_key = settings.GEMINI_API_KEY.strip()
    if not api_key:
        logger.warning("GEMINI_API_KEY is not set in environment. Storing unverified report for authority triage.")
        return {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": "Gemini API key is not configured in backend/.env. Report queued for manual authority review.",
            "image_usable": True,
            "provider": "unconfigured",
        }

    # Call Gemini Multimodal API using google-genai
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Configurable model with fallbacks
        primary_model = settings.GEMINI_MODEL or "gemini-2.5-flash"
        fallback_models = [m for m in [primary_model, "gemini-2.5-flash", "gemini-1.5-flash"] if m]
        # Deduplicate while preserving order
        models_to_try = list(dict.fromkeys(fallback_models))
        last_error = None

        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=img_bytes, mime_type=mime_type),
                        VERIFICATION_PROMPT,
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                )
                if response and response.text:
                    parsed = _parse_gemini_json(response.text)
                    if parsed is not None:
                        flood_detected = bool(parsed.get("flood_detected", False))
                        confidence = round(float(parsed.get("confidence", 0.85 if flood_detected else 0.5)), 2)
                        confidence = max(0.0, min(1.0, confidence))
                        severity = str(parsed.get("severity", "moderate")).lower()
                        if severity not in ["low", "moderate", "high", "severe"]:
                            severity = "moderate"
                        explanation = str(parsed.get(
                            "explanation",
                            "Visible waterlogging detected on roadway." if flood_detected else "No active street waterlogging observed."
                        ))
                        image_usable = bool(parsed.get("image_usable", True))

                        return {
                            "flood_detected": flood_detected,
                            "confidence": confidence,
                            "severity": severity,
                            "explanation": explanation,
                            "image_usable": image_usable,
                            "provider": f"gemini ({model_name})",
                        }
            except Exception as exc:
                last_error = exc
                logger.warning(f"Gemini call with {model_name} failed: {exc}. Trying next model...")

        logger.error(f"All Gemini models failed: {last_error}.")
        return {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": f"AI vision verification temporarily unavailable. Queued for authority review.",
            "image_usable": True,
            "provider": "error",
        }

    except Exception as e:
        logger.error(f"Gemini Vision API error: {e}")
        return {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": f"AI vision verification failed: {str(e)}. Queued for authority review.",
            "image_usable": True,
            "provider": "error",
        }
