# syntax=docker/dockerfile:1
# Distinct Cloud Run service: pulzivo-analytics-api
# Do NOT deploy this image over the Pulzivo SPA service named `analytics`.

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

USER node
EXPOSE 8080

CMD ["node", "server.js"]
