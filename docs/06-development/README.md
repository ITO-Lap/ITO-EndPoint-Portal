# Development Guide

---

## Prerequisites

| Tool | Minimum version | Check with |
|---|---|---|
| Node.js | 20.x | `node --version` |
| npm | 10.x | `npm --version` |

No other tools required. All services (Intune, Kandji, ManageEngine, OpenAI) are mocked by default.

---

## First-time setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd endpoint-ai-copilot

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
npm --prefix server install

# 4. Set up environment (optional — runs on mock data without this)
cp server/.env.example server/.env
# Edit server/.env to add real credentials if needed
```

---

## Running the dev environment

```bash
npm run dev
```

This starts both:
- **Vite** dev server on `http://localhost:5173` (frontend)
- **Express** server on `http://localhost:4000` (backend)

They run concurrently via `concurrently`. Vite proxies `/api` requests to port 4000.

---

## Environment variables

All backend config lives in `server/.env`. The frontend uses `VITE_*` env vars (in `.env` at the project root).

### Backend (`server/.env`)

```env
# Server port (default: 4000)
PORT=4000

# OpenAI — enables AI analysis and chat
OPENAI_API_KEY=sk-proj-...

# Microsoft Intune
INTUNE_TENANT_ID=
INTUNE_CLIENT_ID=
INTUNE_CLIENT_SECRET=
INTUNE_ENDPOINT=          # Optional: override for Gov Cloud

# Kandji
KANDJI_API_URL=https://myorg.api.kandji.io
KANDJI_API_TOKEN=

# ManageEngine
MANAGEENGINE_URL=
MANAGEENGINE_API_KEY=
```

### Frontend (`.env` at project root, optional)

```env
# Override the API server URL (default: http://localhost:4000)
VITE_API_URL=http://localhost:4000
```

---

## Build for production

```bash
npm run build
```

Outputs:
- `dist/` — built frontend (serve with nginx or `npm run preview`)
- `server/dist/` — compiled server JS (run with `node server/dist/index.js`)

---

## Linting

```bash
npm run lint
```

Runs ESLint with React hooks rules and TypeScript-eslint on all source files.

---

## Server startup log

When the server starts, it logs which integrations are configured:

```
Server listening on http://localhost:4000
  Intune:       ✓ configured
  Kandji:       — mock data
  ManageEngine: — mock data
  OpenAI:       ✓ configured
```

---

## Further reading

- [Local Setup Guide](SETUP.md) — step-by-step with common issues
- [Quick Modifications Cookbook](QUICK-MODS.md) — recipes for common changes
