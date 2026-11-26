import * as m001 from './001_sync_architecture.js'
import * as m002 from './002_sync_modules.js'
import * as m003 from './003_security_findings.js'
import * as m004 from './004_app_settings.js'

// Append new migrations here, in order. Never edit one that has been released: add a new file instead.
export const MIGRATIONS: Array<{ id: string; sql: string }> = [m001, m002, m003, m004]
