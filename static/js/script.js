const video = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const expressionDisplay = document.getElementById('expression');
const faceCountDisplay = document.getElementById('face-count');
const blinkCountDisplay = document.getElementById('blink-count');
const lieIndicator = document.getElementById('lie-indicator');
const deceptionScoreBar = document.getElementById('deception-score');
const deceptionScoreText = document.getElementById('deception-score-text');
const historyList = document.getElementById('history-list');
const toggleButton = document.getElementById('toggleDetection');
const clearHistoryButton = document.getElementById('clearHistory');
const downloadReportButton = document.getElementById('downloadReport');
const notificationsContainer = document.getElementById('notifications');
const socket = io();

let detectionInterval = null;
let expressionChangeCount = 0;
let lastExpression = null;
let lastLandmarks = null;
let deceptionScore = 0;
let blinkCount = 0;
let lastBlinkTime = null;
let expressionHistory = [];
let startTime = null;
let detectionData = [];

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationsContainer.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function drawSquareBrackets(ctx, detection) {
    const { x, y, width, height } = detection.detection.box;
    const bracketSize = 20;
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + bracketSize, y);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + bracketSize);
    // Top-right corner
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width - bracketSize, y);
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width, y + bracketSize);
    // Bottom-left corner
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + bracketSize, y + height);
    ctx.moveTo(x, y + height);
    ctx.lineTo(x, y + height - bracketSize);
    // Bottom-right corner
    ctx.moveTo(x + width, y + height);
    ctx.lineTo(x + width - bracketSize, y + height);
    ctx.moveTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - bracketSize);
    ctx.stroke();
}

function calculateLandmarkVariance(currentLandmarks, previousLandmarks) {
    if (!previousLandmarks) return 0;
    let variance = 0;
    currentLandmarks.forEach((point, i) => {
        const prevPoint = previousLandmarks[i];
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        variance += Math.sqrt(dx * dx + dy * dy);
    });
    return variance / currentLandmarks.length;
}

