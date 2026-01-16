#!/bin/bash

# Script to batch remove unused variables and imports
# Uses ESLint auto-fix where possible, then manual cleanup

set -e

echo "🧹 Cleaning up unused variables and imports..."
echo ""

# Step 1: Use ESLint auto-fix for imports (safest)
echo "1️⃣ Running ESLint auto-fix for unused imports..."
npx eslint src --fix --quiet 2>&1 | grep -v "warning" || true

# Step 2: Get list of files with unused variables
echo ""
echo "2️⃣ Finding files with unused variables..."
FILES=$(npx eslint src 2>&1 | grep "never used" | awk -F: '{print $1}' | sort -u)

if [ -z "$FILES" ]; then
    echo "✅ No unused variables found!"
    exit 0
fi

echo "Found unused variables in $(echo "$FILES" | wc -l) files"
echo ""

# Step 3: For each file, show what can be removed
echo "3️⃣ Analyzing unused variables..."
for file in $FILES; do
    if [ -f "$file" ]; then
        echo "📄 $file"
        npx eslint "$file" 2>&1 | grep "never used" | head -3 | sed 's/^/   /'
    fi
done

echo ""
echo "⚠️  Manual review recommended for:"
echo "   - Variables used for type inference (e.g., VALID_OPERATIONS)"
echo "   - Function parameters required by interfaces"
echo "   - Variables kept for future functionality"
echo ""
echo "💡 To remove dead code, edit files manually or use:"
echo "   npx eslint src --fix"
echo "   (This will auto-fix imports and some simple cases)"
