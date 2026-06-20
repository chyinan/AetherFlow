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
RUN addgroup -S app && adduser -S app -G app
WORKDIR /dist
COPY --from=frontend-builder /app/dist/ ./
RUN mkdir -p /output && chown -R app:app /dist /output
USER app
CMD ["sh", "-c", "rm -rf /output/* && cp -R /dist/. /output && echo 'AetherFlow frontend dist exported to /output'"]

FROM nginx:1.27-alpine AS nginx-runtime
RUN mkdir -p /var/cache/nginx /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp \
    && chown -R nginx:nginx /var/cache/nginx /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp /etc/nginx /var/log/nginx /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /app/dist/ /usr/share/nginx/html/
RUN chown -R nginx:nginx /usr/share/nginx/html /etc/nginx
USER nginx
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health | grep -q ok || exit 1
