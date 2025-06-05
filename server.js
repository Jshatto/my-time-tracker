const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = path.join(__dirname, 'timetracker.db');
const db = new sqlite3.Database(dbPath);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database
db.serialize(() => {
    // Projects table
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#3B82F6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Time entries table
    db.run(`CREATE TABLE IF NOT EXISTS time_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        duration INTEGER,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects (id)
    )`);

    // Insert default projects if none exist
    db.get("SELECT COUNT(*) as count FROM projects", (err, row) => {
        if (!err && row.count === 0) {
            const defaultProjects = [
                ['General Work', '#3B82F6'],
                ['Meetings', '#10B981'],
                ['Development', '#8B5CF6'],
                ['Research', '#F59E0B']
            ];
            
            const stmt = db.prepare("INSERT INTO projects (name, color) VALUES (?, ?)");
            defaultProjects.forEach(project => {
                stmt.run(project[0], project[1]);
            });
            stmt.finalize();
        }
    });
});

// =============================================================================
// WEB APP API ENDPOINTS (Original)
// =============================================================================

// Get all data for web app
app.get('/api/data', (req, res) => {
    const data = { projects: [], timeEntries: [] };
    
    // Get projects
    db.all("SELECT * FROM projects ORDER BY name", (err, projects) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        data.projects = projects;
        
        // Get time entries
        db.all(`
            SELECT te.*, p.name as project_name, p.color as project_color 
            FROM time_entries te 
            LEFT JOIN projects p ON te.project_id = p.id 
            ORDER BY te.start_time DESC
        `, (err, entries) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            data.timeEntries = entries;
            res.json(data);
        });
    });
});

// Get projects
app.get('/api/projects', (req, res) => {
    db.all("SELECT * FROM projects ORDER BY name", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Create new project
app.post('/api/projects', (req, res) => {
    const { name, color } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    
    db.run("INSERT INTO projects (name, color) VALUES (?, ?)", 
        [name, color || '#3B82F6'], 
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Project name already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            
            // Return the created project
            db.get("SELECT * FROM projects WHERE id = ?", [this.lastID], (err, row) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json(row);
            });
        }
    );
});

// Get time entries
app.get('/api/time-entries', (req, res) => {
    db.all(`
        SELECT te.*, p.name as project_name, p.color as project_color 
        FROM time_entries te 
        LEFT JOIN projects p ON te.project_id = p.id 
        ORDER BY te.start_time DESC
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Create time entry
app.post('/api/time-entries', (req, res) => {
    const { project_id, start_time, end_time, duration, description } = req.body;
    
    if (!project_id || !start_time) {
        return res.status(400).json({ error: 'Project ID and start time are required' });
    }
    
    db.run(`
        INSERT INTO time_entries (project_id, start_time, end_time, duration, description) 
        VALUES (?, ?, ?, ?, ?)
    `, [project_id, start_time, end_time, duration, description], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Return the created entry with project info
        db.get(`
            SELECT te.*, p.name as project_name, p.color as project_color 
            FROM time_entries te 
            LEFT JOIN projects p ON te.project_id = p.id 
            WHERE te.id = ?
        `, [this.lastID], (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json(row);
        });
    });
});

// Update time entry
app.put('/api/time-entries/:id', (req, res) => {
    const { end_time, duration, description } = req.body;
    const entryId = req.params.id;
    
    db.run(`
        UPDATE time_entries 
        SET end_time = ?, duration = ?, description = ?
        WHERE id = ?
    `, [end_time, duration, description, entryId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        
        // Return updated entry
        db.get(`
            SELECT te.*, p.name as project_name, p.color as project_color 
            FROM time_entries te 
            LEFT JOIN projects p ON te.project_id = p.id 
            WHERE te.id = ?
        `, [entryId], (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(row);
        });
    });
});

// Delete time entry
app.delete('/api/time-entries/:id', (req, res) => {
    const entryId = req.params.id;
    
    db.run("DELETE FROM time_entries WHERE id = ?", [entryId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        
        res.json({ message: 'Time entry deleted successfully' });
    });
});

// Get stats
app.get('/api/stats', (req, res) => {
    const stats = {};
    
    // Total time today
    const today = new Date().toISOString().split('T')[0];
    db.get(`
        SELECT SUM(duration) as total_today 
        FROM time_entries 
        WHERE date(start_time) = ?
    `, [today], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        stats.today = row.total_today || 0;
        
        // Total time this week
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        
        db.get(`
            SELECT SUM(duration) as total_week 
            FROM time_entries 
            WHERE start_time >= ?
        `, [weekStart.toISOString()], (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            stats.week = row.total_week || 0;
            
            // Project breakdown
            db.all(`
                SELECT p.name, p.color, SUM(te.duration) as total_time
                FROM time_entries te
                JOIN projects p ON te.project_id = p.id
                WHERE date(te.start_time) = ?
                GROUP BY p.id, p.name, p.color
                ORDER BY total_time DESC
            `, [today], (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                stats.projectBreakdown = rows;
                res.json(stats);
            });
        });
    });
});

// =============================================================================
// EXTENSION/DESKTOP API ENDPOINTS (New)
// =============================================================================

// Extension health check
app.get('/api/extension/ping', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        source: 'server'
    });
});

// Get extension status and current timer
app.get('/api/extension/status', (req, res) => {
    // Get active timer (if any)
    db.get(`
        SELECT te.*, p.name as project_name, p.color as project_color 
        FROM time_entries te 
        LEFT JOIN projects p ON te.project_id = p.id 
        WHERE te.end_time IS NULL 
        ORDER BY te.start_time DESC 
        LIMIT 1
    `, (err, activeEntry) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Get projects for dropdown
        db.all("SELECT * FROM projects ORDER BY name", (err, projects) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                isRunning: !!activeEntry,
                activeTimer: activeEntry || null,
                projects: projects
            });
        });
    });
});

// Start timer
app.post('/api/extension/start-timer', (req, res) => {
    const { projectId, description } = req.body;
    
    if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
    }
    
    // Stop any existing timer first
    db.run(`
        UPDATE time_entries 
        SET end_time = CURRENT_TIMESTAMP, 
            duration = CAST((julianday(CURRENT_TIMESTAMP) - julianday(start_time)) * 86400 AS INTEGER)
        WHERE end_time IS NULL
    `, (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Start new timer
        db.run(`
            INSERT INTO time_entries (project_id, start_time, description) 
            VALUES (?, CURRENT_TIMESTAMP, ?)
        `, [projectId, description || ''], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Return the new timer with project info
            db.get(`
                SELECT te.*, p.name as project_name, p.color as project_color 
                FROM time_entries te 
                LEFT JOIN projects p ON te.project_id = p.id 
                WHERE te.id = ?
            `, [this.lastID], (err, row) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, timer: row });
            });
        });
    });
});

// Stop timer
app.post('/api/extension/stop-timer', (req, res) => {
    const { description } = req.body;
    
    db.run(`
        UPDATE time_entries 
        SET end_time = CURRENT_TIMESTAMP, 
            duration = CAST((julianday(CURRENT_TIMESTAMP) - julianday(start_time)) * 86400 AS INTEGER),
            description = COALESCE(?, description)
        WHERE end_time IS NULL
    `, [description], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(400).json({ error: 'No active timer found' });
        }
        
        res.json({ success: true, message: 'Timer stopped successfully' });
    });
});

// =============================================================================
// SERVE WEB APP
// =============================================================================

// Serve the main web app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Time Tracker Server running on port ${PORT}`);
    console.log(`📊 Web App: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api`);
    console.log(`🖥️ Extension API: http://localhost:${PORT}/api/extension`);
});
