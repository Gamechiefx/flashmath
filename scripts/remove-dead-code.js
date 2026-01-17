#!/usr/bin/env node

/**
 * Aggressively removes unused variables and imports
 * BE CAREFUL: Review changes before committing!
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Variables that MUST be kept (used for type inference, etc.)
const KEEP_VARS = new Set([
  'VALID_OPERATIONS', // type Operation = typeof VALID_OPERATIONS[number]
]);

// Get all unused variable warnings
function getUnusedVars() {
  try {
    const output = execSync('npx eslint src 2>&1', { encoding: 'utf8' });
    const warnings = [];
    
    output.split('\n').forEach(line => {
      const match = line.match(/^(.+?):(\d+):\d+\s+warning\s+'(\w+)'.*never used/);
      if (match) {
        const [, file, lineNum, varName] = match;
        if (!KEEP_VARS.has(varName)) {
          warnings.push({ file, line: parseInt(lineNum), varName });
        }
      }
    });
    
    return warnings;
  } catch (e) {
    return [];
  }
}

// Remove unused import
function removeUnusedImport(filePath, varName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let modified = false;
  
  lines.forEach((line, idx) => {
    // Match import statements
    const importMatch = line.match(/import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from/);
    if (importMatch) {
      // Check if this import line contains the unused var
      if (line.includes(varName)) {
        // Remove from named imports: { A, B, unusedVar, C } -> { A, B, C }
        const namedImportMatch = line.match(/import\s+\{([^}]+)\}\s+from/);
        if (namedImportMatch) {
          const imports = namedImportMatch[1]
            .split(',')
            .map(i => i.trim())
            .filter(i => {
              const name = i.split(' as ')[0].trim();
              return name !== varName && name !== `type ${varName}`;
            });
          
          if (imports.length < namedImportMatch[1].split(',').length) {
            if (imports.length === 0) {
              // Remove entire import line if no imports left
              lines[idx] = '';
            } else {
              lines[idx] = line.replace(/\{[^}]+\}/, `{ ${imports.join(', ')} }`);
            }
            modified = true;
          }
        }
      }
    }
  });
  
  if (modified) {
    fs.writeFileSync(filePath, lines.filter(l => l !== '' || lines.indexOf(l) === 0).join('\n'), 'utf8');
    return true;
  }
  return false;
}

// Remove unused variable declaration
function removeUnusedVar(filePath, lineNum, varName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const lineIdx = lineNum - 1;
  
  if (lineIdx < 0 || lineIdx >= lines.length) return false;
  
  const line = lines[lineIdx];
  
  // Match: const/let/var varName = ...
  const varDeclMatch = line.match(/^\s*(const|let|var)\s+(\w+)\s*=/);
  if (varDeclMatch && varDeclMatch[2] === varName) {
    // Remove the line
    lines[lineIdx] = '';
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return true;
  }
  
  // Match unused function parameter
  const funcParamMatch = line.match(/function\s+\w+\s*\([^)]*\)/);
  if (funcParamMatch) {
    // This is more complex - would need to parse function signature
    // Skip for now
  }
  
  return false;
}

// Main
console.log('🔍 Finding unused variables...\n');
const unusedVars = getUnusedVars();

console.log(`Found ${unusedVars.length} unused variables\n`);

// Group by file
const byFile = {};
unusedVars.forEach(({ file, line, varName }) => {
  if (!byFile[file]) byFile[file] = [];
  byFile[file].push({ line, varName });
});

let removed = 0;
let skipped = 0;

Object.entries(byFile).forEach(([file, vars]) => {
  console.log(`📄 ${file}`);
  vars.forEach(({ line, varName }) => {
    // Try to remove as import first
    if (removeUnusedImport(file, varName)) {
      console.log(`  ✅ Removed unused import: ${varName}`);
      removed++;
    } else if (removeUnusedVar(file, line, varName)) {
      console.log(`  ✅ Removed unused variable: ${varName} (line ${line})`);
      removed++;
    } else {
      console.log(`  ⚠️  Could not auto-remove: ${varName} (line ${line}) - manual review needed`);
      skipped++;
    }
  });
  console.log('');
});

console.log(`\n✅ Removed: ${removed}`);
console.log(`⚠️  Needs manual review: ${skipped}`);
console.log('\n💡 Run: npx eslint src --fix (for remaining imports)');
console.log('💡 Review changes with: git diff');
