from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS # Import CORS
from datetime import datetime
import os
from flask import send_from_directory

app = Flask(__name__)
CORS(app)
# Configure SQLite database
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///reviews.db' # This will create reviews.db in your project folder
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

RAILWAY_VOLUME_MOUNT_PATH = '/data'
DB_NAME = 'reviews.db'
db_path = os.path.join(RAILWAY_VOLUME_MOUNT_PATH, DB_NAME)

# Ensure the directory for the database exists (important for the first run)
if not os.path.exists(RAILWAY_VOLUME_MOUNT_PATH):
    try:
        os.makedirs(RAILWAY_VOLUME_MOUNT_PATH, exist_ok=True)
        print(f"Created directory: {RAILWAY_VOLUME_MOUNT_PATH}")
    except OSError as e:
        print(f"Error creating directory {RAILWAY_VOLUME_MOUNT_PATH}: {e}")
        # Potentially raise an error or use a fallback for local dev if desired
        # For now, we'll assume Railway creates the mount point, but the app needs to create subdirs if any.
        # If /data is the root of the volume, os.makedirs('/data') might not be needed if Railway ensures it.

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
print(f"Using database at: {app.config['SQLALCHEMY_DATABASE_URI']}") # Good for debugging startup
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

CORRECT_SECRET_ANSWER = "Crispin".lower()

# --- Database Models ---
class Subject(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviews = db.relationship('Review', backref='subject', lazy=True, cascade="all, delete-orphan") # If a subject is deleted, its reviews are deleted too

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "average_rating": self.calculate_average_rating() # We'll add this method
        }

    def calculate_average_rating(self):
        if not self.reviews:
            return None
        total_rating = sum(review.rating for review in self.reviews)
        return round(total_rating / len(self.reviews), 1)


class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    rating = db.Column(db.Integer, nullable=False) # We'll validate 1-5 in the route
    comment = db.Column(db.String(280), nullable=True) # Increased slightly from 140, can adjust
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # ip_address = db.Column(db.String(45), nullable=True) # Optional
    subject_id = db.Column(db.Integer, db.ForeignKey('subject.id'), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "rating": self.rating,
            "comment": self.comment,
            "created_at": self.created_at.isoformat(),
            "subject_id": self.subject_id
        }

# --- API Endpoints ---

# Endpoint to create the database tables (run once)
@app.route('/init_db')
def init_db_route():
    with app.app_context(): # Ensure we are in application context
        db.create_all()
    return "Database initialized!"

# --- Subject Endpoints ---
@app.route('/api/subjects', methods=['POST'])
def add_subject():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Subject name is required"}), 400

    name = data['name'].strip()
    if not name:
        return jsonify({"error": "Subject name cannot be empty"}), 400

    existing_subject = Subject.query.filter_by(name=name).first()
    if existing_subject:
        return jsonify({"error": "Subject already exists", "subject": existing_subject.to_dict()}), 409 # 409 Conflict

    new_subject = Subject(name=name)
    db.session.add(new_subject)
    db.session.commit()
    return jsonify(new_subject.to_dict()), 201

@app.route('/api/subjects', methods=['GET'])
def search_subjects():
    query = request.args.get('search', '').strip()
    if not query:
        # Optionally, return all subjects or an empty list if no query
        subjects = Subject.query.order_by(Subject.name).all()
    else:
        # Case-insensitive search
        subjects = Subject.query.filter(Subject.name.ilike(f"%{query}%")).order_by(Subject.name).all()

    return jsonify([subject.to_dict() for subject in subjects]), 200


# --- Review Endpoints ---
@app.route('/api/subjects/<int:subject_id>/reviews', methods=['POST'])
def add_review(subject_id):
    subject = Subject.query.get_or_404(subject_id) # Get subject or return 404 if not found
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is missing"}), 400

    rating = data.get('rating')
    comment = data.get('comment', '').strip() # Optional comment
    user_secret_answer = data.get('secret_answer', '').strip().lower()

    if not user_secret_answer:
        return jsonify({"error": "Security answer is required"}), 400 # 400 Bad Request
    
    if user_secret_answer != CORRECT_SECRET_ANSWER:
        return jsonify({"error": "Incorrect security answer. Review not submitted."}), 403 # 403 Forbidden

    if rating is None:
        return jsonify({"error": "Rating is required"}), 400
    try:
        rating = int(rating)
        if not (1 <= rating <= 5):
            raise ValueError
    except ValueError:
        return jsonify({"error": "Rating must be an integer between 1 and 5"}), 400

    if len(comment) > 280:
        return jsonify({"error": "Comment cannot exceed 280 characters"}), 400

    new_review = Review(
        subject_id=subject.id,
        rating=rating,
        comment=comment
        # ip_address=request.remote_addr # Optional: log IP
    )
    db.session.add(new_review)
    db.session.commit()
    return jsonify(new_review.to_dict()), 201


@app.route('/api/subjects/<int:subject_id>/reviews', methods=['GET'])
def get_reviews(subject_id):
    subject = Subject.query.get_or_404(subject_id)
    reviews = Review.query.filter_by(subject_id=subject.id).order_by(Review.created_at.desc()).all()
    return jsonify([review.to_dict() for review in reviews]), 200

# Serve frontend static files (if not in a 'static' folder)
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html') # Serve index.html from root

@app.route('/<path:filename>') # Catches style.css, script.js etc.
def serve_static_files(filename):
    # Basic security: only allow specific known files or extensions
    if filename in ['style.css', 'script.js'] or filename.startswith('favicon.'): # Add other known files
        return send_from_directory('.', filename)
    return "File not found", 404



# --- Running the App ---
if __name__ == '__main__':
    # Important: Call db.create_all() inside app_context if running directly for the first time
    # However, it's better to use Flask CLI for this or a dedicated init script.
    # For simplicity here, we'll use the /init_db route once.
    app.run(debug=False) # debug=True is for development only!
