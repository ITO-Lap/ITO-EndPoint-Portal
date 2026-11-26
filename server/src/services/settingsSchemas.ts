// What each Settings section may save. Anything outside these shapes is refused, so the stored values are always
// well-formed for whatever later reads them. Secrets (a Slack webhook, a PagerDuty key) are deliberately NOT here:
// credentials belong in Settings -> Integrations.

import { z } from 'zod'

export const SETTINGS_SECTIONS = ['general', 'compliance', 'automation', 'security', 'notifications', 'data'] as const
export type SettingsSection = typeof SETTINGS_SECTIONS[number]

const text = (max: number) => z.string().trim().max(max)
const digits = z.string().regex(/^\d{1,5}$/, 'must be a whole number')
const email = z.union([z.literal(''), z.string().trim().email()])

const validTimeZone = (tz: string): boolean => { try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); return true } catch { return false } }

// IPv4 address or CIDR, or an IPv6 address/CIDR (loosely: hex groups and colons).
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d|[12]\d|3[0-2]))?$/
const IPV6 = /^[0-9a-f:]+(\/(\d{1,2}|1[01]\d|12[0-8]))?$/i
export function invalidCidrLines(value: string): string[] {
  return value.split('\n').map(l => l.trim()).filter(Boolean).filter(line => {
    const m = IPV4.exec(line)
    if (m) return [m[1], m[2], m[3], m[4]].some(o => Number(o) > 255)
    return !(line.includes(':') && IPV6.test(line))
  })
}

export const SECTION_SCHEMAS: Record<SettingsSection, z.ZodTypeAny> = {
  general: z.object({
    orgName: text(120).min(1), domain: text(120), supportEmail: email,
    timezone: text(60).refine(validTimeZone, 'unknown time zone'), dateFormat: text(30), language: text(20), fiscalStart: text(20),
    logoUrl: z.union([z.literal(''), z.string().trim().url().refine(u => /^https?:\/\//i.test(u), 'must be http or https')]),
    environment: z.enum(['production', 'test']),
  }).partial().strict(),

  compliance: z.object({
    grace: z.number().int().min(0).max(720), checkFreq: digits, autoEscalate: z.boolean(), escalateAfter: digits,
    riskWeights: z.object({ encryption: z.number().int().min(0).max(100), osVersion: z.number().int().min(0).max(100), appCompliance: z.number().int().min(0).max(100), checkIn: z.number().int().min(0).max(100) }).strict()
      .refine(w => w.encryption + w.osVersion + w.appCompliance + w.checkIn === 100, 'risk weights must add up to 100'),
    strictMode: z.boolean(),
  }).partial().strict(),

  automation: z.object({
    autoRemediate: z.boolean(), notifyBefore: z.boolean(), notifyMinutes: digits, maxPerDay: digits, logRetention: digits, dryRunFirst: z.boolean(), triggerHours: digits,
  }).partial().strict(),

  security: z.object({
    mfaRequired: z.boolean(), loginAttempts: digits, auditRetention: digits, ssoEnabled: z.boolean(), ipEnabled: z.boolean(),
    ipAllowlist: text(4000).refine(v => invalidCidrLines(v).length === 0, 'every line must be an IP address or CIDR range, such as 10.0.0.0/8'),
  }).partial().strict(),

  notifications: z.object({
    senderName: text(80), replyTo: email, slackEnabled: z.boolean(), digestEnabled: z.boolean(), digestFreq: text(20), pagerEnabled: z.boolean(),
    quietHours: z.object({
      enabled: z.boolean(), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(23),
      activeDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length, 'days must be unique'),
      criticalOverride: z.boolean(),
    }).strict(),
  }).partial().strict(),

  data: z.object({ deviceRetention: digits, activityRetention: digits, piiMasking: z.boolean(), gdprMode: z.boolean() }).partial().strict(),
}

export const isSettingsSection = (v: string): v is SettingsSection => (SETTINGS_SECTIONS as readonly string[]).includes(v)
