# Patch Operations Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide an approval-gated Endpoint Central patch remediation workflow, explainable endpoint health scores, and connector health/data-trust indicators.

**Architecture:** Extend the existing Endpoint Central Patch Manager adapter with read-only trust telemetry and narrowly validated write calls for scan and deployment. A new Patch Operations page consumes a single dashboard read model and sends write requests through a server-side approval store; the server rechecks role, target validation, and PatchMgmt scope at confirmation time.

**Tech Stack:** React, TypeScript, Express, Zod, Endpoint Central REST API, Vitest.

---

### Task 1: Build the Endpoint Central operations service

**Files:**
- Modify: `server/src/services/endpointCentralPatch.ts`
- Test: `server/src/services/__tests__/endpointCentralPatch.test.ts`

**Step 1:** Add failing tests for patch-health aggregation and request construction for scan/deployment.

**Step 2:** Add telemetry normalization, an explainable health-score function, and server-only authenticated scan/deployment functions.

**Step 3:** Run `npm --prefix server test -- --run src/services/__tests__/endpointCentralPatch.test.ts`.

### Task 2: Add approval-gated operations endpoints

**Files:**
- Modify: `server/src/routes/endpointCentral.ts`
- Test: `server/src/routes/__tests__/endpointCentral.test.ts`

**Step 1:** Add failing route tests for read dashboard output, a preview request, and role-gated confirmation.

**Step 2:** Add validated dashboard, scan-preview, deployment-preview, and confirmation routes. Never execute a deployment in preview.

**Step 3:** Run `npm --prefix server test -- --run src/routes/__tests__/endpointCentral.test.ts`.

### Task 3: Add Patch Operations UI and API client

**Files:**
- Modify: `src/api/index.ts`, `src/App.tsx`, `src/data/dashboardData.ts`, `src/lib/permissions.ts`
- Create: `src/pages/PatchOperationsPage.tsx`

**Step 1:** Add typed API contracts and a restricted Patch Operations navigation entry.

**Step 2:** Render coverage/trust indicators, health-score summary, critical-device table, and explicit scan/deploy confirmation panels.

**Step 3:** Run `npm run build`.

### Task 4: Verify the integrated release

**Files:**
- Test: `server/src/services/__tests__/endpointCentralPatch.test.ts`, `server/src/routes/__tests__/endpointCentral.test.ts`

**Step 1:** Run scoped server tests.

**Step 2:** Run `npm run build` and `git diff --check`.

