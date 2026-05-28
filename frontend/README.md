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

