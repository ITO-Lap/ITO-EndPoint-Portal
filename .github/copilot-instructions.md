# GitHub Copilot Instructions — EndPoint+

## Project Overview
EndPoint+ is a full-stack IT endpoint management dashboard. It gives IT administrators a unified interface to monitor device compliance, manage automation runbooks, and resolve endpoint security issues across Microsoft Intune, Kandji, and ManageEngine. An OpenAI-powered AI copilot is integrated via the backend.

---

## Tech Stack

### Frontend
- **React 19** with TypeScript 6
- **Vite 8** — dev server and bundler
- **Tailwind CSS 4** — all styling via utility classes (no CSS modules, no styled-components)
- **Lucide React** — icon library (`import { IconName } from 'lucide-react'`)

### Backend (`server/`)
- **Express 5** with TypeScript 6
- **OpenAI SDK 6** — AI copilot features
- **Zod** — request/response schema validation
- **dotenv** — environment config
- **tsx** — runs TypeScript directly in dev

### Dev tooling
- `npm run dev` — starts both client (Vite HMR on port 5173) and server (tsx watch on port 4000) via `concurrently`
- `npm run build` — builds both client and server

---

## Project Structure

```
src/
  components/         # All React UI components
  data/
    dashboardData.ts  # Mock data + helper functions
  hooks/
    useDashboardState.ts
    useClickOutside.ts
    useLocalStorage.ts
  types.ts            # Shared frontend TypeScript types
  App.tsx             # Root component — state, search, notifications
  main.tsx            # React entry point
  index.css           # Global styles + Tailwind import

server/
  src/
    index.ts          # Express server entry
    types.ts          # Shared backend types
    middleware/       # errorHandler, requestLogger
    data/             # mockDevices, mockRunbooks, mockNotifications
    routes/           # API route handlers
    services/         # Business logic / integrations
```

---

## Component Patterns

### DashboardCard wrapper
All content cards use `DashboardCard` as a wrapper — never build a raw card from scratch:
```tsx
import { DashboardCard } from './DashboardCard'

<DashboardCard title="Card Title" icon={SomeLucideIcon} action={<button>...</button>}>
  {/* card body */}
</DashboardCard>
```

### Badge
Use `Badge` for all status labels. Available variants: `blue | red | green | orange | yellow | gray`:
```tsx
<Badge label="Non-Compliant" variant="red" className="text-[0.65rem] px-2 py-0.5" />
```

### Button
Two variants — `default` (sky blue filled) and `outline`:
```tsx
<Button onClick={fn}>Primary</Button>
<Button variant="outline" onClick={fn}>Secondary</Button>
```

### Modal
Use the `Modal` primitive for all dialogs. It handles Escape key, backdrop click, and mobile bottom-sheet behavior:
```tsx
<Modal open={isOpen} title="Title" description="Subtitle" onClose={onClose}>
  {/* content */}
</Modal>
```

### Toast notifications
Use the `useToast` hook — never use `alert()` or custom notification state:
```tsx
const { notify } = useToast()
notify('success' | 'error' | 'info', 'Title', 'Message')
```

---

## Styling Conventions

- **Tailwind only** — no inline `style` except for dynamic values (chart colors, SVG gradients)
- **Color palette in use:**
  - Background: `#f5f7fb` / `bg-slate-100`
  - Sidebar: gradient `from-[#041a3c] via-[#031a34] to-[#021630]`
  - Header: `bg-[#071f49]`
  - Accent/interactive: `sky-600`, `sky-500`
  - Cards: `bg-white`, border `border-slate-300`, shadow `shadow-md shadow-slate-900/10`
  - Card inner sections: `bg-slate-50`, border `border-slate-200/80`
- **Border radius:** Cards use `rounded-[20px]`, inner sections use `rounded-xl` or `rounded-lg`
- **Typography:** All labels use `text-xs`; card titles use `text-sm font-bold`; stat values use `text-lg font-bold`
- **Overflow safety:** Always add `min-w-0` to flex/grid children that contain text, and `break-words whitespace-normal` on text that may be long

## Responsive Breakpoints
| Breakpoint | Behavior |
|---|---|
| Default (< 768px) | Single column, sidebar is a hidden drawer |
| `md` 768px | 2-col content rows, 3-col stat cards |
| `lg` 1024px | 3-col content rows, stat cards stay 3 |
| `xl` 1280px | Full desktop: sidebar in grid, 5-col stat cards, custom-ratio content cols |

---

## TypeScript Conventions

- All component props have explicit interfaces defined above the component
- Use `type` imports: `import type { Foo } from '../types'`
- Shared frontend types live in `src/types.ts`
- Shared backend types live in `server/src/types.ts`
- Avoid `any` — use `unknown` or proper types

---

## Data & State

- All mock data (devices, runbooks, notifications, activity) lives in `src/data/dashboardData.ts`
- Dashboard-level state (selected device, modal open/close) is managed in `useDashboardState` hook
- `App.tsx` owns: search state, notification state, mobile menu toggle
- `DashboardContent.tsx` owns: filter state, automation loading, sync loading

---

## Naming Conventions

- Components: `PascalCase` filenames and exports (`DeviceSummary.tsx`)
- Hooks: `camelCase` with `use` prefix (`useDashboardState.ts`)
- Data/helpers: `camelCase` (`dashboardData.ts`)
- Types/interfaces: `PascalCase` (`DeviceData`, `RunbookData`)
- Event handlers: `handle` prefix (`handleSearch`, `handleSyncNow`)
- Boolean state: `is` prefix (`isMobileMenuOpen`, `syncLoading` is an exception for loading states)

---

## What Not To Do

- Do not use CSS modules, styled-components, or inline style objects for layout/color
- Do not add new icon libraries — use Lucide React only
- Do not create raw card markup — always use `DashboardCard`
- Do not use `alert()`, `confirm()`, or browser dialogs — use `useToast`
- Do not add `console.log` statements in committed code
- Do not hardcode port numbers — use environment variables on the backend
