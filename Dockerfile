FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Set Node to use maximum memory
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Optimize environment variables for large datasets
ENV DB_POOL_MAX=20
ENV DB_POOL_IDLE_TIMEOUT=30000
ENV DB_POOL_CONNECTION_TIMEOUT=5000
ENV DB_STATEMENT_TIMEOUT=180000

EXPOSE 3000

CMD ["node", "dist/index.js"]
