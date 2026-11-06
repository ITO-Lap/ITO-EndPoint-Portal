import { describe, it, expect } from 'vitest'
import { CVE_ID, externalLinks, parseEpss, parseNvd } from '../cveDetails.js'

const nvd = { vulnerabilities: [{ cve: {
  id: 'CVE-2024-30051', vulnStatus: 'Analyzed', published: '2024-05-14T17:17:21.763', lastModified: '2025-01-01T00:00:00',
  descriptions: [{ lang: 'es', value: 'hola' }, { lang: 'en', value: 'Windows DWM Core Library Elevation of Privilege Vulnerability' }],
  metrics: { cvssMetricV31: [
    { source: 'secure@microsoft.com', type: 'Secondary', cvssData: { version: '3.1', baseScore: 7.8, baseSeverity: 'HIGH', vectorString: 'CVSS:3.1/AV:L' } },
    { source: 'nvd@nist.gov', type: 'Primary', cvssData: { version: '3.1', baseScore: 7.5, baseSeverity: 'HIGH', vectorString: 'CVSS:3.1/AV:N' } },
  ] },
  weaknesses: [{ description: [{ value: 'CWE-122' }, { value: 'CWE-787' }, { value: 'NVD-CWE-Other' }] }],
  references: [
    { url: 'https://example.com/blog', source: 'x', tags: ['Third Party Advisory'] },
    { url: 'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-30051', source: 'secure@microsoft.com', tags: ['Patch', 'Vendor Advisory'] },
    { url: 'javascript:alert(1)', source: 'x', tags: [] },
  ],
} }] }

describe('parseNvd', () => {
  const d = parseNvd(nvd)!
  it('reads the English description, status and dates', () => {
    expect(d.description).toContain('DWM Core Library')
    expect(d).toMatchObject({ status: 'Analyzed', published: '2024-05-14T17:17:21.763' })
  })
  it('prefers the NVD Primary CVSS score and keeps the vector', () => {
    expect(d.cvss).toEqual({ version: '3.1', score: 7.5, severity: 'HIGH', vector: 'CVSS:3.1/AV:N', source: 'nvd@nist.gov' })
  })
  it('keeps only real CWE ids and orders vendor advisories first, dropping non-http links', () => {
    expect(d.cwes).toEqual(['CWE-122', 'CWE-787'])
    expect(d.references.map(r => r.url)).toEqual(['https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-30051', 'https://example.com/blog'])
  })
  it('returns null when NVD has no record', () => {
    expect(parseNvd({ vulnerabilities: [] })).toBeNull()
    expect(parseNvd(null)).toBeNull()
  })
})

describe('parseEpss / CVE_ID / links', () => {
  it('parses EPSS scores and ignores malformed rows', () => {
    const m = parseEpss({ data: [{ cve: 'CVE-2024-30051', epss: '0.05687', percentile: '0.93034', date: '2026-11-06' }, { cve: 'bad', epss: '1', percentile: '1', date: 'x' }, { cve: 'CVE-2024-1111', epss: 'NaN', percentile: '0', date: 'x' }] })
    expect([...m.keys()]).toEqual(['CVE-2024-30051'])
    expect(m.get('CVE-2024-30051')).toEqual({ score: 0.05687, percentile: 0.93034, date: '2026-11-06' })
  })
  it('only accepts well-formed CVE ids (guards the outgoing URL)', () => {
    expect(CVE_ID.test('CVE-2026-96951')).toBe(true)
    for (const bad of ['cve-2026-1', 'CVE-2026-12', 'CVE-2026-1234&x=1', 'CVE-2026-1234/../a', '']) expect(CVE_ID.test(bad)).toBe(false)
    expect(externalLinks('CVE-2026-96951')[0]!.url).toContain('CVE-2026-96951')
  })
})
