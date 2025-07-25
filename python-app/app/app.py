from flask import Flask
app = Flask(__name__)

@app.route("/")
def index():
    return "Hello from Python App! - Validation Fixes Complete"

@app.route("/health")
def health():
    return {"status": "healthy", "version": "1.0.1"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
