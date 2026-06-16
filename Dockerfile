# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend packages
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Set up Node.js Express Backend
FROM node:20-alpine
WORKDIR /app

# Install native dependencies required by sqlite3 build
RUN apk add --no-cache python3 make g++

# Copy backend packages
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --only=production

# Copy backend source
COPY backend/ ./

# Copy compiled frontend build to backend public folder for unified hosting
COPY --from=frontend-builder /app/frontend/dist ./public

# Setup persistent volume directory for SQLite
RUN mkdir -p /data
ENV DATABASE_PATH=/data/database.sqlite
ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

# Start server
CMD ["node", "src/index.js"]
