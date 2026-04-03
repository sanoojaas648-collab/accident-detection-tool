from app.services.gemini_service import analyze_image
from app.utils.parser import parse_response
from app.services.severity import check_severity

from tkinter import Tk, filedialog
import cv2
import os


# 📂 Select image or video
def select_file():
    root = Tk()
    root.withdraw()
    root.attributes('-topmost', True)

    file_path = filedialog.askopenfilename(
        title="Select Image or Video",
        filetypes=[("Media Files", "*.jpg *.jpeg *.png *.mp4 *.avi *.mov")]
    )

    root.destroy()
    return file_path


# 🎥 Process video (optimized: 1 API call)
def process_video(video_path):
    print("🎥 Processing video (optimized)...")

    cap = cv2.VideoCapture(video_path)

    prev_frame = None
    best_frame = None
    max_diff = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if prev_frame is not None:
            diff = cv2.absdiff(prev_frame, gray)
            score = diff.sum()

            if score > max_diff:
                max_diff = score
                best_frame = frame

        prev_frame = gray

    cap.release()

    if best_frame is None:
        print("⚠️ No significant frame found")
        return None

    temp_path = "best_frame.jpg"
    cv2.imwrite(temp_path, best_frame)

    print("📸 Best frame selected")

    raw_response = analyze_image(temp_path)
    print("Raw Response:\n", raw_response, "\n")

    data = parse_response(raw_response)

    if os.path.exists(temp_path):
        os.remove(temp_path)

    return data


# 🚀 Main runner
def run():
    print("📸 Image / 🎥 Video Analysis Mode\n")

    file_path = select_file()

    if not file_path:
        print("❌ No file selected")
        return

    print(f"📂 Selected file: {file_path}")
    print("🔍 Analyzing...\n")

    try:
        if file_path.lower().endswith((".jpg", ".jpeg", ".png")):
            raw_response = analyze_image(file_path)
            print("Raw Response:\n", raw_response, "\n")

            data = parse_response(raw_response)

        elif file_path.lower().endswith((".mp4", ".avi", ".mov")):
            data = process_video(file_path)

        else:
            print("❌ Unsupported file")
            return

    except Exception as e:
        print("❌ Error:", e)
        return

    if not data:
        print("⚠️ Could not analyze")
        return

    result = check_severity(data)

    print("\nFinal Result:", result)


if __name__ == "__main__":
    run()