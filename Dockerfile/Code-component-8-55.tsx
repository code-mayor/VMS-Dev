# Multi-stage build for production
FROM node:18-alpine AS builder

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .env.example .env

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    ffmpeg \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S onvif -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=onvif:nodejs /app/dist ./dist
COPY --from=builder --chown=onvif:nodejs /app/server ./server
COPY --from=builder --chown=onvif:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=onvif:nodejs /app/package.json ./
COPY --from=builder --chown=onvif:nodejs /app/.env ./

# Create local directories
RUN mkdir -p ./local/logs ./local/recordings ./local/thumbnails
RUN chown -R onvif:nodejs ./local

# Switch to non-root user
USER onvif

# Expose ports
EXPOSE 3000 3001 3702/udp 8554

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]