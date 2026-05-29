# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend-builder
WORKDIR /app

ARG VITE_API_BASE=/api
ARG VITE_WS_BASE=/ws
ARG VITE_SSE_BASE=/sse
ARG VITE_MOCK_FALLBACK=true
ARG VITE_NOTIFY_WS_FALLBACK=true
ARG VITE_API_TIMEOUT_MS=15000
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_WS_BASE=${VITE_WS_BASE}
ENV VITE_SSE_BASE=${VITE_SSE_BASE}
ENV VITE_MOCK_FALLBACK=${VITE_MOCK_FALLBACK}
ENV VITE_NOTIFY_WS_FALLBACK=${VITE_NOTIFY_WS_FALLBACK}
ENV VITE_API_TIMEOUT_MS=${VITE_API_TIMEOUT_MS}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM alpine:3.20 AS frontend-dist
WORKDIR /dist
COPY --from=frontend-builder /app/dist/ ./
RUN mkdir -p /output
CMD ["sh", "-c", "rm -rf /output/* && cp -R /dist/. /output && echo 'AetherFlow frontend dist exported to /output'"]

FROM nginx:1.27-alpine AS nginx-runtime
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /app/dist/ /usr/share/nginx/html/
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health | grep -q ok || exit 1
