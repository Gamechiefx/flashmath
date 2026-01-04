/**
 * FlashMath Test Report Viewer
 * 
 * A simple Express server that serves Playwright HTML reports
 * and provides a dashboard for viewing test results with history.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 9400;

// Paths to reports
const E2E_REPORT_PATH = process.env.E2E_REPORT_PATH || '/reports/e2e';
const SOCKET_RESULTS_PATH = process.env.SOCKET_RESULTS_PATH || '/reports/socket';
const HISTORY_PATH = process.env.HISTORY_PATH || '/reports/history';

// Serve static files from Playwright report
app.use('/e2e', express.static(E2E_REPORT_PATH));

// Serve history archives
app.use('/history-files', express.static(HISTORY_PATH));

// Dashboard HTML
app.get('/', (req, res) => {
    // Check if reports exist
    const e2eExists = fs.existsSync(path.join(E2E_REPORT_PATH, 'index.html'));
    const socketResultsFile = path.join(SOCKET_RESULTS_PATH, 'results.json');
    const socketExists = fs.existsSync(socketResultsFile);
    
    let socketResults = null;
    if (socketExists) {
        try {
            socketResults = JSON.parse(fs.readFileSync(socketResultsFile, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse socket results:', e);
        }
    }

    // Check for Playwright JSON results
    const e2eJsonPath = path.join(E2E_REPORT_PATH, 'results.json');
    let e2eResults = null;
    if (fs.existsSync(e2eJsonPath)) {
        try {
            e2eResults = JSON.parse(fs.readFileSync(e2eJsonPath, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse E2E results:', e);
        }
    }
    
    // Load history
    const historyIndexPath = path.join(HISTORY_PATH, 'index.json');
    let historyRuns = [];
    if (fs.existsSync(historyIndexPath)) {
        try {
            const historyData = JSON.parse(fs.readFileSync(historyIndexPath, 'utf-8'));
            historyRuns = historyData.runs || [];
        } catch (e) {
            console.error('Failed to parse history:', e);
        }
    }

    res.send(generateDashboard(e2eExists, e2eResults, socketExists, socketResults, historyRuns));
});

// History page
app.get('/history', (req, res) => {
    const historyIndexPath = path.join(HISTORY_PATH, 'index.json');
    let historyRuns = [];
    if (fs.existsSync(historyIndexPath)) {
        try {
            const historyData = JSON.parse(fs.readFileSync(historyIndexPath, 'utf-8'));
            historyRuns = historyData.runs || [];
        } catch (e) {
            console.error('Failed to parse history:', e);
        }
    }
    
    res.send(generateHistoryPage(historyRuns));
});

// API: Get history data
app.get('/api/history', (req, res) => {
    const historyIndexPath = path.join(HISTORY_PATH, 'index.json');
    if (fs.existsSync(historyIndexPath)) {
        res.sendFile(historyIndexPath);
    } else {
        res.json({ runs: [] });
    }
});

// API: Get specific run details
app.get('/api/history/:runId', (req, res) => {
    const runDir = path.join(HISTORY_PATH, req.params.runId);
    if (!fs.existsSync(runDir)) {
        return res.status(404).json({ error: 'Run not found' });
    }
    
    const result = {
        id: req.params.runId,
        e2e: null,
        socket: null,
    };
    
    // Load E2E results
    const e2eResults = path.join(runDir, 'playwright-results.json');
    if (fs.existsSync(e2eResults)) {
        try {
            result.e2e = JSON.parse(fs.readFileSync(e2eResults, 'utf-8'));
        } catch (e) {}
    }
    
    // Load socket results
    const socketResults = path.join(runDir, 'socket', 'results.json');
    if (fs.existsSync(socketResults)) {
        try {
            result.socket = JSON.parse(fs.readFileSync(socketResults, 'utf-8'));
        } catch (e) {}
    }
    
    res.json(result);
});

// Serve archived E2E reports
app.get('/history/:runId/e2e/*', (req, res) => {
    const filePath = path.join(HISTORY_PATH, req.params.runId, 'e2e', req.params[0] || 'index.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

// API endpoint for socket results
app.get('/api/socket-results', (req, res) => {
    const socketResultsFile = path.join(SOCKET_RESULTS_PATH, 'results.json');
    if (fs.existsSync(socketResultsFile)) {
        res.sendFile(socketResultsFile);
    } else {
        res.status(404).json({ error: 'No socket test results found' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard generator
function generateDashboard(e2eExists, e2eResults, socketExists, socketResults, historyRuns) {
    const recentRuns = historyRuns.slice(0, 5);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlashMath Test Reports</title>
    <style>
        ${getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>⚡ FlashMath Test Reports</h1>
            <p class="subtitle">Real-time visibility into test results</p>
        </header>
        
        <nav class="nav-tabs">
            <a href="/" class="nav-tab active">Dashboard</a>
            <a href="/history" class="nav-tab">History</a>
        </nav>
        
        <div class="cards">
            <!-- E2E Tests Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon e2e">🎭</div>
                    <div>
                        <h2>E2E Browser Tests</h2>
                        <span class="status-badge ${e2eExists ? 'status-available' : 'status-unavailable'}">
                            ${e2eExists ? 'Report Available' : 'No Report'}
                        </span>
                    </div>
                </div>
                
                <p class="card-description">
                    Playwright-based browser tests that verify critical user journeys 
                    through the FlashMath Arena UI.
                </p>
                
                ${e2eResults ? `
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value passed">${e2eResults.stats?.expected || 0}</div>
                        <div class="stat-label">Passed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value failed">${e2eResults.stats?.unexpected || 0}</div>
                        <div class="stat-label">Failed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value skipped">${e2eResults.stats?.skipped || 0}</div>
                        <div class="stat-label">Skipped</div>
                    </div>
                </div>
                ` : `
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" style="color: #888">-</div>
                        <div class="stat-label">Passed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" style="color: #888">-</div>
                        <div class="stat-label">Failed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" style="color: #888">-</div>
                        <div class="stat-label">Skipped</div>
                    </div>
                </div>
                `}
                
                <a href="/e2e/index.html" class="btn ${e2eExists ? 'btn-primary' : 'btn-disabled'}" 
                   ${!e2eExists ? 'onclick="return false"' : ''}>
                    ${e2eExists ? 'View Full Report →' : 'Run tests first'}
                </a>
                
                ${e2eResults ? `
                <p class="timestamp">
                    Duration: ${((e2eResults.stats?.duration || 0) / 1000).toFixed(1)}s
                </p>
                ` : ''}
            </div>
            
            <!-- Socket Tests Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon socket">🔌</div>
                    <div>
                        <h2>Socket Integration Tests</h2>
                        <span class="status-badge ${socketExists ? 'status-available' : 'status-unavailable'}">
                            ${socketExists ? 'Results Available' : 'No Results'}
                        </span>
                    </div>
                </div>
                
                <p class="card-description">
                    Headless Socket.io tests that verify server-side match logic, 
                    IGL/Anchor roles, and real-time synchronization.
                </p>
                
                ${socketResults ? `
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value passed">${socketResults.passed || 0}</div>
                        <div class="stat-label">Passed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value failed">${socketResults.failed || 0}</div>
                        <div class="stat-label">Failed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value skipped">${socketResults.skipped || 0}</div>
                        <div class="stat-label">Skipped</div>
                    </div>
                </div>
                ` : `
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" style="color: #888">-</div>
                        <div class="stat-label">Passed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" style="color: #888">-</div>
                        <div class="stat-label">Failed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" style="color: #888">-</div>
                        <div class="stat-label">Skipped</div>
                    </div>
                </div>
                `}
                
                <a href="/api/socket-results" class="btn ${socketExists ? 'btn-secondary' : 'btn-disabled'}"
                   ${!socketExists ? 'onclick="return false"' : ''}>
                    ${socketExists ? 'View JSON Results →' : 'Run tests first'}
                </a>
                
                ${socketResults ? `
                <p class="timestamp">
                    Duration: ${((socketResults.duration || 0) / 1000).toFixed(1)}s
                </p>
                ` : ''}
            </div>
        </div>
        
        <!-- Recent History -->
        ${recentRuns.length > 0 ? `
        <div class="history-section">
            <div class="section-header">
                <h3>📊 Recent Test Runs</h3>
                <a href="/history" class="btn btn-secondary btn-small">View All History →</a>
            </div>
            <div class="history-table">
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>E2E Tests</th>
                            <th>Socket Tests</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentRuns.map(run => `
                        <tr>
                            <td>
                                <span class="run-id">${run.id}</span>
                                <span class="run-time">${formatDate(run.timestamp)}</span>
                            </td>
                            <td>
                                ${run.e2e ? `
                                <span class="result-badge ${run.e2e.failed > 0 ? 'failed' : 'passed'}">
                                    ${run.e2e.passed}/${run.e2e.total}
                                </span>
                                ` : '<span class="result-badge na">N/A</span>'}
                            </td>
                            <td>
                                ${run.socket ? `
                                <span class="result-badge ${run.socket.failed > 0 ? 'failed' : 'passed'}">
                                    ${run.socket.passed}/${run.socket.total}
                                </span>
                                ` : '<span class="result-badge na">N/A</span>'}
                            </td>
                            <td>
                                <a href="/history/${run.id}/e2e/index.html" class="btn btn-small btn-secondary">View</a>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
        
        <!-- Quick Actions -->
        <div class="quick-actions">
            <h3>🚀 Quick Commands</h3>
            <div class="command">
                <span class="command-prefix">$</span>
                npm run test:e2e
                <span style="margin-left: auto; color: #888; font-size: 0.8rem;">Run E2E tests</span>
            </div>
            <div class="command">
                <span class="command-prefix">$</span>
                npm run test:arena:all -- --server=http://localhost:3001
                <span style="margin-left: auto; color: #888; font-size: 0.8rem;">Run socket tests</span>
            </div>
            <div class="command">
                <span class="command-prefix">$</span>
                npm run test:history
                <span style="margin-left: auto; color: #888; font-size: 0.8rem;">Run all with history</span>
            </div>
        </div>
        
        <footer>
            <p>FlashMath Test Report Viewer • Auto-refreshes every 30 seconds</p>
        </footer>
    </div>
    
    <button class="refresh-btn" onclick="location.reload()" title="Refresh">↻</button>
    
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
    `;
}

// History page generator
function generateHistoryPage(historyRuns) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test History - FlashMath</title>
    <style>
        ${getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>⚡ FlashMath Test History</h1>
            <p class="subtitle">${historyRuns.length} archived test runs</p>
        </header>
        
        <nav class="nav-tabs">
            <a href="/" class="nav-tab">Dashboard</a>
            <a href="/history" class="nav-tab active">History</a>
        </nav>
        
        ${historyRuns.length > 0 ? `
        
        <!-- Trend Chart -->
        <div class="trend-section">
            <h3>📈 Pass Rate Trend (Last 10 Runs)</h3>
            <div class="trend-chart">
                ${generateTrendChart(historyRuns.slice(0, 10))}
            </div>
        </div>
        
        <!-- Full History Table -->
        <div class="history-section">
            <h3>📋 All Test Runs</h3>
            <div class="history-table full">
                <table>
                    <thead>
                        <tr>
                            <th>Run ID</th>
                            <th>Date/Time</th>
                            <th>E2E Passed</th>
                            <th>E2E Failed</th>
                            <th>Socket Passed</th>
                            <th>Socket Failed</th>
                            <th>Duration</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyRuns.map(run => `
                        <tr class="${(run.e2e?.failed > 0 || run.socket?.failed > 0) ? 'row-failed' : ''}">
                            <td><code>${run.id}</code></td>
                            <td>${formatDate(run.timestamp)}</td>
                            <td class="num ${run.e2e?.passed > 0 ? 'passed' : ''}">${run.e2e?.passed ?? '-'}</td>
                            <td class="num ${run.e2e?.failed > 0 ? 'failed' : ''}">${run.e2e?.failed ?? '-'}</td>
                            <td class="num ${run.socket?.passed > 0 ? 'passed' : ''}">${run.socket?.passed ?? '-'}</td>
                            <td class="num ${run.socket?.failed > 0 ? 'failed' : ''}">${run.socket?.failed ?? '-'}</td>
                            <td class="num">${formatDuration(run.e2e?.duration, run.socket?.duration)}</td>
                            <td>
                                <a href="/history/${run.id}/e2e/index.html" class="btn btn-small btn-secondary">E2E</a>
                                <a href="/api/history/${run.id}" class="btn btn-small btn-secondary">JSON</a>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : `
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No Test History Yet</h3>
            <p>Run tests with history tracking to start building your archive:</p>
            <div class="command">
                <span class="command-prefix">$</span>
                npm run test:history
            </div>
        </div>
        `}
        
        <footer>
            <p>FlashMath Test Report Viewer</p>
        </footer>
    </div>
    
    <button class="refresh-btn" onclick="location.reload()" title="Refresh">↻</button>
</body>
</html>
    `;
}

// Generate simple ASCII trend chart
function generateTrendChart(runs) {
    if (runs.length === 0) return '';
    
    const data = runs.map(run => {
        const e2eTotal = (run.e2e?.passed || 0) + (run.e2e?.failed || 0);
        const socketTotal = (run.socket?.passed || 0) + (run.socket?.failed || 0);
        const totalPassed = (run.e2e?.passed || 0) + (run.socket?.passed || 0);
        const total = e2eTotal + socketTotal;
        return total > 0 ? Math.round((totalPassed / total) * 100) : 0;
    }).reverse();
    
    const maxHeight = 100;
    const barWidth = 40;
    
    return `
    <div class="chart-container">
        ${data.map((pct, i) => `
        <div class="chart-bar-container">
            <div class="chart-bar ${pct === 100 ? 'perfect' : pct >= 80 ? 'good' : 'bad'}" 
                 style="height: ${pct}%">
            </div>
            <div class="chart-label">${pct}%</div>
        </div>
        `).join('')}
    </div>
    `;
}

function formatDate(isoString) {
    if (!isoString) return 'Unknown';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(e2eDuration, socketDuration) {
    const total = (e2eDuration || 0) + (socketDuration || 0);
    if (total === 0) return '-';
    return (total / 1000).toFixed(1) + 's';
}

function getStyles() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%);
            min-height: 100vh;
            color: #e0e0e0;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        
        header {
            text-align: center;
            margin-bottom: 30px;
        }
        
        h1 {
            font-size: 3rem;
            background: linear-gradient(135deg, #b967ff 0%, #05d9e8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 10px;
        }
        
        .subtitle {
            color: #888;
            font-size: 1.1rem;
        }
        
        .nav-tabs {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 40px;
        }
        
        .nav-tab {
            padding: 12px 24px;
            border-radius: 10px;
            text-decoration: none;
            color: #888;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        }
        
        .nav-tab:hover {
            color: #fff;
            background: rgba(255, 255, 255, 0.1);
        }
        
        .nav-tab.active {
            color: #fff;
            background: linear-gradient(135deg, #b967ff 0%, #7c3aed 100%);
            border-color: transparent;
        }
        
        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 30px;
            transition: all 0.3s ease;
        }
        
        .card:hover {
            border-color: rgba(185, 103, 255, 0.5);
            transform: translateY(-5px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .card-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .card-icon {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        
        .card-icon.e2e {
            background: linear-gradient(135deg, #b967ff 0%, #7c3aed 100%);
        }
        
        .card-icon.socket {
            background: linear-gradient(135deg, #05d9e8 0%, #0ea5e9 100%);
        }
        
        .card h2 {
            font-size: 1.5rem;
            color: #fff;
        }
        
        .card-description {
            color: #888;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 25px;
        }
        
        .stat {
            text-align: center;
            padding: 15px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
        }
        
        .stat-value.passed { color: #22c55e; }
        .stat-value.failed { color: #ef4444; }
        .stat-value.skipped { color: #eab308; }
        
        .stat-label {
            font-size: 0.8rem;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .btn {
            display: inline-block;
            padding: 12px 24px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
            text-align: center;
        }
        
        .btn-small {
            padding: 6px 12px;
            font-size: 0.85rem;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #b967ff 0%, #7c3aed 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 30px rgba(185, 103, 255, 0.3);
        }
        
        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: #e0e0e0;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
        }
        
        .btn-disabled {
            background: rgba(255, 255, 255, 0.05);
            color: #666;
            cursor: not-allowed;
        }
        
        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .status-available {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.3);
        }
        
        .status-unavailable {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .result-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
        }
        
        .result-badge.passed {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }
        
        .result-badge.failed {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }
        
        .result-badge.na {
            background: rgba(255, 255, 255, 0.1);
            color: #888;
        }
        
        .timestamp {
            color: #666;
            font-size: 0.85rem;
            margin-top: 15px;
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        .section-header h3 {
            color: #b967ff;
        }
        
        .history-section, .trend-section {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 30px;
        }
        
        .history-section h3, .trend-section h3 {
            margin-bottom: 20px;
            color: #b967ff;
        }
        
        .history-table {
            overflow-x: auto;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        th {
            background: rgba(0, 0, 0, 0.2);
            color: #888;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 1px;
        }
        
        tr:hover {
            background: rgba(255, 255, 255, 0.03);
        }
        
        tr.row-failed {
            background: rgba(239, 68, 68, 0.05);
        }
        
        .num {
            text-align: center;
            font-family: 'Fira Code', monospace;
        }
        
        .num.passed { color: #22c55e; }
        .num.failed { color: #ef4444; }
        
        .run-id {
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
            color: #05d9e8;
        }
        
        .run-time {
            display: block;
            font-size: 0.75rem;
            color: #666;
        }
        
        .quick-actions {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 25px;
        }
        
        .quick-actions h3 {
            margin-bottom: 15px;
            color: #b967ff;
        }
        
        .command {
            background: #1a1a2e;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px 15px;
            font-family: 'Fira Code', 'Monaco', monospace;
            font-size: 0.9rem;
            color: #05d9e8;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .command-prefix {
            color: #888;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
        }
        
        .empty-icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        
        .empty-state h3 {
            margin-bottom: 10px;
            color: #fff;
        }
        
        .empty-state p {
            color: #888;
            margin-bottom: 20px;
        }
        
        .chart-container {
            display: flex;
            align-items: flex-end;
            justify-content: space-around;
            height: 150px;
            padding: 20px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
        }
        
        .chart-bar-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 40px;
        }
        
        .chart-bar {
            width: 30px;
            border-radius: 4px 4px 0 0;
            transition: height 0.3s ease;
        }
        
        .chart-bar.perfect {
            background: linear-gradient(to top, #22c55e, #4ade80);
        }
        
        .chart-bar.good {
            background: linear-gradient(to top, #eab308, #facc15);
        }
        
        .chart-bar.bad {
            background: linear-gradient(to top, #ef4444, #f87171);
        }
        
        .chart-label {
            font-size: 0.7rem;
            color: #888;
            margin-top: 5px;
        }
        
        footer {
            text-align: center;
            margin-top: 50px;
            color: #666;
            font-size: 0.9rem;
        }
        
        .refresh-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #b967ff 0%, #7c3aed 100%);
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(185, 103, 255, 0.3);
            transition: all 0.3s ease;
        }
        
        .refresh-btn:hover {
            transform: scale(1.1) rotate(180deg);
        }
        
        code {
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
        }
    `;
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║       FlashMath Test Report Viewer                    ║
║                                                       ║
║   Dashboard:  http://localhost:${PORT}                   ║
║   History:    http://localhost:${PORT}/history           ║
║   E2E Report: http://localhost:${PORT}/e2e               ║
║   Health:     http://localhost:${PORT}/health            ║
╚═══════════════════════════════════════════════════════╝
    `);
});
