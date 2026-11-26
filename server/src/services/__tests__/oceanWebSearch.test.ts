import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildWebQuery, webProvider, webSearch } from '../ocean/webSearch.js'

vi.mock('../copilotTools.js', () => ({ scrubSecrets: (v: unknown) => v }))
afterEach(() => vi.unstubAllGlobals())

describe('web fallback provider selection', () => {
  it('defaults to the key-free Microsoft Learn search', () => expect(webProvider({})).toMatchObject({ provider: 'microsoft-learn', ready: true }))
  it('needs keys for the optional providers and can be switched off', () => {
    expect(webProvider({ OCEAN_WEB_SEARCH_PROVIDER: 'brave' })).toMatchObject({ provider: 'brave', ready: false })
    expect(webProvider({ OCEAN_WEB_SEARCH_PROVIDER: 'brave', BRAVE_SEARCH_API_KEY: 'k' })).toMatchObject({ ready: true })
    expect(webProvider({ OCEAN_WEB_SEARCH_PROVIDER: 'google-cse', GOOGLE_CSE_KEY: 'k' })).toMatchObject({ ready: false })
    expect(webProvider({ OCEAN_WEB_SEARCH_PROVIDER: 'off' })).toMatchObject({ provider: 'off', ready: false })
  })
})

describe('what leaves the network', () => {
  it('sends a few keywords, never the sentence or anything identifying', () => {
    const q = buildWebQuery('Why does device DESKTOP-4F8K2LMQ owned by anna.smith@zinnia.com at 10.2.3.4 fail Intune compliance? token sk-abcdefghijklmnopqrstuv')
    expect(q).toMatch(/intune/); expect(q).toMatch(/compliance/)
    expect(q).not.toMatch(/anna|@|zinnia|10\.2|desktop-4f8k|sk-/i)
    expect(q.split(' ').length).toBeLessThanOrEqual(8)
  })
  it('sends nothing when nothing safe remains', () => expect(buildWebQuery('a@b.com 10.0.0.1 123456789')).toBe(''))
})

describe('web search', () => {
  it('parses Microsoft Learn results, keeps https links only and strips markup', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(String(url)).toContain('learn.microsoft.com/api/search?search=intune%20compliance')
      return new Response(JSON.stringify({ results: [
        { title: 'Intune compliance policies', url: 'https://learn.microsoft.com/intune/compliance', description: 'Set <b>rules</b> for devices   to be compliant.' },
        { title: 'Plain http link', url: 'http://example.com/x', description: 'dropped' },
        { title: 'javascript', url: 'javascript:alert(1)', description: 'dropped' },
      ] }), { status: 200 })
    }))
    const r = await webSearch('how does intune compliance work', {})
    expect(r.results).toEqual([{ title: 'Intune compliance policies', url: 'https://learn.microsoft.com/intune/compliance', snippet: 'Set rules for devices to be compliant.' }])
    expect(r.label).toBe('Microsoft Learn')
  })
  it('reports a failure without echoing the request URL or any key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('connect ECONNREFUSED https://api.search.brave.com/?key=SECRETKEY'), { name: 'TypeError' }) }))
    const r = await webSearch('intune compliance', { OCEAN_WEB_SEARCH_PROVIDER: 'brave', BRAVE_SEARCH_API_KEY: 'SECRETKEY' })
    expect(r.results).toEqual([]); expect(r.error).toBe('the search service was unavailable')
    expect(JSON.stringify(r)).not.toContain('SECRETKEY')
  })
  it('does not call out when switched off or when the question has no safe terms', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect((await webSearch('intune compliance', { OCEAN_WEB_SEARCH_PROVIDER: 'off' })).error).toBeTruthy()
    expect((await webSearch('10.0.0.1 a@b.com', {})).error).toMatch(/safe search terms/)
    expect(f).not.toHaveBeenCalled()
  })
})
