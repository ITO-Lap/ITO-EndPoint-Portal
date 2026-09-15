# Tech Stack

---

## Frontend

| Technology | Version | Role | Why |
|---|---|---|---|
| **React** | 19 | UI framework | Latest stable; concurrent features for smooth data updates |
| **TypeScript** | ~6.0 | Type safety | Catches integration mismatches between frontend and backend |
| **Tailwind CSS** | v4 | Styling | Utility-first; v4's new engine (no config file needed) is faster |
| **Vite** | v8 | Build tool + dev server | Sub-second HMR; native ESM in dev |
| **Lucide React** | latest | Icons | Consistent, tree-shakeable icon set; typed props |
| **concurrently** | latest | Dev orchestration | Runs client + server with one `npm run dev` command |

---

## Backend

| Technology | Version | Role | Why |
|---|---|---|---|
| **Node.js** | 20+ | Runtime | Native `fetch` (no node-fetch); ES module support |
| **Express.js** | 5 | HTTP framework | Minimal, well-understood; not over-engineered for this size |
| **TypeScript** | ~5.x | Type safety | Shared type patterns with frontend |
| **Zod** | 3.x | Request validation | Runtime schema validation on API inputs |
| **dotenv** | latest | Env management | Loads `server/.env` at startup |
| **OpenAI SDK** | 4.x | AI integration | Official Node SDK with types |

---

## Build & tooling

| Tool | Config file | Purpose |
|---|---|---|
| Vite | `vite.config.ts` | Frontend bundler; proxies `/api` to `localhost:4000` in dev |
| TypeScript (client) | `tsconfig.app.json` | Strict mode, ESNext target |
| TypeScript (server) | `server/tsconfig.json` | `NodeNext` module resolution for ESM |
| ESLint | `eslint.config.js` | React hooks rules + TypeScript-eslint |

---

## External services

| Service | Used for |
|---|---|
| **Microsoft Graph API** | Fetch managed device records from Intune |
| **ManageEngine REST API** | Fetch managed device records from ManageEngine (Windows, cross-platform, and macOS) |
| **OpenAI gpt-4o-mini** | Device compliance analysis + freeform IT assistant chat |

---

## Why no state library?

The app's data flow is simple enough to not need Redux or Zustand:
- Most state is **server state** — fetched on mount and refreshed on a timer
- Page selection is **persisted in localStorage** via `useLocalStorage`
- No cross-page shared mutations that would benefit from a global store

If the app grows significantly (e.g., optimistic updates, complex cache invalidation), `TanStack Query` would be the natural next step for remote data and `Zustand` for local UI state.

---

## Why no router library?

The app uses a **string-based `activePage` state** stored in localStorage instead of React Router. This keeps the URL clean (single-page app semantics), avoids route configuration overhead, and matches the design intent of a desktop-app-like dashboard.

If deep-linking to specific devices or pages is needed in the future, React Router 7 (or TanStack Router) would be the upgrade path.

---

## Why no database?

All data comes from external MDM APIs in real-time. The server is **stateless** except for:
- In-memory credential store (`integrationStore.ts`) — resets on server restart
- In-memory fetch result cache (latency + device count per source)

If you need persistence across restarts, push credentials to `server/.env` rather than configuring them through the UI at runtime.
