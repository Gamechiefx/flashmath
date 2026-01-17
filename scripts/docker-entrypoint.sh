#!/bin/sh
# FlashMath Docker Entrypoint
# Runs database migrations before starting the application

set -e

echo "========================================"
echo "FlashMath Docker Entrypoint"
echo "========================================"

# Wait for PostgreSQL to be ready (if configured)
if [ -n "$POSTGRES_HOST" ]; then
    echo "[Entrypoint] Waiting for PostgreSQL at $POSTGRES_HOST:${POSTGRES_PORT:-5432}..."
    
    MAX_RETRIES=30
    RETRY_COUNT=0
    
    until nc -z "$POSTGRES_HOST" "${POSTGRES_PORT:-5432}" 2>/dev/null; do
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
            echo "[Entrypoint] ERROR: PostgreSQL not ready after $MAX_RETRIES attempts"
            exit 1
        fi
        echo "[Entrypoint] PostgreSQL not ready yet, waiting... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    done
    
    echo "[Entrypoint] PostgreSQL is ready!"
fi

# Wait for Redis to be ready (if configured)
if [ -n "$REDIS_HOST" ]; then
    echo "[Entrypoint] Waiting for Redis at $REDIS_HOST:${REDIS_PORT:-6379}..."
    
    MAX_RETRIES=30
    RETRY_COUNT=0
    
    until nc -z "$REDIS_HOST" "${REDIS_PORT:-6379}" 2>/dev/null; do
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
            echo "[Entrypoint] ERROR: Redis not ready after $MAX_RETRIES attempts"
            exit 1
        fi
        echo "[Entrypoint] Redis not ready yet, waiting... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    done
    
    echo "[Entrypoint] Redis is ready!"
fi

# Run database migrations
echo "[Entrypoint] Running database migrations..."

# Check if we should skip migrations (useful for debugging)
if [ "$SKIP_MIGRATIONS" = "true" ]; then
    echo "[Entrypoint] SKIP_MIGRATIONS=true, skipping migrations"
else
    # Run migrations using the compiled migration runner
    # In production, we use node directly on the compiled JS
    if [ -f "dist/lib/db/migrations/migration-runner.js" ]; then
        node dist/lib/db/migrations/migration-runner.js up
    elif [ -f "node_modules/.bin/ts-node" ]; then
        # In development, use ts-node
        npx ts-node src/lib/db/migrations/migration-runner.ts up
    else
        echo "[Entrypoint] WARNING: Migration runner not found, skipping migrations"
        echo "[Entrypoint] Falling back to legacy auto-migration in sqlite.ts"
    fi
fi

echo "[Entrypoint] Migrations complete!"
echo "========================================"

# Execute the main command
echo "[Entrypoint] Starting application..."
exec "$@"
