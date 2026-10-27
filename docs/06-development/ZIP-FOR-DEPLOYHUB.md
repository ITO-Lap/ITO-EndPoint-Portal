# SOP: Zipping This Project for DeployHub Upload

Use this whenever you need to upload a fresh copy of the source to
[DeployHub](https://itodash.zinnia.com/DeployHub/Apps/f97206a0-f0dc-4c2f-8a7f-eda3b1f98392)
or copy it to a server that can't `git clone` directly (see
[`IIS-DEPLOYMENT.md`](IIS-DEPLOYMENT.md), step 3).

## What to exclude and why

| Exclude | Reason |
|---|---|
| `node_modules/`, `server/node_modules/` | Reinstalled on the target via `npm install` — huge, not source |
| `dist/`, `server/dist/` | Build output, regenerated via `npm run build` |
| `.git/` | Version history, not needed to run the app |
| `.env`, `server/.env` | **Real secrets** (API keys, DB credentials) — never ship these in a zip |
| `*.log`, `logs/`, `server/logs/` | Runtime logs, not source |
| `.DS_Store` | macOS folder metadata, not source |

`.env.example` / `server/.env.example` **are** included — they're safe templates with no real values, and whoever sets up the target server needs them (step 4 of `IIS-DEPLOYMENT.md`).

## One-line command

Run this from the project root (`endpoint-ai-copilot/`):

```bash
zip -r -X ~/Desktop/endpoint-ai-copilot.zip . \
  -x "node_modules/*" \
  -x "dist/*" \
  -x "server/node_modules/*" \
  -x "server/dist/*" \
  -x ".git/*" \
  -x ".env" ".env.*" \
  -x "server/.env" "server/.env.*" \
  -x "*.DS_Store" \
  -x "logs/*" "server/logs/*" \
  -x "*.log"
```

Change `~/Desktop/endpoint-ai-copilot.zip` to wherever you want the output. Note the quoting around `".env" ".env.*"` — without it, a bare `.env` pattern alone won't catch `server/.env` (zip excludes are path-relative, not recursive by default), so both the `.env*` and `server/.env*` lines are needed.

## Verify before uploading

Always double-check no secrets snuck in before uploading anywhere:

```bash
unzip -l ~/Desktop/endpoint-ai-copilot.zip | grep -iE "(^|/)\.env$|(^|/)\.env\.(?!example)" -P
```

This should print **nothing**. If it prints a line, stop — do not upload — and re-run the zip command above.

Also sanity-check the size and file count look reasonable (a few MB, a few hundred files — not tens of thousands, which would mean `node_modules` leaked in):

```bash
unzip -l ~/Desktop/endpoint-ai-copilot.zip | tail -3
```

## Upload

Once verified clean, upload the zip at
[DeployHub](https://itodash.zinnia.com/DeployHub/Apps/f97206a0-f0dc-4c2f-8a7f-eda3b1f98392).
