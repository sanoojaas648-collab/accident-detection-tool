import requests
import base64
import json
import re
from config import GEMINI_API_KEY, GEMINI_MODEL


def analyze_with_gemini(image_bytes):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    prompt = """
    Analyze this image for a road accident.

    Return STRICT JSON:
    {
      "accident": true/false,
      "severity": "Low/Medium/High/Critical",
      "severity_percentage": number (0-100),
      "confidence": number (0-1),
      "explanation": "short reason"
    }

    Only return JSON. No markdown.
    """

    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_base64
                        }
                    }
                ]
            }
        ]
    }

    try:
        response = requests.post(url, json=body, timeout=10)
        data = response.json()

        # 🔍 debug
        print("Gemini Raw:", data)

        text = data["candidates"][0]["content"]["parts"][0]["text"]

        # ✅ CLEAN MARKDOWN (IMPORTANT)
        clean_text = re.sub(r"```json|```", "", text).strip()

        return json.loads(clean_text)

    except Exception as e:
        print("Gemini Error:", e)
        return None