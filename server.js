const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Data storage
const DATA_FILE = path.join(__dirname, 'data', 'storage.json');

console.log('📁 Data file path:', DATA_FILE);

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    console.log('📂 Creating data directory...');
    fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialize storage file
if (!fs.existsSync(DATA_FILE)) {
    console.log('💾 Creating initial storage file...');
    const initialData = {
        projects: [
            { id: '1', name: 'Client A - Bookkeeping' },
            { id: '2', name: 'Client B - Tax Prep' },
            { id: '3', name: 'Client C - Payroll' }
        ],
        timeEntries: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('✅ Initial data file created!');
} else {
    console.log('✅ Existing data file found!');
}

// Helper functions
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Error reading data:', error);
        return { projects: [], timeEntries: [] };
    }
}

function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Data saved successfully');
        return true;
    } catch (error) {
        console.error('❌ Error writing data:', error);
        return false;
    }
}

// Basic test route
app.get('/', (req, res) => {
    const dataExists = fs.existsSync(DATA_FILE);
    const data = dataExists ? readData() : { projects: [], timeEntries: [] };
    
    res.send(`
        <h1>🚀 Time Tracker Server is Running!</h1>
        <p>✅ Server is working correctly</p>
        <p>📁 Data file: <code>${DATA_FILE}</code></p>
        <p>💾 Data file exists: <strong>${dataExists ? 'YES' : 'NO'}</strong></p>
        <p>📊 Current data:</p>
        <ul>
            <li>Projects: ${data.projects.length}</li>
            <li>Time Entries: ${data.timeEntries.length}</li>
        </ul>
        <p>🔗 API endpoints:</p>
        <ul>
            <li><a href="/api/projects">/api/projects</a> - View projects</li>
            <li><a href="/api/time-entries">/api/time-entries</a> - View time entries</li>
            <li><a href="/api/stats">/api/stats</a> - View statistics</li>
        </ul>
        <h3>🧪 Quick API Tests:</h3>
        <button onclick="testAddProject()">Add Test Project</button>
        <button onclick="testAddTimeEntry()">Add Test Time Entry</button>
        <div id="results"></div>
        
        <script>
            async function testAddProject() {
                try {
                    const response = await fetch('/api/projects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: 'Test Project ' + Date.now() })
                    });
                    const result = await response.json();
                    document.getElementById('results').innerHTML = '<p>✅ Project added: ' + JSON.stringify(result) + '</p>';
                    setTimeout(() => location.reload(), 1000);
                } catch (error) {
                    document.getElementById('results').innerHTML = '<p>❌ Error: ' + error.message + '</p>';
                }
            }
            
            async function testAddTimeEntry() {
                try {
                    const response = await fetch('/api/time-entries', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            projectId: '1',
                            projectName: 'Test Entry',
                            duration: 300000,
                            startTime: new Date().toISOString(),
                            endTime: new Date().toISOString()
                        })
                    });
                    const result = await response.json();
                    document.getElementById('results').innerHTML = '<p>✅ Time entry added: ' + JSON.stringify(result) + '</p>';
                    setTimeout(() => location.reload(), 1000);
                } catch (error) {
                    document.getElementById('results').innerHTML = '<p>❌ Error: ' + error.message + '</p>';
                }
            }
        </script>
    `);
});

// API Routes
app.get('/api/projects', (req, res) => {
    console.log('📊 GET /api/projects requested');
    const data = readData();
    res.json(data.projects);
});

app.post('/api/projects', (req, res) => {
    console.log('📊 POST /api/projects requested:', req.body);
    const { name } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    
    const data = readData();
    const newProject = {
        id: Date.now().toString(),
        name: name.trim()
    };
    
    data.projects.push(newProject);
    
    if (writeData(data)) {
        console.log('✅ New project added:', newProject);
        res.status(201).json(newProject);
    } else {
        res.status(500).json({ error: 'Failed to save project' });
    }
});

app.get('/api/time-entries', (req, res) => {
    console.log('📊 GET /api/time-entries requested');
    const data = readData();
    res.json(data.timeEntries);
});

app.post('/api/time-entries', (req, res) => {
    console.log('📊 POST /api/time-entries requested:', req.body);
    const { projectId, projectName, duration, startTime, endTime } = req.body;
    
    if (!projectId || !duration || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const data = readData();
    const newEntry = {
        id: Date.now().toString(),
        projectId,
        projectName,
        duration,
        startTime,
        endTime,
        createdAt: new Date().toISOString()
    };
    
    data.timeEntries.unshift(newEntry);
    
    if (writeData(data)) {
        console.log('✅ New time entry added:', newEntry);
        res.status(201).json(newEntry);
    } else {
        res.status(500).json({ error: 'Failed to save time entry' });
    }
});

app.get('/api/stats', (req, res) => {
    console.log('📊 GET /api/stats requested');
    const data = readData();
    const today = new Date().toDateString();
    
    const todayEntries = data.timeEntries.filter(entry => 
        new Date(entry.startTime).toDateString() === today
    );
    
    const todayTotal = todayEntries.reduce((sum, entry) => sum + entry.duration, 0);
    
    const stats = {
        totalEntries: data.timeEntries.length,
        todayEntries: todayEntries.length,
        todayTotal: todayTotal,
        projectCount: data.projects.length
    };
    
    res.json(stats);
});

// Start server
app.listen(PORT, () => {
    console.log('\n🚀 Time Tracker Server running on http://localhost:' + PORT);
    console.log('📊 API available at http://localhost:' + PORT + '/api/');
    console.log('💾 Data stored in: ' + DATA_FILE);
    console.log('📁 Project directory: ' + __dirname);
    console.log('\n✅ Ready for testing!');
    console.log('👉 Visit http://localhost:' + PORT + ' to test the app');
});

module.exports = app;