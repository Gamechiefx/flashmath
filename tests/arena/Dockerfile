# Arena Test Runner Dockerfile
# Runs synthetic test clients without a GUI

FROM node:20-alpine

# Install dependencies for socket.io-client
RUN apk add --no-cache \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install socket.io-client typescript ts-node @types/node

# Copy test files
COPY tests/arena ./tests/arena
COPY tsconfig.json ./

# Create a simple tsconfig for tests
RUN echo '{ \
  "compilerOptions": { \
    "target": "ES2020", \
    "module": "commonjs", \
    "esModuleInterop": true, \
    "strict": true, \
    "skipLibCheck": true, \
    "outDir": "./dist", \
    "rootDir": "." \
  }, \
  "include": ["tests/**/*"] \
}' > tsconfig.test.json

# Default command
ENTRYPOINT ["npx", "ts-node", "--project", "tsconfig.test.json", "tests/arena/runner.ts"]

# Default args (can be overridden)
CMD ["--server=http://host.docker.internal:3000"]

