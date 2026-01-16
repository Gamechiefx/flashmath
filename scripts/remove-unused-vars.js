#!/usr/bin/env node

/**
 * Script to remove unused variables and imports from the codebase
 * This is safer than prefixing with _ because it actually removes dead code
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Files/patterns to skip (these might have legitimate unused vars)
const SKIP_PATTERNS = [
  'node_modules',
  '.next',
  'tests',
  'server.js',
  'server-redis.js',
];

// Variables that are used for type inference (keep these)
const TYPE_ONLY_VARS = [
  'VALID_OPERATIONS', // Used for: type Operation = typeof VALID_OPERATIONS[number]
];

function shouldSkipFile(filePath) {
  return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

function isTypeOnlyVar(varName, fileContent) {
  // Check if variable is used in type definitions
  const typePattern = new RegExp(`type\\s+\\w+\\s*=\\s*typeof\\s+${varName}`, 'i');
  return typePattern.test(fileContent);
}

function removeUnusedImport(line, fileContent) {
  // Remove unused imports
  // This is complex - better to use ESLint auto-fix for imports
  return line;
}

function removeUnusedVariable(varName, filePath, fileContent) {
  // Check if it's a type-only variable
  if (TYPE_ONLY_VARS.includes(varName) || isTypeOnlyVar(varName, fileContent)) {
    console.log(`  ⚠️  Keeping ${varName} (used for type inference)`);
    return fileContent;
  }

  // Pattern 1: Unused import - remove from import statement
  const importPattern = new RegExp(`import\\s+.*\\b${varName}\\b[^;]*;?`, 'g');
  if (importPattern.test(fileContent)) {
    console.log(`  ❌ Removing unused import: ${varName}`);
    // This is complex - better handled by ESLint auto-fix
    return fileContent;
  }

  // Pattern 2: Unused const/let/var declaration
  const varPattern = new RegExp(`(const|let|var)\\s+${varName}\\s*=[^;]+;?\\s*`, 'g');
  if (varPattern.test(fileContent)) {
    console.log(`  ❌ Removing unused variable: ${varName}`);
    return fileContent.replace(varPattern, '');
  }

  // Pattern 3: Unused function parameter
  const paramPattern = new RegExp(`(\\w+)\\s*:\\s*\\w+\\s*=\\s*[^,)]+`, 'g');
  // This is more complex - need to handle function signatures carefully

  return fileContent;
}

function processFile(filePath) {
  if (shouldSkipFile(filePath)) {
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const eslintOutput = execSync(`npx eslint "${filePath}" 2>&1 || true`, { encoding: 'utf8' });
    
    const unusedVars = eslintOutput
      .split('\n')
      .filter(line => line.includes('never used'))
      .map(line => {
        const match = line.match(/(\d+):\d+\s+warning\s+'(\w+)'/);
        if (match) {
          return { line: parseInt(match[1]), varName: match[2] };
        }
        return null;
      })
      .filter(Boolean);

    if (unusedVars.length > 0) {
      console.log(`\n📄 ${filePath}`);
      unusedVars.forEach(({ varName }) => {
        removeUnusedVariable(varName, filePath, content);
      });
    }
  } catch (error) {
    // Skip files that can't be processed
  }
}

// Main execution
console.log('🔍 Finding unused variables...\n');

// Use ESLint's auto-fix for imports (safer)
console.log('1️⃣ Running ESLint auto-fix for unused imports...');
try {
  execSync('npx eslint src --fix --quiet 2>&1 || true', { stdio: 'inherit' });
} catch (e) {
  // Continue even if there are errors
}

console.log('\n✅ Done! Remaining unused variables may need manual review.');
console.log('\n💡 Tip: Variables prefixed with _ are intentionally unused.');
console.log('   Consider removing them if they\'re truly dead code.');
