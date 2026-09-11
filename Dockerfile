# syntax=docker/dockerfile:1
# Cloud Run: the container MUST listen on 0.0.0.0:$PORT (default 8080).

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY --from=build /app/dist ./dist
COPY server.js ./

USER node
EXPOSE 8080

CMD ["node", "server.js"]
