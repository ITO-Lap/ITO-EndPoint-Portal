import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  getScripts,
  getScriptById,
  createScript,
  updateScript,
  deleteScript,
  getExecutions,
  getExecutionById,
  createExecution,
  updateExecution,
} from '../data/mockScripts.js'
import type { ScriptExecution, ExecutionFilters } from '../data/mockScripts.js'

const router = Router()

// ── Validation schemas ────────────────────────────────────────────────────────

const scriptParameterSchema = z.object({
  name:         z.string().min(1),
  label:        z.string().min(1),
  type:         z.enum(['string', 'number', 'boolean', 'select']),
  required:     z.boolean(),
  defaultValue: z.string().optional(),
  options:      z.array(z.string()).optional(),
  placeholder:  z.string().optional(),
})

const createScriptSchema = z.object({
  name:             z.string().min(1, 'name is required'),
  description:      z.string().min(1, 'description is required'),
  os:               z.enum(['Windows', 'macOS', 'Linux', 'Cross-platform']),
  type:             z.enum(['PowerShell', 'Bash', 'Batch', 'Python']),
  content:          z.string().min(1, 'content is required'),
  version:          z.number().int().min(1).default(1),
  tags:             z.array(z.string()).default([]),
  createdBy:        z.string().min(1, 'createdBy is required'),
  isDestructive:    z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
  minRole:          z.enum(['Helpdesk', 'IT Admin', 'Global Admin']).default('Helpdesk'),
  parameters:       z.array(scriptParameterSchema).default([]),
  timeoutSeconds:   z.number().int().min(5).max(3600).default(60),
})

const listQuerySchema = z.object({
  q:    z.string().optional(),
  os:   z.enum(['Windows', 'macOS', 'Linux', 'Cross-platform']).optional(),
  type: z.enum(['PowerShell', 'Bash', 'Batch', 'Python']).optional(),
})

