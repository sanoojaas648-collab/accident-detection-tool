from app.config import SEVERITY_THRESHOLD


def check_severity(data):
    if not data:
        return "Invalid response"

    accident = data.get("accident", False)
    severity = data.get("severity_percentage", 0)

    print(f"Severity: {severity}%")

    # ✅ If no accident → ignore
    if not accident:
        print("🚫 No accident detected")
        return "✅ No Accident"

    # ✅ Alert logic
    if severity > SEVERITY_THRESHOLD:
        return "🚨 HIGH ALERT"
    else:
        return "⚠️ Moderate / Monitor"