FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

ENV NODE_OPTIONS="--max-old-space-size=4096"

ENV DB_POOL_MAX=20
ENV DB_POOL_IDLE_TIMEOUT=30000
ENV DB_POOL_CONNECTION_TIMEOUT=300000
ENV DB_STATEMENT_TIMEOUT=180000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
