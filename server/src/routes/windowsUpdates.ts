import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getWindowsFleetSummary } from '../services/windowsUpdateFleet.js'
import { getWindowsIntel } from '../services/windowsSecurityIntel.js'
import { CVE_ID, getCveDetail, getEpss } from '../services/cveDetails.js'

const router = Router()

// GET /api/windows-updates/fleet?refresh=1 — devices missing Feature/Security updates, build breakdown.
router.get('/fleet', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getWindowsFleetSummary(req.query.refresh === '1') })
}))

// GET /api/windows-updates/intel?refresh=1 — Microsoft MSRC, CISA KEV and lifecycle intelligence (public sources).
router.get('/intel', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getWindowsIntel(req.query.refresh === '1') })
}))

// GET /api/windows-updates/cve/:id — NVD description/CVSS/CWE/references + EPSS for one CVE.
router.get('/cve/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).toUpperCase()
  if (!CVE_ID.test(id)) { res.status(400).json({ success: false, error: 'Invalid CVE id' }); return }
  res.json({ success: true, data: await getCveDetail(id) })
}))

// GET /api/windows-updates/epss?cves=CVE-…,CVE-… — exploit-probability scores (max 100).
router.get('/epss', asyncHandler(async (req, res) => {
  const ids = String(req.query.cves ?? '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0 || ids.length > 100 || !ids.every(i => CVE_ID.test(i))) { res.status(400).json({ success: false, error: 'cves must be 1-100 valid CVE ids' }); return }
  try { res.json({ success: true, data: await getEpss(ids) }) }
  catch (e) { res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'EPSS lookup failed' }) }
}))

export default router
