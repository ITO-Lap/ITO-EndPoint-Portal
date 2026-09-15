# Deploying to IIS — Complete Beginner's Guide

This guide assumes **zero prior IIS experience**. Every step says exactly
what to click, type, or run, and explains *why* you're doing it. Follow it
top to bottom in order — later steps depend on earlier ones.

> This guide is written from how IIS, ARR, and NSSM are documented to work.
> It has not been run against a live Windows Server in this session — if a
> step's wording doesn't match what you see on screen (menus move between
> Windows Server versions), tell me exactly what you see and I'll adjust it.

---

## 0. The big picture — what you're building

Your app is one Node.js program that does two jobs at once: it serves the
React frontend (the pages you see) *and* it answers API calls (`/api/...`).
That program is **not IIS** — it's a completely separate process. IIS's only
job is to sit in front of it and forward every request through.

```
Your browser
     │  http://your-server/
     ▼
  IIS (Windows's built-in web server)
     │  forwards ("reverse-proxies") the request unchanged
     ▼
  Node.js process, running in the background as a Windows Service,
  listening only on 127.0.0.1:4000 (not reachable from outside directly)
     │
     ├─ if it's a page request → sends back the React app
     └─ if it's a /api/... request → talks to Intune/Kandji/Entra/OpenAI/Postgres
```

Why put IIS in front at all, instead of just exposing the Node process
directly? Because IIS gives you the things a production website needs that
a bare `node server.js` doesn't: a stable port 80/443, HTTPS certificate
handling, Windows-integrated logging, and it's the standard front door on
Windows Server that your infrastructure/security team will expect to see.

**Vocabulary you'll see below** (skip if familiar):

| Term | Plain-English meaning |
|---|---|
| **IIS** | "Internet Information Services" — Windows's built-in web server software. Comes with Windows Server, just needs turning on. |
| **Reverse proxy** | A server that receives requests and quietly forwards them to another server behind it, then relays the response back. That's all IIS does here. |
| **URL Rewrite** | A free Microsoft add-on for IIS that lets it rewrite/redirect incoming URLs. We use it to define the "forward everything to Node" rule. |
| **ARR (Application Request Routing)** | A free Microsoft add-on that adds the actual proxying *engine* — URL Rewrite defines the rule, ARR carries it out. |
| **Windows Service** | A program Windows runs in the background forever — starts automatically on boot, restarts itself if it crashes, doesn't need anyone logged in. This is how we keep the Node process alive. |
| **NSSM** | A free tiny tool ("Non-Sucking Service Manager") that takes any ordinary program (our `node server/dist/index.js`) and wraps it as a Windows Service. Node has no built-in way to do this itself, so NSSM does it for us. |

---

## 1. What you need before starting

- **Access to a Windows Server** (Windows Server 2016/2019/2022, or Windows
  10/11 Pro for a local test) with Administrator rights. Everything below
  needs an **elevated / Administrator** PowerShell or Command Prompt —
  right-click the Start button → *Windows Terminal (Admin)* or *Windows
  PowerShell (Admin)*.
