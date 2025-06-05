const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://my-time-tracker.onrender.com', 'chrome-extension://*'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));

// Data storage
const dataFile = path.join(__dirname, 'data', 'storage.json');

function readData() {
    try {
        if (fs.existsSync(dataFile)) {
            const data = fs.readFileSync(dataFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading data:', error);
    }
    return { projects: [], timeEntries: [], currentSession: null };
}

function writeData(data) {
    try {
        const dir = path.dirname(dataFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing data:', error);
    }
}

// Existing endpoints
app.get('/api/data', (req, res) => {
    const data = readData();
    res.json(data);
});

app.post('/api/projects', (req, res) => {
    const data = readData();
    const newProject = {
        id: Date.now().toString(),
        name: req.body.name,
        createdAt: new Date().toISOString()
    };
    data.projects.push(newProject);
    writeData(data);
    res.json(newProject);
});

app.post('/api/time-entries', (req, res) => {
    const data = readData();
    const newEntry = {
        id: Date.now().toString(),
        projectId: req.body.projectId,
        projectName: req.body.projectName,
        duration: req.body.duration,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        createdAt: new Date().toISOString(),
        source: req.body.source || 'web' // Track if from extension or web
    };
    data.timeEntries.push(newEntry);
    writeData(data);
    res.json(newEntry);
});

// NEW: Extension-specific endpoints
app.get('/api/extension/status', (req, res) => {
    const data = readData();
    res.json({
        currentSession: data.currentSession,
        isTracking: !!data.currentSession,
        recentProjects: data.projects.slice(-5) // Last 5 projects
    });
});

app.post('/api/extension/start-timer', (req, res) => {
    const data = readData();
    const session = {
        projectId: req.body.projectId,
        projectName: req.body.projectName,
        startTime: new Date().toISOString(),
        source: 'extension'
    };
    data.currentSession = session;
    writeData(data);
    res.json({ success: true, session });
});

app.post('/api/extension/stop-timer', (req, res) => {
    const data = readData();
    if (!data.currentSession) {
        return res.json({ success: false, message: 'No active session' });
    }
    
    const endTime = new Date().toISOString();
    const duration = new Date(endTime) - new Date(data.currentSession.startTime);
    
    // Create time entry
    const timeEntry = {
        id: Date.now().toString(),
        projectId: data.currentSession.projectId,
        projectName: data.currentSession.projectName,
        duration: duration,
        startTime: data.currentSession.startTime,
        endTime: endTime,
        createdAt: endTime,
        source: 'extension'
    };
    
    data.timeEntries.push(timeEntry);
    data.currentSession = null;
    writeData(data);
    
    res.json({ success: true, timeEntry, duration });
});

app.get('/api/extension/projects', (req, res) => {
    const data = readData();
    res.json(data.projects);
});

// Health check for extension
app.get('/api/extension/ping', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});