import argparse
import json
import mimetypes
import os
import re
import sys
import tempfile
from pathlib import Path

import cv2

from app.services.gemini_service import analyze_image as gemini_analyze_image


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def clean_json(text):
    if not text:
        return ""

    text = re.sub(r"```json|```", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0).strip() if match else text.strip()


def parse_response(response_text):
    try:
        cleaned = clean_json(response_text)
        data = json.loads(cleaned)
    except Exception:
        return None

    try:
        data["severity_percentage"] = int(clamp(float(data.get("severity_percentage", 0)), 0, 100))
    except Exception:
        data["severity_percentage"] = 0

    data["accident"] = bool(data.get("accident", False))
    data["level"] = str(data.get("level") or "").strip()
    return data


def derive_level(accident, severity_percentage):
    if not accident:
        return "No Accident"
    if severity_percentage >= 85:
        return "Severe"
    if severity_percentage >= 60:
        return "Serious"
    if severity_percentage >= 35:
        return "Moderate"
    return "Minor"


def map_severity_label(accident, severity_percentage, level):
    normalized_level = str(level or "").strip().lower()

    if not accident:
        return "Low"
    if normalized_level == "severe" or severity_percentage >= 85:
        return "Critical"
    if normalized_level == "serious" or severity_percentage >= 60:
        return "High"
    if normalized_level == "moderate" or severity_percentage >= 35:
        return "Medium"
    return "Low"


def build_summary(accident, level, media_kind, provider):
    target = "uploaded video frame" if media_kind == "video" else "uploaded image"
    provider_note = "using image-ai Gemini analysis" if provider == "image-ai:gemini" else "using image-ai fallback heuristics"

    if accident:
        return f"{level} accident cues detected in the {target} {provider_note}."
    return f"No clear accident cues detected in the {target} {provider_note}."


def heuristic_analysis(image_path):
    image = cv2.imread(image_path)
    if image is None:
        raise RuntimeError("Could not read uploaded image")

    resized = cv2.resize(image, (224, 224))
    grayscale = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(grayscale, 80, 160)

    contrast = float(grayscale.std()) / 64.0
    edge_density = float(edges.mean()) / 255.0
    blue_channel, green_channel, red_channel = cv2.split(resized)
    red_strength = clamp((float(red_channel.mean()) - max(float(green_channel.mean()), float(blue_channel.mean()))) / 255.0, 0.0, 1.0)
    brightness = float(grayscale.mean()) / 255.0

    severity_score = (
        edge_density * 0.45
        + contrast * 0.30
        + red_strength * 0.20
        + (0.15 if brightness < 0.35 else 0.0)
    )
    severity_score = clamp(severity_score, 0.0, 1.0)
    accident = severity_score >= 0.28
    severity_percentage = int(round(severity_score * 100))

    return {
        "accident": accident,
        "severity_percentage": severity_percentage,
        "level": derive_level(accident, severity_percentage),
    }


def normalize_analysis(parsed, provider, filename, media_kind, signals=None):
    accident = bool(parsed.get("accident", False))
    severity_percentage = int(clamp(float(parsed.get("severity_percentage", 0)), 0, 100))
    level = parsed.get("level") or derive_level(accident, severity_percentage)
    severity = map_severity_label(accident, severity_percentage, level)

    if accident:
        confidence_score = round(clamp(0.8 + (severity_percentage / 100.0) * 0.18, 0.8, 0.98), 2)
    else:
        confidence_score = 0.58

    analysis_signals = {
        "mediaKind": media_kind,
        "level": level,
        "severityPercentage": severity_percentage,
    }
    if signals:
        analysis_signals.update(signals)

    return {
        "provider": provider,
        "accidentDetected": accident,
        "severity": severity,
        "severityPercentage": severity_percentage,
        "confidenceScore": confidence_score,
        "summary": build_summary(accident, level, media_kind, provider),
        "signals": analysis_signals,
        "filename": filename,
    }


def infer_mime_type(file_path, provided_mime_type):
    return provided_mime_type or mimetypes.guess_type(file_path)[0] or "application/octet-stream"


def extract_video_frame(video_path):
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise RuntimeError("Could not open uploaded video")

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    sample_step = max(1, total_frames // 180) if total_frames > 0 else 5

    frame_number = -1
    sampled_frames = 0
    best_frame = None
    best_frame_index = 0
    best_score = -1.0
    first_frame = None
    previous_gray = None

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        frame_number += 1
        if frame_number % sample_step != 0:
            continue

        sampled_frames += 1
        if first_frame is None:
            first_frame = frame.copy()

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if previous_gray is not None:
            difference = cv2.absdiff(previous_gray, gray)
            score = float(difference.sum())
            if score > best_score:
                best_score = score
                best_frame = frame.copy()
                best_frame_index = frame_number
        previous_gray = gray

    capture.release()

    selected_frame = best_frame if best_frame is not None else first_frame
    if selected_frame is None:
        raise RuntimeError("No readable video frame was found")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
        temp_path = temp_file.name

    if not cv2.imwrite(temp_path, selected_frame):
        raise RuntimeError("Could not export a frame from the uploaded video")

    return temp_path, {
        "selectedFrameIndex": best_frame_index,
        "sampledFrames": sampled_frames,
        "sampleStep": sample_step,
        "totalFrames": total_frames,
    }


def analyze_image_file(image_path, mime_type, media_kind, filename, extra_signals=None):
    provider = "image-ai:heuristic"
    parsed = None

    force_heuristic = str(os.getenv("IMAGE_AI_FORCE_HEURISTIC", "")).strip().lower() in {"1", "true", "yes"}
    if not force_heuristic:
        try:
            response_text = gemini_analyze_image(image_path, mime_type=mime_type)
            parsed = parse_response(response_text)
            if parsed:
                provider = "image-ai:gemini"
        except Exception:
            parsed = None

    if not parsed:
        parsed = heuristic_analysis(image_path)

    return normalize_analysis(parsed, provider, filename, media_kind, extra_signals)


def run(file_path, mime_type):
    resolved_mime_type = infer_mime_type(file_path, mime_type)
    file_name = Path(file_path).name

    if resolved_mime_type.startswith("video/"):
        frame_path = None
        try:
            frame_path, frame_signals = extract_video_frame(file_path)
            return analyze_image_file(frame_path, "image/jpeg", "video", file_name, frame_signals)
        finally:
            if frame_path:
                Path(frame_path).unlink(missing_ok=True)

    return analyze_image_file(file_path, resolved_mime_type, "image", file_name)


def main():
    parser = argparse.ArgumentParser(description="Analyze citizen report image or video with image-ai.")
    parser.add_argument("--file", required=True, help="Absolute path to the uploaded image or video file")
    parser.add_argument("--mime-type", default="", help="Optional MIME type from the uploader")
    args = parser.parse_args()

    analysis = run(args.file, args.mime_type.strip())
    print(json.dumps({"success": True, "analysis": analysis}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write(json.dumps({"success": False, "message": str(exc)}) + "\n")
        sys.exit(1)