function detectBlink(landmarks) {
    const leftEye = landmarks.slice(36, 42); // Left eye landmarks
    const rightEye = landmarks.slice(42, 48); // Right eye landmarks
    const eyeAspectRatio = (eye) => {
        const A = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
        const B = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
        const C = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
        return (A + B) / (2.0 * C);
    };
    const leftEAR = eyeAspectRatio(leftEye);
    const rightEAR = eyeAspectRatio(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;
    const now = Date.now();
    if (avgEAR < 0.2 && (!lastBlinkTime || now - lastBlinkTime > 500)) {
        lastBlinkTime = now;
        return true;
    }
    return false;
}

function updateDeceptionScore(expression, landmarks) {
    let scoreIncrement = 0;
    // Expression change detection
    if (lastExpression && lastExpression !== expression) {
        expressionChangeCount++;
        expressionHistory.push({ expression, timestamp: Date.now() });
        if (expressionHistory.length > 10) expressionHistory.shift();
        // Check for rapid transitions (within 2 seconds)
        const recentTransitions = expressionHistory.filter(e => Date.now() - e.timestamp < 2000).length;
        if (recentTransitions > 2) scoreIncrement += 30; // Weight: 30%
    }
    // Landmark variance
    if (lastLandmarks) {
        const variance = calculateLandmarkVariance(landmarks, lastLandmarks);
        if (variance > 5) scoreIncrement += 40; // Weight: 40%
    }
    // Blink rate
    if (detectBlink(landmarks)) {
        blinkCount++;
        scoreIncrement += 30; // Weight: 30%
    }
    deceptionScore = Math.min(100, Math.max(0, deceptionScore + scoreIncrement - 3)); // Faster decay
    if (expressionChangeCount > 3 || deceptionScore > 60 || blinkCount > 5) {
        lieIndicator.textContent = "Lie Indicator: Possible deception detected";
        lieIndicator.classList.remove('text-green-500');
        lieIndicator.classList.add('text-red-500');
        showNotification('Possible deception detected!', 'error');
    } else {
        lieIndicator.textContent = "Lie Indicator: None";
        lieIndicator.classList.remove('text-red-500');
        lieIndicator.classList.add('text-green-500');
    }
    deceptionScoreBar.style.width = `${deceptionScore}%`;
    deceptionScoreText.textContent = `Score: ${deceptionScore.toFixed(2)}%`;
    lastExpression = expression;
    lastLandmarks = landmarks;
}

function generateReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Lie Detection Report', 10, 10);
    doc.setFontSize(12);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    doc.text(`Session Start: ${new Date(startTime).toLocaleString()}`, 10, 20);
    doc.text(`Session End: ${new Date(endTime).toLocaleString()}`, 10, 30);
    doc.text(`Duration: ${Math.floor(duration / 60)} minutes ${Math.floor(duration % 60)} seconds`, 10, 40);
    
    const singleFaceEntries = detectionData.filter(d => d.faces_detected === 1);
    const avgDeceptionScore = singleFaceEntries.length > 0 ? (singleFaceEntries.reduce((sum, d) => sum + d.deception_score, 0) / singleFaceEntries.length).toFixed(2) : 0;
    const totalBlinks = singleFaceEntries.length > 0 ? singleFaceEntries[singleFaceEntries.length - 1].blink_count : 0;
    const multiFaceCount = detectionData.filter(d => d.faces_detected > 1).length;
    
    doc.text(`Total Entries: ${detectionData.length}`, 10, 50);
    doc.text(`Average Deception Score: ${avgDeceptionScore}%`, 10, 60);
    doc.text(`Total Blinks: ${totalBlinks}`, 10, 70);
    doc.text(`Multiple Faces Detected: ${multiFaceCount} times`, 10, 80);
    
    doc.text('Detection Log (Last 10 Single-Face Entries):', 10, 90);
    let y = 100;
    singleFaceEntries.slice(-10).forEach(entry => {
        doc.text(`${new Date(entry.timestamp).toLocaleString()}: ${entry.expression}, Score: ${entry.deception_score.toFixed(2)}%, Blinks: ${entry.blink_count}`, 10, y);
        y += 10;
    });
    
    // Deception Score Chart
    const lineCanvas = document.createElement('canvas');
    lineCanvas.width = 400;
    lineCanvas.height = 200;
    document.body.appendChild(lineCanvas);
    new Chart(lineCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: singleFaceEntries.map((_, i) => i),
            datasets: [{ label: 'Deception Score', data: singleFaceEntries.map(d => d.deception_score), borderColor: 'blue', fill: false }]
        },
        options: { scales: { x: { display: false }, y: { min: 0, max: 100 } } }
    });
    doc.addImage(lineCanvas.toDataURL('image/png'), 'PNG', 10, y, 180, 90);
    y += 100;
    document.body.removeChild(lineCanvas);
    
    // Expression Frequency Chart
    const expressionCounts = {};
    singleFaceEntries.forEach(d => expressionCounts[d.expression] = (expressionCounts[d.expression] || 0) + 1);
    const barCanvas = document.createElement('canvas');
    barCanvas.width = 400;
    barCanvas.height = 200;
    document.body.appendChild(barCanvas);
    new Chart(barCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(expressionCounts),
            datasets: [{ label: 'Expression Frequency', data: Object.values(expressionCounts), backgroundColor: 'rgba(75, 192, 192, 0.6)' }]
        },
        options: { scales: { y: { beginAtZero: true } } }
    });
    doc.addImage(barCanvas.toDataURL('image/png'), 'PNG', 10, y, 180, 90);
    document.body.removeChild(barCanvas);
    
    doc.save(`lie_detection_report_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`);
}

Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri('/static/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/static/models'),
    faceapi.nets.faceExpressionNet.loadFromUri('/static/models')
]).then(() => {
    showNotification('Models loaded successfully', 'success');
    document.getElementById('loading').classList.add('hidden');
    startVideo();
}).catch(err => {
    showNotification('Failed to load models: ' + err.message, 'error');
    console.error('Model loading error:', err);
});

function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            showNotification('Webcam access granted', 'success');
        })
        .catch(err => {
            showNotification('Failed to access webcam: ' + err.message, 'error');
            console.error('Webcam error:', err);
        });
}

