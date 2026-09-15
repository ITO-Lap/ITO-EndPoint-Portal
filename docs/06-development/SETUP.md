# Local Setup Guide

Step-by-step walkthrough for getting the project running locally from scratch.

---

## Step 1 — Install dependencies

```bash
# From the project root:
npm install

# Backend dependencies (separate package.json):
npm --prefix server install
```

Expected output: no errors. If you see peer dep warnings, they are safe to ignore.

---

## Step 2 — Configure environment

Copy the example env file:

```bash
cp server/.env.example server/.env
```

Open `server/.env`. For a fully mocked dev experience, **leave everything blank**. The dashboard will run on mock data with no real credentials needed.

To enable a real integration, see the integration guides:
- [Microsoft Intune](../04-integrations/INTUNE.md)
- [ManageEngine](../04-integrations/MANAGEENGINE.md)
- [OpenAI](../04-integrations/OPENAI.md)

---

## Step 3 — Start the dev server

```bash
npm run dev
```

You should see:

```
[0] VITE v8.x.x ready in Xms
[0] ➜  Local: http://localhost:5173/
[1] Server listening on http://localhost:4000
[1]   Intune:       — mock data
[1]   ManageEngine: — mock data
[1]   OpenAI:       — disabled
```

---

## Step 4 — Sign in

Open `http://localhost:5173` in your browser.

The sign-in page shows a **demo role selector** — choose a role to explore the dashboard with that permission level. No real password is required in development.

| Role | What you'll see |
|---|---|
| Global Admin | Full access to everything |
| IT Admin | No user management, no danger zone |
| Helpdesk | Read-only, no settings |

---

## Common setup issues

### Port 4000 already in use

```bash
# Find the process using port 4000:
lsof -i :4000

# Kill it:
kill -9 <PID>
```

Or change the port: set `PORT=4001` in `server/.env` and update `VITE_API_URL=http://localhost:4001` in `.env`.

---

### `Cannot find module` on server start

The server uses `NodeNext` module resolution and requires `.js` extensions on imports. If you add a new file, ensure imports use `.js`:

```ts
import { myFunc } from './myfile.js'   // ✓ correct
import { myFunc } from './myfile'      // ✗ will fail
```

---

### TypeScript errors after pulling new code

```bash
# Rebuild server types:
npm --prefix server run build

# Or just run dev again — tsc-watch handles it:
npm run dev
```

---

### Mock data not appearing

Check that you're hitting the right API port. Open `http://localhost:4000/health` in your browser — you should see `{"status":"healthy"}`. If not, the server isn't running.

---

## Resetting local state

The app stores auth and page state in `localStorage`. To reset:

```js
// In browser console:
localStorage.clear()
location.reload()
```

---

## Running only one part

```bash
# Frontend only:
npm run dev:client

# Backend only:
npm run dev:server
```

Useful when you're only working on one side and don't want the other's logs.
