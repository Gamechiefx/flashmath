#!/usr/bin/env node

/**
 * Test Results Archiver
 * 
 * Archives test results with timestamps for history tracking.
 * Creates a structured archive with metadata for dashboard display.
 * 
 * Usage:
 *   node archive-results.js --type=e2e
 *   node archive-results.js --type=socket
 *   node archive-results.js --type=all
 */

const fs = require('fs');
const path = require('path');

const ARCHIVE_DIR = path.join(__dirname, '../history');
const E2E_REPORT_DIR = path.join(__dirname, '../e2e/playwright-report');
const E2E_RESULTS_FILE = path.join(__dirname, '../e2e/playwright-report/results.json');
const SOCKET_RESULTS_DIR = path.join(__dirname, '../arena/results');

// Parse arguments
const args = process.argv.slice(2);
const typeArg = args.find(a => a.startsWith('--type='));
const type = typeArg ? typeArg.split('=')[1] : 'all';

// Generate timestamp
function getTimestamp() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

// Copy directory recursively
function copyDir(src, dest) {
    if (!fs.existsSync(src)) return false;
    
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
    return true;
}

// Copy file
function copyFile(src, dest) {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

// Load history index
function loadHistoryIndex() {
    const indexPath = path.join(ARCHIVE_DIR, 'index.json');
    if (fs.existsSync(indexPath)) {
        return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
    return { runs: [] };
}

// Save history index
function saveHistoryIndex(index) {
    const indexPath = path.join(ARCHIVE_DIR, 'index.json');
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

// Parse E2E results
function parseE2EResults() {
    if (!fs.existsSync(E2E_RESULTS_FILE)) return null;
    
    try {
        const data = JSON.parse(fs.readFileSync(E2E_RESULTS_FILE, 'utf-8'));
        return {
            passed: data.stats?.expected || 0,
            failed: data.stats?.unexpected || 0,
            skipped: data.stats?.skipped || 0,
            duration: data.stats?.duration || 0,
            total: (data.stats?.expected || 0) + (data.stats?.unexpected || 0) + (data.stats?.skipped || 0),
        };
    } catch (e) {
        console.error('Failed to parse E2E results:', e.message);
        return null;
    }
}

// Parse Socket results
function parseSocketResults() {
    const resultsFile = path.join(SOCKET_RESULTS_DIR, 'results.json');
    if (!fs.existsSync(resultsFile)) return null;
    
    try {
        const data = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
        return {
            passed: data.passed || 0,
            failed: data.failed || 0,
            skipped: data.skipped || 0,
            duration: data.duration || 0,
            total: (data.passed || 0) + (data.failed || 0) + (data.skipped || 0),
        };
    } catch (e) {
        console.error('Failed to parse Socket results:', e.message);
        return null;
    }
}

// Main archive function
function archiveResults() {
    const timestamp = getTimestamp();
    const runDir = path.join(ARCHIVE_DIR, timestamp);
    
    console.log(`\n📦 Archiving test results: ${timestamp}\n`);
    
    const runData = {
        id: timestamp,
        timestamp: new Date().toISOString(),
        e2e: null,
        socket: null,
    };
    
    // Archive E2E results
    if (type === 'e2e' || type === 'all') {
        const e2eArchiveDir = path.join(runDir, 'e2e');
        
        if (fs.existsSync(E2E_REPORT_DIR)) {
            copyDir(E2E_REPORT_DIR, e2eArchiveDir);
            // Results.json is now inside the report directory
            runData.e2e = parseE2EResults();
            console.log(`   ✅ E2E report archived`);
            if (runData.e2e) {
                console.log(`      Passed: ${runData.e2e.passed}, Failed: ${runData.e2e.failed}, Skipped: ${runData.e2e.skipped}`);
            }
        } else {
            console.log(`   ⚠️  No E2E report found`);
        }
    }
    
    // Archive Socket results
    if (type === 'socket' || type === 'all') {
        const socketArchiveDir = path.join(runDir, 'socket');
        
        if (fs.existsSync(SOCKET_RESULTS_DIR)) {
            copyDir(SOCKET_RESULTS_DIR, socketArchiveDir);
            runData.socket = parseSocketResults();
            console.log(`   ✅ Socket results archived`);
            if (runData.socket) {
                console.log(`      Passed: ${runData.socket.passed}, Failed: ${runData.socket.failed}, Skipped: ${runData.socket.skipped}`);
            }
        } else {
            console.log(`   ⚠️  No Socket results found`);
        }
    }
    
    // Update latest symlink
    const latestLink = path.join(ARCHIVE_DIR, 'latest');
    try {
        if (fs.existsSync(latestLink)) {
            fs.unlinkSync(latestLink);
        }
        fs.symlinkSync(timestamp, latestLink);
        console.log(`   🔗 Updated 'latest' symlink`);
    } catch (e) {
        console.log(`   ⚠️  Could not create symlink: ${e.message}`);
    }
    
    // Update history index
    const index = loadHistoryIndex();
    index.runs.unshift(runData); // Add to beginning (newest first)
    
    // Keep only last 50 runs in index (archives still exist)
    if (index.runs.length > 50) {
        index.runs = index.runs.slice(0, 50);
    }
    
    saveHistoryIndex(index);
    console.log(`   📊 Updated history index (${index.runs.length} runs)\n`);
    
    console.log(`📁 Archive location: ${runDir}\n`);
    
    return runData;
}

// Run
archiveResults();

