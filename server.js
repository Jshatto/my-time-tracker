const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch (error) {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// Read JSON file with fallback
async function readJSONFile(filePath, defaultData = []) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist or is invalid, return default data
        await writeJSONFile(filePath, defaultData);
        return defaultData;
    }
}

// Write JSON file
async function writeJSONFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Initialize default data
async function initializeData() {
    await ensureDataDir();
    
    // Initialize projects if they don't exist
    const projects = await readJSONFile(PROJECTS_FILE, [
        { id: '1', name: 'Client A - Bookkeeping', color: '#3B82F6', createdAt: new Date().toISOString() },
        { id: '2', name: 'Client B - Tax Prep', color: '#10B981', createdAt: new Date().toISOString() },
        { id: '3', name: 'Client C - Payroll', color: '#F59E0B', createdAt: new Date().toISOString() }
    ]);
    
    // Initialize entries if they don't exist
    const entries = await readJSONFile(ENTRIES_FILE, []);
}

// Utility function to generate unique IDs
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        message: 'Time Tracker API is running'
    });
});

// Extension API endpoints
app.get('/api/extension/ping', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        message: 'Extension API is working!'
    });
});

app.get('/api/extension/status', async (req, res) => {
    try {
        const projects = await readJSONFile(PROJECTS_FILE, []);
        const entries = await readJSONFile(ENTRIES_FILE, []);
        
        // Find active timer
        const activeEntry = entries.find(entry => entry.status === 'running');
        
        res.json({
            isOnline: true,
            projectCount: projects.length,
            activeTimer: activeEntry || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Extension status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Projects endpoints
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await readJSONFile(PROJECTS_FILE, []);
        res.json(projects);
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/projects', async (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const projects = await readJSONFile(PROJECTS_FILE, []);
        const newProject = {
            id: generateId(),
            name: name.trim(),
            color: color || '#3B82F6',
            createdAt: new Date().toISOString()
        };

        projects.push(newProject);
        await writeJSONFile(PROJECTS_FILE, projects);
        
        console.log('Created new project:', newProject.name);
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const projects = await readJSONFile(PROJECTS_FILE, []);
        
        const projectIndex = projects.findIndex(project => project.id === id);
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const deletedProject = projects.splice(projectIndex, 1)[0];
        await writeJSONFile(PROJECTS_FILE, projects);
        
        console.log('Deleted project:', deletedProject.name);
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Time entries endpoints
app.get('/api/time-entries', async (req, res) => {
    try {
        const entries = await readJSONFile(ENTRIES_FILE, []);
        // Sort by most recent first
        entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(entries);
    } catch (error) {
        console.error('Get entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/time-entries', async (req, res) => {
    try {
        const { projectId, description, startTime, endTime, duration } = req.body;
        
        if (!projectId || !startTime) {
            return res.status(400).json({ error: 'Project ID and start time are required' });
        }

        const entries = await readJSONFile(ENTRIES_FILE, []);
        const newEntry = {
            id: generateId(),
            projectId,
            description: description || '',
            startTime,
            endTime: endTime || null,
            duration: duration || 0,
            status: endTime ? 'completed' : 'running',
            createdAt: new Date().toISOString()
        };

        entries.push(newEntry);
        await writeJSONFile(ENTRIES_FILE, entries);
        
        console.log('Created new time entry:', newEntry.id);
        res.status(201).json(newEntry);
    } catch (error) {
        console.error('Create entry error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/time-entries/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const entries = await readJSONFile(ENTRIES_FILE, []);
        const entryIndex = entries.findIndex(entry => entry.id === id);

        if (entryIndex === -1) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        entries[entryIndex] = { ...entries[entryIndex], ...updates, updatedAt: new Date().toISOString() };
        await writeJSONFile(ENTRIES_FILE, entries);
        
        console.log('Updated time entry:', id);
        res.json(entries[entryIndex]);
    } catch (error) {
        console.error('Update entry error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/time-entries/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const entries = await readJSONFile(ENTRIES_FILE, []);
        
        const entryIndex = entries.findIndex(entry => entry.id === id);
        if (entryIndex === -1) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        
        const deletedEntry = entries.splice(entryIndex, 1)[0];
        await writeJSONFile(ENTRIES_FILE, entries);
        
        console.log('Deleted time entry:', id);
        res.json({ message: 'Time entry deleted successfully' });
    } catch (error) {
        console.error('Delete entry error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Extension timer endpoints
app.post('/api/extension/start-timer', async (req, res) => {
    try {
        const { projectId, description } = req.body;
        
        if (!projectId) {
            return res.status(400).json({ error: 'Project ID is required' });
        }

        // Stop any running timers first
        const entries = await readJSONFile(ENTRIES_FILE, []);
        const runningEntry = entries.find(entry => entry.status === 'running');
        
        if (runningEntry) {
            runningEntry.endTime = new Date().toISOString();
            runningEntry.status = 'completed';
            runningEntry.duration = Math.floor((new Date(runningEntry.endTime) - new Date(runningEntry.startTime)) / 1000);
            console.log('Stopped previous timer:', runningEntry.id);
        }

        // Start new timer
        const newEntry = {
            id: generateId(),
            projectId,
            description: description || '',
            startTime: new Date().toISOString(),
            endTime: null,
            duration: 0,
            status: 'running',
            createdAt: new Date().toISOString()
        };

        entries.push(newEntry);
        await writeJSONFile(ENTRIES_FILE, entries);
        
        console.log('Started new timer:', newEntry.id);
        res.json({ success: true, entry: newEntry });
    } catch (error) {
        console.error('Start timer error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/extension/stop-timer', async (req, res) => {
    try {
        const entries = await readJSONFile(ENTRIES_FILE, []);
        const runningEntry = entries.find(entry => entry.status === 'running');
        
        if (!runningEntry) {
            return res.status(400).json({ error: 'No running timer found' });
        }

        runningEntry.endTime = new Date().toISOString();
        runningEntry.status = 'completed';
        runningEntry.duration = Math.floor((new Date(runningEntry.endTime) - new Date(runningEntry.startTime)) / 1000);

        await writeJSONFile(ENTRIES_FILE, entries);
        
        console.log('Stopped timer:', runningEntry.id, 'Duration:', runningEntry.duration + 's');
        res.json({ success: true, entry: runningEntry });
    } catch (error) {
        console.error('Stop timer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const entries = await readJSONFile(ENTRIES_FILE, []);
        const projects = await readJSONFile(PROJECTS_FILE, []);
        
        const today = new Date().toDateString();
        const todayEntries = entries.filter(entry => 
            new Date(entry.startTime).toDateString() === today
        );
        
        const totalTimeToday = todayEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
        const activeTimer = entries.find(entry => entry.status === 'running');
        
        // Calculate total time this week
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEntries = entries.filter(entry => 
            new Date(entry.startTime) >= weekStart
        );
        const totalTimeWeek = weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
        
        res.json({
            totalProjects: projects.length,
            totalEntries: entries.length,
            totalTimeToday,
            totalTimeWeek,
            entriesCount: todayEntries.length,
            activeTimer: activeTimer || null,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Combined data endpoint for web app
app.get('/api/data', async (req, res) => {
    try {
        const projects = await readJSONFile(PROJECTS_FILE, []);
        const entries = await readJSONFile(ENTRIES_FILE, []);
        
        res.json({
            projects,
            entries,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Data endpoint error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export data endpoint
app.get('/api/export', async (req, res) => {
    try {
        const projects = await readJSONFile(PROJECTS_FILE, []);
        const entries = await readJSONFile(ENTRIES_FILE, []);
        
        const exportData = {
            projects,
            entries,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=time-tracker-export.json');
        res.json(exportData);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reset data endpoint (useful for testing)
app.post('/api/reset', async (req, res) => {
    try {
        // Reset to default data
        const defaultProjects = [
            { id: '1', name: 'Client A - Bookkeeping', color: '#3B82F6', createdAt: new Date().toISOString() },
            { id: '2', name: 'Client B - Tax Prep', color: '#10B981', createdAt: new Date().toISOString() },
            { id: '3', name: 'Client C - Payroll', color: '#F59E0B', createdAt: new Date().toISOString() }
        ];
        
        await writeJSONFile(PROJECTS_FILE, defaultProjects);
        await writeJSONFile(ENTRIES_FILE, []);
        
        console.log('Data reset to defaults');
        res.json({ message: 'Data reset successfully' });
    } catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve the main web app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Simple test page if index.html doesn't exist
app.get('/test', (req, res) => {
    res.send(`
        <html>
            <head><title>Time Tracker API Test</title></head>
            <body>
                <h1>🕐 Time Tracker API is Running!</h1>
                <p>Server started at: ${new Date().toISOString()}</p>
                <h3>Test Endpoints:</h3>
                <ul>
                    <li><a href="/api/health">Health Check</a></li>
                    <li><a href="/api/projects">Projects</a></li>
                    <li><a href="/api/time-entries">Time Entries</a></li>
                    <li><a href="/api/stats">Statistics</a></li>
                    <li><a href="/api/extension/ping">Extension Ping</a></li>
                    <li><a href="/api/data">All Data</a></li>
                </ul>
                <p>✅ JSON File Storage - No Database Required!</p>
            </body>
        </html>
    `);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

// Initialize and start server
async function startServer() {
    try {
        await initializeData();
        
        app.listen(PORT, () => {
            console.log(`🚀 Time Tracker Server running on port ${PORT}`);
            console.log(`📊 Web App: http://localhost:${PORT}`);
            console.log(`🔌 API: http://localhost:${PORT}/api`);
            console.log(`🖥️ Extension API: http://localhost:${PORT}/api/extension`);
            console.log(`💾 Data stored in: ${DATA_DIR}`);
            console.log(`🧪 Test page: http://localhost:${PORT}/test`);
            console.log(`✅ JSON File Storage - No Database Dependencies!`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
