#!/bin/bash
# ==============================================================================
# FlashMath Database Backup Script
# ==============================================================================
#
# Creates timestamped backups of the SQLite database
#
# Usage:
#   ./scripts/backup-database.sh
#   ./scripts/backup-database.sh /path/to/backup/dir
#
# Recommended: Add to crontab for daily backups
#   0 2 * * * /path/to/FlashMath/scripts/backup-database.sh
#
# ==============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${PROJECT_DIR}/data/flashmath.db"
BACKUP_DIR="${1:-${PROJECT_DIR}/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/flashmath_${TIMESTAMP}.db"
MAX_BACKUPS=30  # Keep last 30 backups

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}FlashMath Database Backup${NC}"
echo "================================"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}Error: Database not found at ${DB_PATH}${NC}"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database is locked (WAL mode)
if [ -f "${DB_PATH}-wal" ]; then
    echo -e "${YELLOW}Warning: Database has active WAL file. Running checkpoint...${NC}"
    # If running in Docker, use docker exec
    if docker ps --format '{{.Names}}' | grep -q "flashmath-dev"; then
        docker exec flashmath-dev sqlite3 /app/data/flashmath.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
    elif command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
    fi
fi

# Create backup using SQLite .backup command (safe for concurrent access)
echo "Creating backup: ${BACKUP_FILE}"
if docker ps --format '{{.Names}}' | grep -q "flashmath-dev"; then
    # Backup via Docker container
    docker exec flashmath-dev sqlite3 /app/data/flashmath.db ".backup '/app/data/backup_temp.db'" 2>/dev/null
    cp "${PROJECT_DIR}/data/backup_temp.db" "$BACKUP_FILE"
    rm -f "${PROJECT_DIR}/data/backup_temp.db"
elif command -v sqlite3 &> /dev/null; then
    # Backup directly with sqlite3
    sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"
else
    # Fallback: simple copy (less safe during writes)
    echo -e "${YELLOW}Warning: sqlite3 not available, using file copy${NC}"
    cp "$DB_PATH" "$BACKUP_FILE"
fi

# Compress the backup
if command -v gzip &> /dev/null; then
    gzip "$BACKUP_FILE"
    BACKUP_FILE="${BACKUP_FILE}.gz"
    echo "Compressed backup: ${BACKUP_FILE}"
fi

# Get backup size
BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo -e "${GREEN}Backup created successfully: ${BACKUP_FILE} (${BACKUP_SIZE})${NC}"

# Cleanup old backups
echo ""
echo "Cleaning up old backups (keeping last ${MAX_BACKUPS})..."
cd "$BACKUP_DIR"
ls -t flashmath_*.db* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f
REMAINING=$(ls flashmath_*.db* 2>/dev/null | wc -l)
echo "Backups remaining: ${REMAINING}"

echo ""
echo -e "${GREEN}Backup complete!${NC}"
