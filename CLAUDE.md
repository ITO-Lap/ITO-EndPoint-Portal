# ITO Endpoint AI Copilot — Developer Reference

> Quick orientation for contributors. Full docs live in `docs/`.

---

## What this project is

Enterprise IT endpoint management dashboard. IT admins connect their MDM sources (Intune, Kandji, ManageEngine), and the dashboard shows compliance status, device health, issues, and AI-powered remediation runbooks — all in one place.

**Stack:** React 19 + TypeScript + Tailwind 4 (frontend) · Express + TypeScript (backend) · OpenAI GPT-4o-mini (AI layer)

---

## Run locally

```bash
# Install all deps
npm install && npm --prefix server install

# Copy env and add keys (see docs/04-integrations/ for each service)
cp server/.env.example server/.env

# Start both client (port 5173) and server (port 4000) concurrently
npm run dev
```

Without any `.env` values set, everything runs on mock data — no credentials needed.

---

## Key scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start client + server together |
| `npm run dev:client` | Vite dev server only (port 5173) |
| `npm run dev:server` | Express server only (port 4000) |
| `npm run build` | Build both client and server |
| `npm run lint` | ESLint on all files |

---

## Project layout

```
src/                        Frontend (React + TypeScript)
├── App.tsx                 Root — auth gate + page router
├── types.ts                All frontend TypeScript interfaces
├── api/index.ts            HTTP client — all API calls live here
├── data/dashboardData.ts   Mock/static data + search helpers
├── hooks/                  Custom React hooks
└── components/
    ├── ui/                 Reusable primitives (Badge, Button, Modal, Toast)
    ├── layout/             App shell (Header, Sidebar, PlaceholderPage)
    ├── dashboard/          Dashboard widgets
    ├── devices/            Device lookup + detail panel
    ├── runbooks/           Runbook card + modal
    ├── settings/           Settings page + modals
    └── auth/               Sign-in page

server/src/                 Backend (Express + TypeScript)
├── index.ts                Entry point, route mounting
├── types.ts                Shared server types
├── routes/                 ai, activity, devices, integrations, notifications, runbooks
├── services/               intune, kandji, manageEngine, openai
├── middleware/             errorHandler, requestLogger
├── data/                   Mock data (devices, runbooks, activity, notifications)
└── store/integrationStore  Runtime credential + fetch-result cache

docs/                       All project documentation (start here)
├── README.md               Master index — navigate everything from here
├── 01-overview/            Architecture, tech stack
├── 02-frontend/            Components, hooks, routing guide
├── 03-backend/             API reference, services guide
├── 04-integrations/        Per-integration setup (Intune, Kandji, ManageEngine, OpenAI)
├── 05-data-models/         TypeScript types reference
├── 06-development/         Setup guide, quick-mod cookbook
└── 07-features/            Feature-by-feature documentation
```

---

## Environment variables (server/.env)

| Variable | Required for |
|---|---|
| `OPENAI_API_KEY` | AI analysis + chat |
| `INTUNE_TENANT_ID` + `INTUNE_CLIENT_ID` + `INTUNE_CLIENT_SECRET` | Live Intune data |
| `KANDJI_API_URL` + `KANDJI_API_TOKEN` | Live Kandji data |
| `MANAGEENGINE_URL` + `MANAGEENGINE_API_KEY` | Live ManageEngine data |
| `PORT` | Server port (default: 4000) |

---

## Where to make common changes

| Change | File |
|---|---|
| Add a new nav page | `src/data/dashboardData.ts` → `navItems`, then `src/App.tsx` → page router |
| Add a stat card | `src/data/dashboardData.ts` → `statCards` |
| Add mock device | `src/data/dashboardData.ts` → `mockDevices` |
| Change AI prompt | `server/src/services/openai.ts` → `analyzeDevice()` |
| Add API endpoint | `server/src/routes/` → new router, mount in `server/src/index.ts` |
| Add a new integration | `server/src/services/` + `server/src/store/integrationStore.ts` |
| Change theme/colors | `src/index.css` (Tailwind config) |
| Change user roles | `src/types.ts` → `UserToolRole`, `docs/ROLES.md` |

---

## Docs index

Full documentation is organized in `docs/`. Start at [`docs/README.md`](docs/README.md).
