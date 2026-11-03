// Mac "administrator access for the logged-on user" report.
//
// Endpoint Central (the only management source for Macs here) does not expose local admin-group membership through
// its API. A small script deployed from Endpoint Central runs on each Mac and POSTs the result to
// POST /api/mac-admin-access/report (shared-secret protected); the latest report per serial number is kept on disk.
// Nothing is inferred: a Mac that has not reported is simply absent from the list.
import { timingSafeEqual } from 'node:crypto'
import { dataFile, readJsonFile, writeJsonAtomic } from '../store/dataDir.js'

const STORE_FILE = dataFile('mac-admin-access.json')
const MAX_ENTRIES = 20_000
/** Reports older than this are shown as stale in the UI and excluded from the "current admin" list. */
export const REPORT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export interface MacAdminReport {
  serialNumber: string
  hostname: string
  loggedOnUser: string
  isAdmin: boolean
  reportedAt: string
}

export type ParsedReport = Omit<MacAdminReport, 'reportedAt'>

const SERIAL = /^[A-Za-z0-9]{6,20}$/
const USER = /^[A-Za-z0-9._@\- ]{1,64}$/
const HOST = /^[A-Za-z0-9._\- ]{0,80}$/

/** Validates an untrusted report body. Returns null for anything malformed (never throws). */
export function parseReport(body: unknown): ParsedReport | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const serial = typeof b['serial'] === 'string' ? b['serial'].trim() : ''
  const user = typeof b['user'] === 'string' ? b['user'].trim() : ''
  const host = typeof b['hostname'] === 'string' ? b['hostname'].trim() : ''
  const status = typeof b['status'] === 'string' ? b['status'].trim().toLowerCase() : ''
  if (!SERIAL.test(serial) || !USER.test(user) || !HOST.test(host)) return null
  if (status !== 'admin' && status !== 'standard') return null
  if (['root', 'loginwindow', 'none'].includes(user.toLowerCase())) return null // nobody is logged on
  return { serialNumber: serial.toUpperCase(), hostname: host, loggedOnUser: user, isAdmin: status === 'admin' }
}

/** Constant-time comparison of the presented key against MAC_ADMIN_REPORT_KEY. False when the key is not configured. */
export function reportKeyValid(presented: unknown): boolean {
  const expected = process.env['MAC_ADMIN_REPORT_KEY']?.trim()
  if (!expected || expected.length < 16 || typeof presented !== 'string') return false
  const a = Buffer.from(presented), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const reportingEnabled = (): boolean => (process.env['MAC_ADMIN_REPORT_KEY']?.trim().length ?? 0) >= 16

function load(): Record<string, MacAdminReport> {
  return readJsonFile<{ reports?: Record<string, MacAdminReport> }>(STORE_FILE)?.reports ?? {}
}

export function saveReport(report: ParsedReport, now = new Date()): void {
  const reports = load()
  reports[report.serialNumber] = { ...report, reportedAt: now.toISOString() }
  const keys = Object.keys(reports)
  if (keys.length > MAX_ENTRIES) { // drop the oldest reports rather than grow without bound
    keys.sort((x, y) => reports[x]!.reportedAt.localeCompare(reports[y]!.reportedAt))
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete reports[k]
  }
  writeJsonAtomic(STORE_FILE, { reports })
}

export interface MacAdminAccessResult {
  reportingEnabled: boolean
  /** Fresh reports with an administrator logged on. */
  admins: MacAdminReport[]
  /** Fresh reports in total (admin + standard). */
  reporting: number
  /** Reports older than the freshness window; not counted above. */
  stale: number
}

export function getMacAdminAccess(now = Date.now()): MacAdminAccessResult {
  const all = Object.values(load())
  const fresh = all.filter(r => now - Date.parse(r.reportedAt) <= REPORT_MAX_AGE_MS)
  const admins = fresh.filter(r => r.isAdmin).sort((a, b) => a.hostname.localeCompare(b.hostname) || a.serialNumber.localeCompare(b.serialNumber))
  return { reportingEnabled: reportingEnabled(), admins, reporting: fresh.length, stale: all.length - fresh.length }
}

/** Deploy from Endpoint Central (Mac custom script, run as root on a schedule). Replace the two placeholders. */
export const ADMIN_REPORT_SCRIPT = `#!/bin/bash
# Reports whether the console (logged-on) user is a local administrator.
SERVER_URL="__SERVER_URL__"      # e.g. https://ito-dashboard.example.com
REPORT_KEY="__REPORT_KEY__"      # same value as MAC_ADMIN_REPORT_KEY on the server
user=$(/usr/bin/stat -f%Su /dev/console 2>/dev/null)
[ -z "$user" ] || [ "$user" = "root" ] || [ "$user" = "loginwindow" ] && exit 0
if /usr/sbin/dseditgroup -o checkmember -m "$user" admin >/dev/null 2>&1; then status="admin"; else status="standard"; fi
serial=$(/usr/sbin/ioreg -l | /usr/bin/awk -F'"' '/IOPlatformSerialNumber/{print $4; exit}')
host=$(/usr/sbin/scutil --get ComputerName 2>/dev/null)
/usr/bin/curl -fsS --max-time 20 -X POST "$SERVER_URL/api/mac-admin-access/report" \\
  -H "Content-Type: application/json" -H "x-report-key: $REPORT_KEY" \\
  -d "{\\"serial\\":\\"$serial\\",\\"user\\":\\"$user\\",\\"hostname\\":\\"$host\\",\\"status\\":\\"$status\\"}"
`
