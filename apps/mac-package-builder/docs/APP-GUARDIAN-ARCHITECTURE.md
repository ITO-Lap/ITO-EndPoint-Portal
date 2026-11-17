# App Guardian Architecture

App Guardian is an enterprise Mac application inventory and update platform. The existing Swift package-builder remains a separate product in this repository; App Guardian is introduced under `apps/`, `services/`, `database/`, and `api/`.

## Components

```text
Endpoint Central
  ├─ deploys signed/notarized agent PKG and PPPC profiles
  ├─ provides device identity and scheduled scan trigger
  └─ receives custom inventory reports

macOS user agent (SwiftUI) ── XPC ── privileged LaunchDaemon (root)
             │                              │
             └──── HTTPS/OIDC device API ───┘
                             │
               TypeScript REST API + PostgreSQL
                             │
                  React / TypeScript portal
```

The menu-bar/self-service agent runs as the logged-in user. A separate, signed helper owns only the narrowly defined install and verification operations. XPC messages use typed requests and replies; the helper independently rechecks policy, source identity, target version, signature, Team ID, notarization, and optional hash immediately before installation. The UI never submits shell text or arbitrary command arguments.

Implemented today: `apps/mac-agent` contains an independent Swift package with a launchable SwiftUI desktop client, read-only inventory scanner for `/Applications` and the current user's `~/Applications`, configurable API health check, Keychain-backed short-lived bearer token storage, and authenticated inventory upload client. The matching routes are defined in `api/openapi.yaml`. The API server runtime, device enrollment/token renewal, XPC service, privileged helper, and installation workflow remain planned.

## Trust and policy boundary

- Discovered apps begin in `pending_review`. No update is eligible until an Admin approves the bundle ID, trusted source, and expected Team ID set.
- Sources are explicit vendor APIs/artifacts, validated Sparkle appcasts, Microsoft AutoUpdate, or policy-enabled Homebrew casks. No page scraping and no AI-generated download URLs.
- Artifacts are downloaded to a helper-owned staging directory. The helper validates package signature, Developer ID, allowlisted Team ID, notarization, expected bundle ID, optional SHA-256, and strictly newer version.
- The update decision engine also enforces update ring, maintenance window, deferral/deadline, app activity/quit policy, network, power, disk space, retry/backoff, and reboot notifications.
- AI receives structured inventory, trusted vulnerability feeds, vendor release notes, and policy only. It can explain and prioritize; it cannot approve, create sources, or run updates. Every response is labeled recommendation-only and includes sources and confidence.

## Identity, roles, and audit

The portal and API use Entra ID OIDC. Tenant identity is derived from validated token claims, never from an untrusted request body. Authorization is enforced server-side for Admin, Helpdesk, Auditor, and End User roles. Database queries are tenant-scoped. Every scan, recommendation, approval, source/policy change, download, validation, install, deferral, failure, rollback, and administrative action emits an append-only audit event.

## Permissions and deployment

Request only the macOS permissions needed by the selected scan roots and install workflow. The current scanner visits the system Applications folder and only the logged-in user's Applications folder; it does not enumerate other users' home directories. Do not request Full Disk Access by default. Where a capability requires PPPC, distribute a narrowly scoped MDM profile with a documented purpose. Endpoint Central deploys and upgrades the signed/notarized PKG, installs the LaunchDaemon, manages PPPC, invokes daily scans, and collects the custom inventory report; it does not select untrusted application artifacts.

Signing, notarization, release packaging, menu-bar integration, XPC implementation, privileged helper, API runtime, and production Entra tenant configuration are later implementation phases. Placeholders are documented rather than represented as operational controls.

## Repository map

- `apps/web`: initial Overview and My Apps portal.
- `apps/mac-agent`: launchable SwiftUI desktop client, inventory library, and API client; signed helper and deployment packaging are pending.
- `services/api`: TypeScript API service boundary.
- `database/migrations`: PostgreSQL schema and tenant data model.
- `api/openapi.yaml`: REST contract.
- `docs/ENDPOINT-CENTRAL.md`: deployment and integration runbook.