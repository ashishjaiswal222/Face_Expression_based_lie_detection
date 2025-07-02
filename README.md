# Lie Detector Project

This project is a Lie Detector web application that uses face recognition technology to detect lies based on facial expressions and micro-expressions.

## Project Structure

- `app.py` - The main Flask application file.
- `requirements.txt` - Python dependencies for the project.
- `data/` - Contains JSON files for detection logs, sessions, and user data. (These files are excluded from GitHub via .gitignore)
- `static/` - Contains static assets like CSS, JavaScript, models, and the face-api.js library.
- `templates/` - HTML templates used by the Flask app.
- `frontend/` - Frontend React application source code and public assets.
- `face-api.js-master/` - External face-api.js library source (included in static folder).

## Setup Instructions

1. Clone the repository.

2. Create a Python virtual environment and activate it:

```bash
python -m venv venv
# On Windows
venv\Scripts\activate
# On Unix or MacOS
source venv/bin/activate
```

3. Install the required Python packages:

```bash
pip install -r requirements.txt
```

4. Run the Flask application:

```bash
python app.py
```

5. Access the application in your browser at `http://localhost:5000`.

## Notes

- The `data/` folder contains runtime data such as logs and user sessions and is excluded from version control.
- The `static/face-api.js-master` folder contains the face-api.js library used for face detection and recognition.
- Frontend React source code is located in the `frontend/` directory.

