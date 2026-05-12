FROM mcr.microsoft.com/playwright:v1.52.0-noble AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build
RUN npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.52.0-noble

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    HEADLESS=true \
    LOG_LEVEL=info

WORKDIR /app

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config

VOLUME ["/app/data"]

CMD ["node", "dist/index.js", "start"]