const executionsQuerySchema = z.object({
  deviceId: z.string().optional(),
  scriptId: z.string().optional(),
  status:   z
    .enum(['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled', 'pending_approval'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

const executeBodySchema = z.object({
  deviceId:         z.string().min(1, 'deviceId is required'),
  deviceName:       z.string().min(1, 'deviceName is required'),
  platform:         z.string().min(1, 'platform is required'),
  managementSource: z.string().min(1, 'managementSource is required'),
  executedBy:       z.string().min(1, 'executedBy is required'),
  parameters:       z.record(z.string(), z.string()).optional(),
})

// ── Helper: normalise req.params value ────────────────────────────────────────

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value
}

// ── Mock stdout generators ────────────────────────────────────────────────────

function getMockStdout(scriptId: string, params?: Record<string, string>): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  switch (scriptId) {
    case 'filevault-check':
      return `=== FileVault Encryption Status ===

FileVault Status: FileVault is On.

✔ Encryption: ENABLED

=== Recovery Key Escrow ===
✔ Institutional recovery key: PRESENT
✔ Personal recovery key: ESCROWED

=== User Accounts with FileVault Access ===
  User: localadmin  UUID: C4A92CB1-4D2E-4A91-BB3C-7E1F0A2D9C45
  User: jdoe        UUID: D8F14DC2-8A3F-4B12-CC9D-1F3E7B4A0D22

=== Check Complete ===
Timestamp: ${ts}`

    case 'bitlocker-status': {
      const drive = params?.['driveLetter'] ?? 'C:'
      return `=== BitLocker Volume Status ===
Drive: ${drive}
Timestamp: ${ts}

Protection Status : ✔ PROTECTED
Encryption Status : Fully Encrypted
Encryption Method : XtsAes256
Encryption %      : 100%
Lock Status       : Unlocked

=== Key Protectors ===
  Type: Tpm  ID: {A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
  Type: RecoveryPassword  ID: {09876543-21FE-DCBA-9876-543210FEDCBA}

✔ Recovery password protector is present.

=== Check Complete ===`
    }

    case 'mdm-force-sync':
      return `=== Force MDM Sync ===
Detected OS: Darwin
Timestamp : ${ts}

--- Kandji Agent Sync ---
Running: sudo kandji agent run
${ts.slice(0, 10)} [INFO] Kandji agent starting run...
${ts.slice(0, 10)} [INFO] Checking in with Kandji cloud...
${ts.slice(0, 10)} [INFO] 3 library items up to date.
✔ Kandji agent run completed.

--- Native MDM ConnectTrigger ---
Running: sudo mdmclient ConnectTrigger NetworkAvailable
MDM connection trigger sent successfully.
✔ MDM connect trigger sent.

--- Profiles (MDM enrollment check) ---
Enrolled via DEP: Yes
MDM enrollment: Yes

=== Sync Trigger Complete ===
Allow 2-5 minutes for policies to be applied.`

    case 'system-inventory':
      return `=== System Hardware Inventory ===
Timestamp : ${ts}
Hostname  : CORP-DEVICE

=== System ===
  Manufacturer : Dell Inc.
  Model        : Latitude 5540
  Serial Number: 7XK2T9J
  Domain       : corp.zinnia.com
  Total RAM    : 16 GB

=== CPU ===
  Name         : Intel(R) Core(TM) i5-1345U CPU @ 1.60GHz
  Cores        : 10
  Logical Procs: 12
  Max Speed    : 4700 MHz
  Architecture : 9

=== Memory Modules ===
  Slot: DIMM A1  Size: 8 GB  Speed: 4800 MHz  Manufacturer: Micron
  Slot: DIMM B1  Size: 8 GB  Speed: 4800 MHz  Manufacturer: Micron

=== Disk Drives ===
  Model       : SK hynix PC801 NVMe 512GB
  Interface   : SCSI
  Size        : 512.1 GB
  Serial      : HFS512GEJ9X101N
  Firmware    : 41002111

=== Logical Volumes ===
  Drive: C:  Total: 476.8 GB  Free: 189.3 GB  Used: 60.3%  FS: NTFS

=== BIOS ===
  Manufacturer : Dell Inc.
  Version      : 1.22.0
  Release Date : 2025-09-04T00:00:00Z

=== Operating System ===
  Caption      : Microsoft Windows 11 Pro
  Version      : 10.0.22631
  Build        : 22631
  Architecture : 64-bit
  Last Boot    : ${ts}

=== Inventory Complete ===`

    case 'clear-temp-files':
      return `=== Clear Temporary Files ===
Timestamp : ${ts}
Host      : CORP-DEVICE
User      : localadmin

--- Cleaning: C:\\Users\\localadmin\\AppData\\Local\\Temp ---
  Deleted : 1,284 files (312.47 MB)
  Errors  : 17 files in use / access denied

--- Cleaning: C:\\Windows\\Temp ---
  Deleted : 236 files (88.12 MB)
  Errors  : 3 files in use / access denied

=== Summary ===
  Total files deleted : 1,520
  Total space freed   : 400.59 MB
  Skipped (in use)    : 20

=== Cleanup Complete ===`

    case 'network-connectivity': {
      const host  = params?.['targetHost']   ?? '8.8.8.8'
      const count = parseInt(params?.['packetCount'] ?? '4', 10)
      return `=== Network Connectivity Test ===
Target Host  : ${host}
Packet Count : ${count}
Timestamp    : ${ts}

--- Ping Test: ${host} ---
PING ${host}: 56 data bytes
64 bytes from ${host}: icmp_seq=0 ttl=117 time=14.2 ms
64 bytes from ${host}: icmp_seq=1 ttl=117 time=13.8 ms
64 bytes from ${host}: icmp_seq=2 ttl=117 time=14.5 ms
64 bytes from ${host}: icmp_seq=3 ttl=117 time=13.9 ms

--- ${host} ping statistics ---
${count} packets transmitted, ${count} received, 0.0% packet loss
round-trip min/avg/max = 13.8/14.1/14.5 ms
✔ Ping: REACHABLE

--- DNS Resolution ---
  ✔ google.com — resolved
  ✔ microsoft.com — resolved
  ✔ apple.com — resolved

--- MDM & Cloud Endpoint Reachability ---
  ✔ manage.microsoft.com:443 — reachable
  ✔ graph.microsoft.com:443 — reachable
  ✔ appserver.kandji.io:443 — reachable
  ✔ device.kandji.io:443 — reachable
  ✔ accounts.google.com:443 — reachable

--- Routing ---
default   10.10.0.1  UGScg  en0

=== Test Complete ===`
    }

    case 'installed-apps':
      return `=== Installed Applications ===
Host      : CORP-DEVICE
Timestamp : ${ts}

  Application                                             Version              Publisher                           Installed
  ------------------------------------------------------ ------------------- ---------------------------------- ----------
  1Password                                               8.10.34             AgileBits Inc.                     20250201
  Adobe Acrobat Reader DC (64-bit)                        24.001.20615        Adobe Inc.                         20250305
  Cisco AnyConnect Secure Mobility Client                 4.10.08029          Cisco Systems, Inc.                20250120
  CrowdStrike Falcon Sensor                               7.14.17706.0        CrowdStrike, Inc.                  20250115
  Google Chrome                                           124.0.6367.82       Google LLC                         20250210
  Microsoft 365 Apps for Enterprise - en-us               16.0.17628.20000    Microsoft Corporation              20250115
  Microsoft Edge                                          124.0.2478.80       Microsoft Corporation              20250115
  Microsoft Teams                                         24.4.130.0          Microsoft Corporation              20250115
  Slack Technologies                                      4.38.125            Slack Technologies, Inc.           20250210
  Zoom                                                    6.0.11.35001        Zoom Video Communications, Inc.   20250210

Total applications found: 10

=== Inventory Complete ===`

    case 'macos-security-posture':
      return `=== macOS Security Posture Check ===
Host      : CORP-MAC.local
macOS     : 14.4.1 (23E224)
Timestamp : ${ts}

--- System Integrity Protection (SIP) ---
  System Integrity Protection status: enabled.
  ✔ SIP: ENABLED

--- Gatekeeper ---
  assessments enabled
  ✔ Gatekeeper: ENABLED

--- XProtect (Malware Definitions) ---
  Version         : 2194
  Last Modified   : 2026-04-28 03:14:09 +0000
  ✔ XProtect: INSTALLED

--- Application Firewall ---
  Firewall is enabled. (State = 1)
  ✔ Application Firewall: ENABLED
  ✔ Stealth Mode: ENABLED

--- Secure Boot ---
  Chip: Apple Silicon (arm64)
  LocalPolicy: present
  Secure Boot: Full Security

--- Remote Services ---
  Remote Login (SSH): Off

=== Security Posture Check Complete ===`

    case 'restart-mdm-agent':
      return `=== Restart MDM Agent (Kandji) ===
Host      : CORP-MAC.local
Timestamp : ${ts}

--- Agent Status (Before) ---
PID   Status   Label
1043  0        io.kandji.KandjiAgent

--- Stopping Kandji Agent ---
✔ Agent stopped via launchctl bootout.

✔ Confirmed: agent is stopped.

--- Starting Kandji Agent ---
✔ Agent started via launchctl bootstrap.

--- Agent Status (After) ---
PID    Status   Label
1891   0        io.kandji.KandjiAgent

✔ Kandji MDM agent is running.

=== Restart Complete ===
Allow 60-120 seconds for the agent to check in with Kandji.`

    default:
      return `Script execution completed.\nTimestamp: ${ts}`
  }
}

function getRandomDelay(): number {
  return Math.floor(Math.random() * 1500) + 1500 // 1500–3000 ms
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/scripts — list scripts
router.get('/', asyncHandler(async (req, res) => {
  const { q, os, type } = listQuerySchema.parse(req.query)

  let scripts = getScripts()

  if (q) {
    const query = q.toLowerCase()
    scripts = scripts.filter(
      s =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some(t => t.toLowerCase().includes(query))
    )
  }
  if (os)   scripts = scripts.filter(s => s.os === os)
  if (type) scripts = scripts.filter(s => s.type === type)

  res.json({ success: true, data: scripts, total: scripts.length })
}))

// POST /api/scripts — create script
router.post('/', asyncHandler(async (req, res) => {
  const parsed = createScriptSchema.parse(req.body)

  const script = createScript(parsed)

  res.status(201).json({ success: true, data: script })
}))

// GET /api/scripts/executions — list executions (before /:id to avoid conflict)
router.get('/executions', asyncHandler(async (req, res) => {
  const { deviceId, scriptId, status, limit } = executionsQuerySchema.parse(req.query)

  // Build filters object, omitting undefined keys to satisfy exactOptionalPropertyTypes
  const filters: ExecutionFilters = { limit }
  if (deviceId !== undefined) filters.deviceId = deviceId
  if (scriptId !== undefined) filters.scriptId = scriptId
  if (status   !== undefined) filters.status   = status

  const executions = getExecutions(filters)

  res.json({ success: true, data: executions, total: executions.length })
}))

// GET /api/scripts/executions/:id — get single execution (before /:id)
router.get('/executions/:id', asyncHandler(async (req, res) => {
  const id = paramId(req.params['id'] ?? '')
  const execution = getExecutionById(id)
  if (!execution) {
    res.status(404).json({ success: false, error: 'Execution not found' })
    return
  }
  res.json({ success: true, data: execution })
}))

// POST /api/scripts/executions/:id/cancel — cancel an execution
router.post('/executions/:id/cancel', asyncHandler(async (req, res) => {
  const id = paramId(req.params['id'] ?? '')
  const execution = getExecutionById(id)
  if (!execution) {
    res.status(404).json({ success: false, error: 'Execution not found' })
    return
  }

  if (execution.status !== 'queued' && execution.status !== 'running') {
    res.status(400).json({
      success: false,
      error: `Cannot cancel execution in status '${execution.status}'`,
    })
    return
  }

  const updated = updateExecution(execution.id, {
    status:      'cancelled',
    completedAt: new Date().toISOString(),
    stderr:      'Execution was cancelled by the user.',
  })

  res.json({ success: true, data: updated })
}))

// GET /api/scripts/:id — get script by id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = paramId(req.params['id'] ?? '')
  const script = getScriptById(id)
  if (!script) {
    res.status(404).json({ success: false, error: 'Script not found' })
    return
  }
  res.json({ success: true, data: script })
}))

