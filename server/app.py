from flask import Flask, request, jsonify
from flask_cors import CORS
from reviewer import review_text_openai
from dotenv import load_dotenv
import traceback
load_dotenv()
app = Flask(__name__)
CORS(app)
@app.route("/health")
def health():
    return jsonify({"ok": True})
@app.route("/api/review", methods=["POST"])
def review():
    data = request.get_json(force=True)
    text = data.get("text", "")
    lane = data.get("lane", "SWE")
    tone = data.get("tone", "confident")
    action = data.get("action", "")
    follow_up = data.get("follow_up", "")
    previous_rewrite = data.get("previous_rewrite", "")
    if not text.strip():
        return jsonify({"error": "Missing text"}), 400
    try:
        result = review_text_openai(
            text,
            lane,
            tone,
            action=action,
            follow_up=follow_up,
            previous_rewrite=previous_rewrite,
        )
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Review failed", "details": str(e)}), 500
if __name__ == "__main__":
    app.run(debug=True, port=5000)
