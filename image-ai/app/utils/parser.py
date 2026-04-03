import json
import re


def clean_json(text):
    # remove ```json and ```
    text = re.sub(r"```json|```", "", text)

    # extract only JSON block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group()

    return text.strip()


def parse_response(response_text):
    try:
        cleaned = clean_json(response_text)

        data = json.loads(cleaned)

        # clamp severity between 0–100
        data["severity_percentage"] = max(
            0, min(100, data.get("severity_percentage", 0))
        )

        return data

    except Exception as e:
        print("❌ JSON Parsing Failed:", e)
        print("Raw response:", response_text)
        return None