// PUT /api/scripts/:id — update script
router.put('/:id', asyncHandler(async (req, res) => {
  const id = paramId(req.params['id'] ?? '')
  const existing = getScriptById(id)
  if (!existing) {
    res.status(404).json({ success: false, error: 'Script not found' })
    return
  }

  const allowedFields = createScriptSchema.partial().parse(req.body)
  const updated = updateScript(id, allowedFields)

  res.json({ success: true, data: updated })
}))

// DELETE /api/scripts/:id — delete script
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = paramId(req.params['id'] ?? '')
  const existing = getScriptById(id)
  if (!existing) {
    res.status(404).json({ success: false, error: 'Script not found' })
    return
  }

  const deleted = deleteScript(id)
  if (!deleted) {
    res.status(500).json({ success: false, error: 'Failed to delete script' })
    return
  }

  res.json({ success: true, message: `Script '${existing.name}' deleted.` })
}))

// POST /api/scripts/:id/execute — run a script on a device
router.post('/:id/execute', asyncHandler(async (req, res) => {
  const id = paramId(req.params['id'] ?? '')
  const script = getScriptById(id)
  if (!script) {
    res.status(404).json({ success: false, error: 'Script not found' })
    return
  }

  const body = executeBodySchema.parse(req.body)

  // Guard: destructive scripts require explicit confirmation parameter
  if (script.isDestructive) {
    const confirmValue = body.parameters?.['confirmDeletion']
    if (confirmValue !== 'true') {
      res.status(400).json({
        success: false,
        error: "This script is marked destructive. Set parameters.confirmDeletion = 'true' to proceed.",
      })
      return
    }
  }

  const now = new Date().toISOString()

  // Build the initial execution record — omit optional keys when undefined
  const execData: Omit<ScriptExecution, 'id'> = {
    scriptId:         script.id,
    scriptName:       script.name,
    scriptVersion:    script.version,
    deviceId:         body.deviceId,
    deviceName:       body.deviceName,
    platform:         body.platform,
    managementSource: body.managementSource,
    status:           'running',
    startedAt:        now,
    executedBy:       body.executedBy,
    ...(body.parameters !== undefined ? { parameters: body.parameters } : {}),
  }

  const execution = createExecution(execData)

  // Increment use count on the script
  updateScript(script.id, { useCount: script.useCount + 1 })

  console.log(
    `[Scripts] Executing '${script.name}' (${script.id}) on device '${body.deviceName}' (${body.deviceId}) — exec ${execution.id}`
  )

  // Simulate async execution: resolve after 1500–3000 ms
  const delay    = getRandomDelay()
  const startMs  = Date.now()
  const execId   = execution.id
  const scriptId = script.id
  const execParams = body.parameters

  setTimeout(() => {
    const runtimeMs = Date.now() - startMs
    const stdout    = getMockStdout(scriptId, execParams)

    updateExecution(execId, {
      status:      'completed',
      exitCode:    0,
      stdout,
      runtimeMs,
      completedAt: new Date().toISOString(),
    })

    console.log(`[Scripts] Execution ${execId} completed in ${runtimeMs}ms`)
  }, delay)

  // Return 202 immediately — client polls GET /executions/:id
  res.status(202).json({ success: true, data: execution })
}))

export default router
