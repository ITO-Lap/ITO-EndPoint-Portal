import { useState, useEffect, useMemo } from 'react'
import { Search, IdCard, ChevronRight } from 'lucide-react'
import { api } from '../../api'
import type { AppUser } from '../../types'
import { useToast } from '../ui/ToastProvider'
import { Avatar, RoleBadge, StatusBadge, RiskBadge } from './shared'

export function UserSearchLanding({ onSelect }: { onSelect: (user: AppUser) => void }) {
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
    ).slice(0, 20)
  }, [allUsers, query])

  return (
    <div className="space-y-4 w-full">
      <div>
        <h1 className="text-xl font-bold text-slate-900">User Intelligence</h1>
        <p className="mt-0.5 text-sm text-slate-500">Search for a user to view their full identity, device, and sign-in profile.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            autoFocus
            placeholder="Search by name, email, or department…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Search className="h-6 w-6 text-slate-400 animate-pulse mb-3" />
            <p className="text-sm font-semibold text-slate-700">Loading users…</p>
          </div>
        ) : !query.trim() ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="rounded-full bg-slate-100 p-4 mb-3"><IdCard className="h-6 w-6 text-slate-400" /></div>
            <p className="text-sm font-semibold text-slate-700">Start typing to search</p>
            <p className="text-xs text-slate-500 mt-1">{allUsers.length} users available</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-sm font-semibold text-slate-700">No users found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different name, email, or department</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {results.map(user => (
              <button key={user.id} type="button" onClick={() => onSelect(user)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50/60 transition group">
                <Avatar user={user} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-orange-700 transition truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email} {user.department && `· ${user.department}`}</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  <RoleBadge role={user.toolRole} />
                  <StatusBadge status={user.status} />
                  <RiskBadge level={user.riskLevel} />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-500 transition flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
