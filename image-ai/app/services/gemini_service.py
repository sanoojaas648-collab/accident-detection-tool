import mimetypes

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, MODEL_NAME

# initialize client
client = genai.Client(api_key=GEMINI_API_KEY)

PROMPT = """
You are an AI system that detects road accidents.

STRICT RULES:
- If NO accident → accident=false, severity=0
- Do NOT assume accident
- Only detect real damage

Return ONLY JSON:

{
  "accident": true/false,
  "severity_percentage": number,
  "level": "No Accident | Minor | Moderate | Serious | Severe"
}
"""


def analyze_image(image_path, mime_type=None):
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        resolved_mime_type = mime_type or mimetypes.guess_type(image_path)[0] or "image/jpeg"

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                PROMPT,
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=resolved_mime_type
                ),
            ],
        )

        return response.text

    except Exception as e:
        return f"❌ Error: {e}"
