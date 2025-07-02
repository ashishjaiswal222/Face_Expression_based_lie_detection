import cv2
import numpy as np
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import base64
import io
from PIL import Image
import json
import os
from datetime import datetime

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "secret!"
socketio = SocketIO(app)

# Load Haar Cascade for face detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Path for temporary data storage
DATA_FILE = "data/detection_log.json"

@app.route('/')
def index():
    return render_template('index.html')

def process_frame(frame_data, expression, deception_score, blink_rate):
    try:
        # Decode base64 image
        img_data = base64.b64decode(frame_data.split(',')[1])
        img = Image.open(io.BytesIO(img_data))
        img = np.array(img)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        
        # Convert to grayscale for face detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)
        
        # Store data
        data_entry = {
            "timestamp": datetime.now().isoformat(),
            "faces_detected": len(faces),
            "expression": expression,
            "deception_score": deception_score,
            "blink_rate": blink_rate
        }
        
        # Append to JSON file
        try:
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r+') as f:
                    data = json.load(f)
                    data.append(data_entry)
                    f.seek(0)
                    json.dump(data, f, indent=2)
            else:
                with open(DATA_FILE, 'w') as f:
                    json.dump([data_entry], f, indent=2)
        except Exception as e:
            print(f"Error writing to JSON: {e}")
        
        return {"faces_detected": len(faces), "status": "success"}
    except Exception as e:
        print(f"Error processing frame: {e}")
        return {"faces_detected": 0, "status": "error", "message": str(e)}

@socketio.on('frame')
def handle_frame(data):
    result = process_frame(
        data["image"], 
        data.get("expression", "None"), 
        data.get("deception_score", 0), 
        data.get("blink_rate", 0)
    )
    result["expression"] = data.get("expression", "None")
    result["deception_score"] = data.get("deception_score", 0)
    emit('analysis', result)

if __name__ == '__main__':
    # Initialize empty JSON file
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'w') as f:
            json.dump([], f)
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)