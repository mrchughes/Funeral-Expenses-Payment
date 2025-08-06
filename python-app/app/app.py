from flask import Flask
from .intelligent_mapping import intelligent_mapping_bp
from .document_extraction import document_extraction_bp

app = Flask(__name__)

# Register blueprints
app.register_blueprint(intelligent_mapping_bp)
app.register_blueprint(document_extraction_bp)

@app.route("/")
def index():
    return "Hello from Python App! - Intelligent Mapping System Active"

@app.route("/health")
def health():
    return {"status": "healthy", "version": "1.0.1"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
