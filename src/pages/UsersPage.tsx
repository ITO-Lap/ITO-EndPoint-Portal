import { useState, useEffect, useMemo } from 'react'
import { Search, X, RefreshCw, ChevronRight } from 'lucide-react'
import { useToast } from '../components/ui/ToastProvider'
import { api } from '../api'
import type { AppUser, UserToolRole } from '../types'
import { Avatar, RiskBadge, StatusBadge } from '../components/user-intelligence/shared'

// Deliberately NOT a full directory dashboard (that duplicated the Entra ID
// "Users" blade and was removed). This is a lookup step whose only purpose
// is to hand off into User Intelligence — the real cross-system (Entra +
// Intune + ManageEngine) risk correlation view, which has no other
// navigation entry point. No sort/filter grid, no Invite/Edit actions.
export function UsersPage({ onOpenUser }: { viewerRole?: UserToolRole; onOpenUser: (user: AppUser) => void }) {
  const { notify } = useToast()
  const [allUsers, setAllUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.fetchUsers()
      .then(setAllUsers)
      .catch(err => notify('error', 'Failed to load users', err.message))
      .finally(() => setLoading(false))
  }, [notify])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allUsers.filter(u =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q)
    ).slice(0, 25)
  }, [allUsers, query])

  return (
    <div className="space-y-4 w-full max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Find a User</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Search by name, email, or department to open that user's cross-system risk view
          (Entra sign-in risk + Intune/ManageEngine device compliance).
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          autoFocus
          placeholder="Search by name, email, or department…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading directory…
        </div>
      ) : query.trim() === '' ? (
        <p className="text-center text-xs text-slate-400 py-10">Start typing to find a user.</p>
      ) : results.length === 0 ? (
        <p className="text-center text-xs text-slate-400 py-10">No users match "{query}".</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 divide-y divide-slate-100 overflow-hidden">
          {results.map(user => (
            <button
              key={user.id}
              type="button"
              onClick={() => onOpenUser(user)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50/60 transition group"
            >
              <Avatar user={user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 group-hover:text-orange-700 transition truncate">{user.firstName} {user.lastName}</p>
                <p className="text-[0.65rem] text-slate-400 truncate">{user.email}{user.department ? ` · ${user.department}` : ''}</p>
              </div>
              <StatusBadge status={user.status} />
              <RiskBadge level={user.riskLevel} />
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-500 transition flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
