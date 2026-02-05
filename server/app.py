from flask import Flask, request, jsonify
from flask_cors import CORS
from reviewer import review_text_openai
from dotenv import load_dotenv
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
    if not text.strip():
        return jsonify({"error": "Missing text"}), 400
    try:
        result = review_text_openai(text, lane, tone)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "Review failed", "details": str(e)}), 500
if __name__ == "__main__":
    app.run(debug=True, port=5000)