toggleButton.addEventListener('click', () => {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
        toggleButton.textContent = 'Start Detection';
        toggleButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        toggleButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
        expressionDisplay.textContent = "Expression: None";
        faceCountDisplay.textContent = "Faces Detected: 0";
        blinkCountDisplay.textContent = "Blink Count: 0";
        lieIndicator.textContent = "Lie Indicator: None";
        lieIndicator.classList.remove('text-red-500');
        lieIndicator.classList.add('text-green-500');
        deceptionScoreBar.style.width = '0%';
        deceptionScoreText.textContent = 'Score: 0%';
        deceptionScore = 0;
        expressionChangeCount = 0;
        blinkCount = 0;
        if (startTime && (Date.now() - startTime) >= 120000) {
            downloadReportButton.classList.remove('hidden');
        }
        showNotification('Detection stopped', 'info');
    } else {
        startTime = Date.now();
        detectionData = [];
        downloadReportButton.classList.add('hidden');
        detectionInterval = setInterval(async () => {
            try {
                const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
                    .withFaceLandmarks()
                    .withFaceExpressions();
                const resizedDetections = faceapi.resizeResults(detections, { width: video.offsetWidth, height: video.offsetHeight });
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                faceCountDisplay.textContent = `Faces Detected: ${detections.length}`;
                if (detections.length > 1) {
                    showNotification('Only one person should be present at a time', 'error');
                    detectionData.push({
                        timestamp: Date.now(),
                        faces_detected: detections.length,
                        expression: 'Multiple faces',
                        deception_score: 0,
                        blink_count: 0
                    });
                    return;
                }

                if (detections.length === 1) {
                    const detection = resizedDetections[0];
                    drawSquareBrackets(ctx, detection);
                    faceapi.draw.drawFaceExpressions(canvas, [detection]);

                    const expressions = detection.expressions;
                    const maxExpression = Object.keys(expressions).reduce((a, b) => 
                        expressions[a] > expressions[b] ? a : b);
                    const expressionText = `${maxExpression} (${(expressions[maxExpression] * 100).toFixed(2)}%)`;
                    expressionDisplay.textContent = `Expression: ${expressionText}`;
                    blinkCountDisplay.textContent = `Blink Count: ${blinkCount}`;

                    // Update deception score
                    const landmarks = detection.landmarks.positions;
                    updateDeceptionScore(maxExpression, landmarks);

                    // Add to history
                    const li = document.createElement('li');
                    li.textContent = `${new Date().toLocaleTimeString()}: ${expressionText}, Score: ${deceptionScore.toFixed(2)}%, Blinks: ${blinkCount}`;
                    historyList.prepend(li);
                    if (historyList.children.length > 10) {
                        historyList.removeChild(historyList.lastChild);
                    }

                    // Send frame to backend
                    const frame = canvas.toDataURL('image/jpeg');
                    socket.emit('frame', {
                        image: frame,
                        expression: maxExpression,
                        deception_score: deceptionScore,
                        blink_rate: blinkCount
                    });

                    // Store detection data
                    detectionData.push({
                        timestamp: Date.now(),
                        faces_detected: 1,
                        expression: maxExpression,
                        deception_score: deceptionScore,
                        blink_count: blinkCount
                    });
                } else {
                    expressionDisplay.textContent = "Expression: None";
                    faceCountDisplay.textContent = "Faces Detected: 0";
                    blinkCountDisplay.textContent = "Blink Count: 0";
                    lieIndicator.textContent = "Lie Indicator: None";
                    lieIndicator.classList.remove('text-red-500');
                    lieIndicator.classList.add('text-green-500');
                    deceptionScoreBar.style.width = '0%';
                    deceptionScoreText.textContent = 'Score: 0%';
                    deceptionScore = 0;
                }
            } catch (err) {
                showNotification('Detection error: ' + err.message, 'error');
                console.error('Detection error:', err);
            }
        }, 300);
        toggleButton.textContent = 'Stop Detection';
        toggleButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        toggleButton.classList.add('bg-red-600', 'hover:bg-red-700');
        showNotification('Detection started', 'success');
    }
});

clearHistoryButton.addEventListener('click', () => {
    while (historyList.firstChild) {
        historyList.removeChild(historyList.firstChild);
    }
    showNotification('History cleared', 'info');
});

downloadReportButton.addEventListener('click', generateReport);

socket.on('analysis', data => {
    if (data.status === 'error') {
        showNotification('Backend error: ' + data.message, 'error');
    } else {
        faceCountDisplay.textContent = `Faces Detected: ${data.faces_detected}`;
    }
});

socket.on('connect', () => {
    showNotification('Connected to server', 'success');
});

socket.on('disconnect', () => {
    showNotification('Disconnected from server', 'error');
});