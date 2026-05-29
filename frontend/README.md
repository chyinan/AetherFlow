# AetherFlow Frontend

AetherFlow frontend is a Vue 3 workflow console scaffold for the first joint integration phase.

## Stack

- Vue 3 + Vite + TypeScript
- Pinia
- Vue Router
- TailwindCSS
- Vue Flow
- Lucide icons
- Axios service layer
- Mock API and mock realtime driver

## Commands

```shell
npm install
npm run build
```

All pages call `src/services/api/**` or `src/services/realtime/**`. They do not call Axios directly.

## Deployment

Frontend build and deployment are driven by Nginx:

- `VITE_API_BASE` defaults to `/api`
- `VITE_WS_BASE` defaults to `/ws`
- static output is written to `dist/`
- `frontend/nginx/nginx.conf` serves Vue Router history fallback with `try_files $uri /index.html`

The production container is built from `frontend/nginx/Dockerfile`.

