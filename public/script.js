class TimeTrackerApp {
    constructor() {
        this.apiBase = '/api';
        this.timer = null;
        this.startTime = null;
        this.elapsed = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.currentProject = null;
        
        this.init();
    }

    async init() {
        await this.loadProjects();
        await this.loadTimeEntries();
        await this.loadStats();
        this.checkServerConnection();
        
        // Auto-refresh stats every 30 seconds
        setInterval(() => this.loadStats(), 30000);
    }

    async apiRequest(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            this.updateServerStatus(false);
            throw error;
        }
    }

    async loadProjects() {
        try {
            const projects = await this.apiRequest('/projects');
            const select = document.getElementById('projectSelect');
            select.innerHTML = '<option value="">Choose a project...</option>';
            
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });

            this.updateServerStatus(true);
        } catch (error) {
            document.getElementById('projectSelect').innerHTML = 
                '<option value="">Error loading projects</option>';
        }
    }

    async addProject() {
        const input = document.getElementById('newProjectInput');
        const name = input.value.trim();
        
        if (!name) {
            alert('Please enter a project name');
            return;
        }

        try {
            const newProject = await this.apiRequest('/projects', {
                method: 'POST',
                body: JSON.stringify({ name })
            });

            input.value = '';
            await this.loadProjects();
            
            // Select the new project
            document.getElementById('projectSelect').value = newProject.id;
            
            this.showNotification('✅ Project added successfully!');
        } catch (error) {
            alert('Failed to add project: ' + error.message);
        }
    }

    startTimer() {
        const projectSelect = document.getElementById('projectSelect');
        if (!projectSelect.value) {
            alert('Please select a project first!');
            return;
        }

        if (this.isPaused) {
            this.startTime = Date.now() - this.elapsed;
            this.isPaused = false;
        } else {
            this.startTime = Date.now();
            this.elapsed = 0;
            this.currentProject = projectSelect.value;
        }

        this.isRunning = true;
        this.timer = setInterval(() => {
            this.elapsed = Date.now() - this.startTime;
            this.updateTimerDisplay();
        }, 1000);

        this.updateButtonStates();
        this.updateTimerStatus();
    }

    pauseTimer() {
        this.isRunning = false;
        this.isPaused = true;
        clearInterval(this.timer);
        this.updateButtonStates();
        this.updateTimerStatus();
    }

    async stopTimer() {
        this.isRunning = false;
        this.isPaused = false;
        clearInterval(this.timer);

        if (this.elapsed > 0) {
            await this.saveTimeEntry();
        }

        this.resetTimer();
        this.updateButtonStates();
        this.updateTimerStatus();
    }

    resetTimer() {
        this.elapsed = 0;
        this.startTime = null;
        this.currentProject = null;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const totalSeconds = Math.floor(this.elapsed / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timerDisplay').textContent = display;
    }

    updateButtonStates() {
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');

        if (this.isRunning) {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-block';
            stopBtn.style.display = 'inline-block';
        } else if (this.isPaused) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = 'Resume';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
        } else {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = 'Start';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';
        }
    }

    updateTimerStatus() {
        const status = document.getElementById('timerStatus');
        const projectSelect = document.getElementById('projectSelect');
        
        if (this.isRunning && this.currentProject) {
            const projectName = projectSelect.options[projectSelect.selectedIndex]?.text || 'Unknown';
            status.textContent = `⏱️ Tracking: ${projectName}`;
        } else if (this.isPaused) {
            status.textContent = '⏸️ Timer paused';
        } else {
            status.textContent = 'Ready to start';
        }
    }

    async saveTimeEntry() {
        const projectSelect = document.getElementById('projectSelect');
        const projectOption = projectSelect.options[projectSelect.selectedIndex];
        
        const timeEntry = {
            projectId: this.currentProject,
            projectName: projectOption ? projectOption.text : 'Unknown Project',
            duration: this.elapsed,
            startTime: new Date(this.startTime).toISOString(),
            endTime: new Date().toISOString()
        };

        try {
            await this.apiRequest('/time-entries', {
                method: 'POST',
                body: JSON.stringify(timeEntry)
            });

            this.showNotification('✅ Time entry saved!');
            await this.loadTimeEntries();
            await this.loadStats();
        } catch (error) {
            alert('Failed to save time entry: ' + error.message);
        }
    }

    async loadTimeEntries() {
        try {
            const entries = await this.apiRequest('/time-entries');
            const list = document.getElementById('entriesList');
            
            if (entries.length === 0) {
                list.innerHTML = '<div class="no-entries">No time entries yet</div>';
                return;
            }

            list.innerHTML = entries.slice(0, 10).map(entry => `
                <div class="entry">
                    <div class="entry-header">
                        <span class="entry-project">${entry.projectName}</span>
                        <span class="entry-duration">${this.formatDuration(entry.duration)}</span>
                    </div>
                    <div class="entry-time">${new Date(entry.startTime).toLocaleString()}</div>
                </div>
            `).join('');
        } catch (error) {
            document.getElementById('entriesList').innerHTML = 
                '<div class="error">Error loading entries</div>';
        }
    }

    async loadStats() {
        try {
            const stats = await this.apiRequest('/stats');
            document.getElementById('todayTotal').textContent = this.formatDuration(stats.todayTotal);
            document.getElementById('totalEntries').textContent = stats.totalEntries;
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    formatDuration(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '<1m';
        }
    }

    updateServerStatus(connected) {
        const status = document.getElementById('serverStatus');
        if (connected) {
            status.textContent = '🟢 Connected';
            status.className = 'server-status connected';
        } else {
            status.textContent = '🔴 Disconnected';
            status.className = 'server-status disconnected';
        }
    }

    async checkServerConnection() {
        try {
            await this.apiRequest('/stats');
            this.updateServerStatus(true);
        } catch (error) {
            this.updateServerStatus(false);
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Testing functions
    async testAPI() {
        try {
            const stats = await this.apiRequest('/stats');
            alert(`✅ API Test Successful!\n\nStats:\n- Total Entries: ${stats.totalEntries}\n- Today's Total: ${this.formatDuration(stats.todayTotal)}\n- Projects: ${stats.projectCount}`);
        } catch (error) {
            alert(`❌ API Test Failed!\n\nError: ${error.message}`);
        }
    }

    async resetData() {
        if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
            try {
                await this.apiRequest('/reset', { method: 'DELETE' });
                this.showNotification('🗑️ Data reset successfully!');
                await this.init();
            } catch (error) {
                alert('Failed to reset data: ' + error.message);
            }
        }
    }

    async exportData() {
        try {
            const [projects, entries, stats] = await Promise.all([
                this.apiRequest('/projects'),
                this.apiRequest('/time-entries'),
                this.apiRequest('/stats')
            ]);

            const exportData = {
                exportDate: new Date().toISOString(),
                projects,
                timeEntries: entries,
                stats
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `time-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            this.showNotification('📁 Data exported successfully!');
        } catch (error) {
            alert('Failed to export data: ' + error.message);
        }
    }
}

// Global functions for buttons
let app;

function addProject() {
    app.addProject();
}

function startTimer() {
    app.startTimer();
}

function pauseTimer() {
    app.pauseTimer();
}

function stopTimer() {
    app.stopTimer();
}

function testAPI() {
    app.testAPI();
}

function resetData() {
    app.resetData();
}

function exportData() {
    app.exportData();
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    app = new TimeTrackerApp();
});