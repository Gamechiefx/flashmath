# FlashMath Test Report Viewer
# Serves Playwright HTML reports and test results via web UI

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy server
COPY server.js ./

# Create report directories
RUN mkdir -p /reports/e2e /reports/socket

# Expose port
EXPOSE 9400

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9400/health || exit 1

# Start server
CMD ["node", "server.js"]