- Network/firewall access to that server (RDP, or you're sitting at it).
- The credentials for whatever integrations you want live (Intune, Kandji,
  ManageEngine, Entra, OpenAI, Postgres) — same as local dev, see
  [`docs/04-integrations/`](../04-integrations/). Without them the app runs
  fine on mock data.

---

## 2. Install Node.js on the server

The server needs Node.js to actually *run* your app — IIS doesn't run
JavaScript itself.

1. On the Windows Server, open a browser and go to **nodejs.org**.
2. Download the **LTS** installer (`.msi`) for Windows.
3. Run the installer, click **Next** through all the defaults, leave
   "Add to PATH" checked (it's checked by default). Finish.
4. Confirm it worked — open a new PowerShell window and run:
   ```powershell
   node -v
   npm -v
   ```
   Both should print a version number. If you get "not recognized", close
   and reopen PowerShell (PATH changes need a fresh window) — if it still
   fails, reboot the server.

---

## 3. Install Git (or otherwise get the code onto the server)

If the server can reach your Git remote (GitHub/GitLab/Azure DevOps), the
cleanest way is `git clone`.

1. Download Git for Windows from **git-scm.com/download/win**, run the
   installer with defaults, click through to Finish.
2. Open PowerShell (doesn't need to be Admin for this part) and run:
   ```powershell
   cd C:\inetpub
   git clone <your-repo-url> ito-endpoint
   cd ito-endpoint
   ```
   `C:\inetpub` is the conventional Windows folder for website content —
   using it isn't required, but it's a sensible, predictable place to put
   this.

   If the server has no Git/network access to your repo, instead zip the
   project on your machine (exclude `node_modules/` and `dist/`), copy the
   zip to the server (RDP file transfer, USB, network share), and extract it
   to `C:\inetpub\ito-endpoint`.

---

## 4. Configure your environment variables

1. Still in `C:\inetpub\ito-endpoint`, copy the example env file:
   ```powershell
   copy server\.env.example server\.env
   ```
2. Open `server\.env` in Notepad and fill in real values:
   ```powershell
   notepad server\.env
   ```
   Leave anything blank that you don't have credentials for yet — the app
   falls back to mock data for that integration. Full explanation of every
   variable: [`docs/06-development/README.md`](README.md).
3. **Do not set `PORT`** in this file — leave it out entirely. The app
   defaults to port 4000, which is what the IIS config below expects.
   (If you must change it, you'll also need to change the port number in
   `deploy/iis/web.config` and the `install-service.ps1` command to match.)

---

## 5. Build the app

Still in `C:\inetpub\ito-endpoint`:

```powershell
npm install
npm run build
```

`npm install` downloads all the packages the app needs (takes a few
minutes). `npm run build` compiles the React frontend into a `dist\` folder
and the backend into `server\dist\` — these compiled folders are the actual
thing that runs; nothing else needs "building" or "packaging."

If either command errors, stop here and share the exact error — don't
continue to the IIS steps until this succeeds.

---

## 6. Download NSSM (to keep Node running as a service)

1. Go to **nssm.cc/download** and download the latest release zip.
2. Extract it — anywhere is fine, e.g. `C:\nssm\`.
3. Inside the extracted folder there are `win32\` and `win64\` subfolders.
   On any modern server you want **win64**. Note the full path to
   `nssm.exe` inside it, e.g. `C:\nssm\win64\nssm.exe` — you'll need this
   exact path in the next step.

Why NSSM and not just running `node server/dist/index.js` in a window? That
window would have to stay open forever, logged in, and if it crashed or the
server rebooted, your app would just be down until someone noticed and
manually restarted it. A Windows Service starts automatically on boot and
restarts itself on crash, with no one needing to be logged in.

---

## 7. Register the app as a Windows Service

This repo already includes a script that does this for you:
[`deploy/iis/install-service.ps1`](../../deploy/iis/install-service.ps1).

1. Open an **elevated** PowerShell (right-click Start → *Windows Terminal
   (Admin)*, or search "PowerShell", right-click → *Run as administrator*).
   This step needs admin rights because installing a service is a
   system-level change.
2. Run:
   ```powershell
   cd C:\inetpub\ito-endpoint\deploy\iis
   .\install-service.ps1 -RepoPath "C:\inetpub\ito-endpoint" -NssmPath "C:\nssm\win64\nssm.exe"
   ```
   (adjust the two paths if you put things somewhere else.)
3. If PowerShell refuses to run the script at all with a message about
   "execution policy," run this once first, then retry the command above:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```
   This only relaxes the restriction for the current PowerShell window, not
   permanently for the whole server.
4. The script prints progress and finishes with a message that the service
   started. It also creates a `logs\` folder inside your project with
   `service.out.log` / `service.err.log` — check these first any time
   something isn't working.

**Verify it's actually running**, still in that PowerShell window:
```powershell
Invoke-WebRequest http://127.0.0.1:4000/health
```
You should get back something like `{"status":"healthy","timestamp":"..."}`.
If this fails, **stop here** — IIS can't fix a backend that isn't running.
Check `logs\service.err.log` for the actual error (common causes: a typo in
`server\.env`, or something else already using port 4000).

---

## 8. Turn on IIS itself

Windows Server doesn't run IIS out of the box — it's a "role" you switch on.

1. Open **Server Manager** (it usually opens automatically on login, or
   search "Server Manager" in the Start menu).
2. Click **Manage** (top-right) → **Add Roles and Features**.
3. Click **Next** through: *Before You Begin*, then select **Role-based or
   feature-based installation** → Next, then select the local server (it's
   pre-selected) → Next.
4. On the **Server Roles** page, check the box for **Web Server (IIS)**. A
   popup will ask to add required features — click **Add Features**.
5. Keep clicking **Next** through *Features*, *Web Server Role (IIS)*, and
   *Role Services* — the defaults are fine, don't uncheck anything.
6. Click **Install**. This takes a few minutes. When it finishes, click
   **Close**.

*(If you're on Windows 10/11 instead of Windows Server, there's no Server
Manager — instead go to **Control Panel → Programs → Turn Windows features
on or off**, check **Internet Information Services**, click OK.)*

**Verify it worked:** open a browser on the server and go to
`http://localhost`. You should see the default "IIS Windows Server" welcome
page. If you see that, IIS is running correctly and you can move on.

---

## 9. Install the URL Rewrite module

This is a free Microsoft add-on IIS needs — it doesn't come pre-installed.

1. On the server, open a browser and go to:
   `https://www.iis.net/downloads/microsoft/url-rewrite`
2. Download the installer for your system (64-bit, almost certainly) and
   run it. Click through the installer with defaults — **Next**, accept the
   license, **Install**, **Finish**.
3. No separate "enable" step needed — installing it is enough. You'll see
   it appear as **URL Rewrite** inside IIS Manager (next section) once done.

---

## 10. Install Application Request Routing (ARR)

Also a free Microsoft add-on, and also not pre-installed.

1. Go to:
   `https://www.iis.net/downloads/microsoft/application-request-routing`
2. Download and run the installer, same as above — click through with
   defaults to **Finish**.
3. **Restart IIS** so it picks up the new module. Easiest way: open an
   elevated PowerShell and run:
   ```powershell
   iisreset
   ```
   You'll see "Internet Information Services successfully restarted."

---

## 11. Turn on ARR's proxy feature (one-time, server-wide)

ARR is installed but its actual proxying behavior is **off by default** —
this is a deliberate safety default, and it's a step people commonly miss.

1. Open **IIS Manager** (search "IIS Manager" in the Start menu, or
   Server Manager → Tools → Internet Information Services (IIS) Manager).
2. In the left-hand tree (called the "Connections" pane), click the
   **top-level server node** — the one named after your computer, above
   "Sites". (Not a specific site — the server itself.)
3. In the middle pane, double-click **Application Request Routing Cache**.
4. In the right-hand **Actions** pane, click **Server Proxy Settings...**
5. Check the box **Enable proxy**. Leave the other settings at default.
6. Click **Apply** (top-right of that panel).

If you skip this step, every request will fail with a 502 error even though
everything else is configured correctly — it's the single most common thing
to forget.

---

## 12. Create the IIS website

Now create the actual site that will receive browser traffic and hand it
off to Node.

1. In IIS Manager's left tree, right-click **Sites** → **Add Website**.
2. Fill in the dialog:
   - **Site name:** `ITO Endpoint Copilot` (or anything memorable — it's
     just a label in IIS Manager, doesn't affect anything else).
   - **Physical path:** click **...** and create/select an **empty** folder,
     e.g. `C:\inetpub\ito-endpoint-site`. Important: this is *not* the same
     folder as your app code (`C:\inetpub\ito-endpoint`) — IIS never
     directly serves your app's files, it only needs one config file here
     (next step), because Node/Express serves the actual pages.
   - **Binding → Port:** `80` for a plain HTTP test. (If another site is
     already using port 80 on this server, pick a free port instead, e.g.
     `8080`, and you'll browse to `http://server:8080`.)
   - Leave **Host name** blank for now unless you already have a specific
     internal DNS name you're supposed to bind to.
3. Click **OK**.

---

## 13. Add the reverse-proxy config file to the site

This repo already includes the exact file needed:
[`deploy/iis/web.config`](../../deploy/iis/web.config). It tells IIS "take
every request and forward it to `http://127.0.0.1:4000`."

1. Copy that file into the site's physical path — the empty folder you just
   created (`C:\inetpub\ito-endpoint-site` in the example above):
   ```powershell
   copy C:\inetpub\ito-endpoint\deploy\iis\web.config C:\inetpub\ito-endpoint-site\web.config
   ```
2. That's it — no restart needed, IIS picks up `web.config` changes
   automatically. If you ever changed the Node port away from 4000, edit the
   port number inside this copied `web.config` to match.

---

## 14. Test it

1. On the server itself, open a browser and go to `http://localhost` (or
   `http://localhost:8080` if you used a different port).
2. You should see the same dashboard you saw in local dev — not the plain
   IIS welcome page anymore.
3. From another machine on the same network, browse to
   `http://<server's-IP-or-hostname>` (add `:8080` etc. if needed). If this
   doesn't work but step 1 did, it's almost always the Windows Firewall —
   see the next section.

---

## 15. Open the port in Windows Firewall

By default Windows Firewall blocks incoming connections on ports IIS wasn't
explicitly told to allow. If step 14 worked locally on the server but not
from another machine, do this:

1. Search "Windows Defender Firewall with Advanced Security" in the Start
   menu, open it.
2. Click **Inbound Rules** (left pane) → **New Rule...** (right pane).
3. Rule type: **Port** → Next.
4. **TCP**, Specific local ports: `80` (or whatever port you bound the site
   to, e.g. `8080`; add `443` too if you set up HTTPS later) → Next.
5. **Allow the connection** → Next.
6. Leave Domain/Private/Public all checked (or narrow to your network's
   profile if your security team requires it) → Next.
7. Name it something like `IIS - ITO Endpoint HTTP` → Finish.

---

## 16. (Optional, recommended for anything beyond a local test) Add HTTPS

Running plain HTTP is fine to prove things work, but for real use you want
a TLS certificate so traffic is encrypted. This needs a certificate — either
one issued by your organization's internal Certificate Authority, or a
public one. **This step depends heavily on your organization's setup, so
ask your infrastructure/security team which certificate to use before
doing this** — I can walk through binding it in IIS once you have it
(IIS Manager → your site → *Bindings...* → *Add* → type `https`, select the
certificate). The Node app itself needs no changes — it only ever speaks
plain HTTP to IIS over `127.0.0.1`; IIS handles the encryption.

---

## 17. Day-2: redeploying updates

Whenever you have new code to deploy:

```powershell
cd C:\inetpub\ito-endpoint
git pull
npm install
npm run build
nssm restart ITOEndpointCopilot
```

`nssm restart` stops and starts the Windows Service so it picks up the
newly-built `server\dist\`. No IIS changes are needed for a normal code
update — IIS is just forwarding traffic, it doesn't know or care what the
Node process does internally.

---

## 18. Troubleshooting cheat sheet

| Symptom | Likely cause | What to check |
|---|---|---|
| Browser shows IIS's own error page, "502 Bad Gateway" | Node process isn't running, or ARR proxy isn't enabled | `Invoke-WebRequest http://127.0.0.1:4000/health` — if that fails, check `logs\service.err.log`. If it succeeds, redo step 11 (ARR proxy). |
| "This site can't be reached" from another machine, works on the server itself | Windows Firewall blocking the port | Redo step 15. |
| Site loads but every page is blank / shows raw JSON errors | `web.config` missing or pointing at the wrong port | Confirm `web.config` exists in the site's physical path and its target port matches `server\.env`'s `PORT` (or the default 4000). |
| Service won't start / `nssm status` shows `SERVICE_STOPPED` | Bad `.env` value, or `npm run build` wasn't run after a code change | Check `logs\service.err.log` for the actual Node error. |
| Changes to code don't show up after redeploy | Forgot `npm run build`, or forgot `nssm restart` | Re-run both — the service runs the *built* `server\dist\index.js`, not your source `.ts` files directly. |

---

## Reference: what each deploy file does

- [`deploy/iis/web.config`](../../deploy/iis/web.config) — the IIS-side
  reverse-proxy rule (steps 12–13).
- [`deploy/iis/install-service.ps1`](../../deploy/iis/install-service.ps1)
  — wraps `node server/dist/index.js` as a Windows Service via NSSM
  (step 7).

## Why not iisnode?

**iisnode** is an older Microsoft tool that runs Node *inside* IIS's own
worker process, instead of proxying to a separate Node process like this
guide does. It's effectively unmaintained today and has known problems with
long-running requests. The reverse-proxy + Windows Service approach above is
more steps up front, but it's the standard, supported way to run Node on
Windows Server today, and it's what this guide sets you up for.
