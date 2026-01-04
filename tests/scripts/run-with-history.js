#!/usr/bin/env node

/**
 * Test Runner with History
 * 
 * Runs tests and automatically archives results with timestamps.
 * 
 * Usage:
 *   node run-with-history.js --type=e2e
 *   node run-with-history.js --type=socket --server=http://localhost:3001
 *   node run-with-history.js --type=all --server=http://localhost:3001
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const typeArg = args.find(a => a.startsWith('--type='));
const serverArg = args.find(a => a.startsWith('--server='));

const type = typeArg ? typeArg.split('=')[1] : 'all';
const server = serverArg ? serverArg.split('=')[1] : 'http://localhost:3001';

const projectRoot = path.join(__dirname, '../..');

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 Running: ${command} ${args.join(' ')}\n`);
        
        const proc = spawn(command, args, {
            cwd: projectRoot,
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, CI: '1' },
            ...options,
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                // Don't reject - we still want to archive failed results
                console.log(`\n⚠️  Command exited with code ${code}`);
                resolve();
            }
        });
        
        proc.on('error', (err) => {
            console.error('Failed to start process:', err);
            resolve(); // Still try to archive
        });
    });
}

async function main() {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║         FlashMath Test Runner with History            ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    
    // Run E2E tests
    if (type === 'e2e' || type === 'all') {
        console.log('\n📋 Running E2E Browser Tests...\n');
        await runCommand('npm', ['run', 'test:e2e']);
    }
    
    // Run Socket tests
    if (type === 'socket' || type === 'all') {
        console.log('\n📋 Running Socket Integration Tests...\n');
        
        // Ensure results directory exists
        const resultsDir = path.join(__dirname, '../arena/results');
        require('fs').mkdirSync(resultsDir, { recursive: true });
        
        await runCommand('npm', [
            'run', 'test:arena:all',
            '--', 
            `--server=${server}`,
            '--json',
            `--output=${resultsDir}/results.json`
        ]);
    }
    
    // Archive results
    console.log('\n📦 Archiving Results...\n');
    await runCommand('node', [
        path.join(__dirname, 'archive-results.js'),
        `--type=${type}`
    ]);
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║                    Tests Complete!                    ║');
    console.log('║                                                       ║');
    console.log('║   View results: http://localhost:9400                 ║');
    console.log('║   View history: http://localhost:9400/history         ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(console.error);

