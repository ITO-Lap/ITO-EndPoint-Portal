import { useState, useEffect } from 'react'
import { Building2, Plus, RefreshCw, XCircle, CheckCircle, Trash2, TestTube, Eye, EyeOff } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { Tenant, CreateTenantInput } from '../api/intelligence'

export function MultiTenantPage({ onBack }: { onBack: () => void }) {
  const [tenants, setTenants]     = useState<Tenant[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [testing, setTesting]     = useState<string | null>(null)
  const [testResults, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [dbMissing, setDbMissing] = useState(false)

  const [form, setForm] = useState<CreateTenantInput>({
    name: '', domain: '', ms_tenant_id: '', client_id: '', client_secret: '', plan: 'free',
  })
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [formErr, setFormErr]       = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await intelApi.tenants.list()
      setTenants(res.data ?? [])
      if ('message' in res && res.message) setDbMissing(true)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.ms_tenant_id || !form.client_id || !form.client_secret) {
      setFormErr('Name, Tenant ID, Client ID, and Client Secret are required.')
      return
    }
    setSaving(true); setFormErr(null)
    try {
      const res = await intelApi.tenants.create(form)
      if (res.success) {
        setShowForm(false)
        setForm({ name: '', domain: '', ms_tenant_id: '', client_id: '', client_secret: '', plan: 'free' })
        await load()
      } else {
        setFormErr(res.error ?? 'Failed to create tenant.')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tenant? This cannot be undone.')) return
    await intelApi.tenants.delete(id)
    await load()
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    try {
      const res = await intelApi.tenants.test(id)
      setResults(prev => ({
        ...prev,
        [id]: { ok: res.success, msg: res.success ? `Connected — ${res.deviceCount} devices (${res.responseMs}ms)` : (res.error ?? 'Connection failed') }
      }))
    } finally {
      setTesting(null)
    }
  }

  const handleTestEnv = async () => {
    setTesting('env')
    try {
      const res = await intelApi.tenants.testEnv()
      setResults(prev => ({
        ...prev,
        env: { ok: res.success, msg: res.success ? `Connected — ${res.deviceCount} devices (tenant: ${res.tenantId})` : (res.error ?? 'Failed') }
      }))
    } finally {
      setTesting(null)
    }
  }

  const field = (label: string, key: keyof CreateTenantInput, type = 'text', placeholder?: string) => (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type === 'password' && !showSecret ? 'password' : 'text'}
        value={String(form[key] ?? '')}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-400"
      />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-indigo-500" /> Multi-Tenant
            </span>
          </div>
          <p className="text-xs text-slate-500">Manage multiple Microsoft Intune tenants from one MSP dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition">
            <Plus className="h-3.5 w-3.5" /> Add Tenant
          </button>
        </div>
      </div>

      {/* DB warning */}
      {dbMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold mb-0.5">Database not configured</p>
          Multi-tenant management requires PostgreSQL. Set <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">server/.env</code> and run <code className="font-mono">psql $DATABASE_URL -f server/src/db/schema.sql</code>.
        </div>
      )}

      {/* .env tenant test */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Environment Tenant (.env)</p>
            <p className="text-xs text-slate-500">Test the Intune credentials configured in <code className="font-mono text-slate-700">server/.env</code></p>
          </div>
          <button
            onClick={handleTestEnv}
            disabled={testing === 'env'}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <TestTube className="h-3.5 w-3.5" />
            {testing === 'env' ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
        {testResults['env'] && (
          <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResults['env'].ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {testResults['env'].ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {testResults['env'].msg}
          </div>
        )}
      </div>

      {/* Add tenant form */}
      {showForm && (
        <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Add New Tenant</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field('Organisation Name *', 'name', 'text', 'Contoso Ltd')}
            {field('Domain', 'domain', 'text', 'contoso.com')}
            {field('Microsoft Tenant ID *', 'ms_tenant_id', 'text', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
            {field('Client ID *', 'client_id', 'text', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Client Secret *</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.client_secret}
                  onChange={e => setForm(prev => ({ ...prev, client_secret: e.target.value }))}
                  placeholder="Azure AD client secret value"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-400"
                />
                <button onClick={() => setShowSecret(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Plan</label>
              <select value={form.plan} onChange={e => setForm(prev => ({ ...prev, plan: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          {formErr && <p className="mt-3 text-xs text-red-600">{formErr}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60 transition">
              {saving ? 'Saving…' : 'Add Tenant'}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tenant list */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : tenants.length === 0 ? (
        <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-12 text-center">
          <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No tenants configured</p>
          <p className="text-xs text-slate-400 mt-1">Add a tenant above to manage multiple Intune environments.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map(t => (
            <div key={t.id} className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 capitalize">{t.plan}</span>
                </div>
                <p className="text-xs text-slate-500">{t.domain} · Tenant ID: {t.ms_tenant_id}</p>
                {testResults[t.id] && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${testResults[t.id].ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    {testResults[t.id].ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {testResults[t.id].msg}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleTest(t.id)} disabled={testing === t.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                  <TestTube className="h-3.5 w-3.5" />{testing === t.id ? 'Testing…' : 'Test'}
                </button>
                <button onClick={() => handleDelete(t.id)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-600 hover:bg-red-100 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
