import { Bell, ChevronDown, Menu, Search, User, Settings, LogOut } from 'lucide-react'
import { ZinniaIcon } from '../ui/ZinniaLogo'
import { useRef, useState, useEffect } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useToast } from '../ui/ToastProvider'
import type { NotificationItem } from '../../types'

interface HeaderProps {
  onMenuToggle?: () => void
  onSearch?: (query: string) => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  notificationOpen?: boolean
  notifications?: NotificationItem[]
  onNotificationToggle?: () => void
  onMarkAllNotificationsRead?: () => void
  searchLoading?: boolean
  onProfileNav?: (page: string) => void
  onSignOut?: () => void
  viewerRole?: string
}

export function Header({
  onMenuToggle, onSearch, searchValue = '', onSearchChange,
  notificationOpen = false, notifications = [], onNotificationToggle,
  onMarkAllNotificationsRead, searchLoading = false,
  onProfileNav, onSignOut, viewerRole = 'Global Admin',
}: HeaderProps) {
  const { notify }                        = useToast()
  const [searchInput, setSearchInput]     = useState(searchValue)
  const [profileOpen, setProfileOpen]     = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  useEffect(() => { setSearchInput(searchValue) }, [searchValue])

  const notifRef   = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useClickOutside(notifRef,   () => { if (notificationOpen) onNotificationToggle?.() })
  useClickOutside(profileRef, () => setProfileOpen(false))

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setProfileOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <header
      className="sticky top-0 z-20 w-full overflow-visible glass-light"
      style={{ borderBottom: '1px solid rgba(148,163,184,0.15)', boxShadow: '0 4px 24px rgba(14,165,233,0.06), inset 0 -1px 0 rgba(148,163,184,0.10)' }}
    >
      {/* Top gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, transparent, #FFC600 20%, #F46C00 50%, #0EA5E9 80%, transparent)' }}
      />

      <div className="flex h-14 items-center gap-3 px-4 md:px-5 overflow-visible">
        {/* Mobile menu */}
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Open navigation"
          className="xl:hidden flex-shrink-0 grid h-8 w-8 place-items-center rounded-xl water-glow text-slate-500"
          style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(148,163,184,0.25)' }}
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Zinnia icon — visible on mobile (when sidebar is hidden) */}
        <div className="xl:hidden flex-shrink-0">
          <ZinniaIcon className="h-7 w-auto" />
        </div>

        {/* Search — Apple-style command bar */}
        <div className="relative flex-1 min-w-0 max-w-[560px]">
          <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
            <Search
              className="h-3.5 w-3.5 transition-colors duration-200"
              style={{ color: searchFocused ? '#0EA5E9' : '#94A3B8' }}
            />
          </div>
          <input
            type="text"
            aria-label="Search devices"
            placeholder="Search devices, users, serial numbers…"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); onSearchChange?.(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter') onSearch?.(searchInput) }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="h-9 w-full rounded-xl py-0 pl-9 pr-[6rem] text-xs font-medium text-slate-700 water-input"
            style={{ backdropFilter: 'blur(12px)' }}
          />
          <button
            type="button"
            onClick={() => onSearch?.(searchInput)}
            disabled={searchLoading}
            className="absolute right-1 top-1 inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.68rem] font-bold text-white transition-all disabled:opacity-50 btn-water"
          >
            {searchLoading ? (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : <Search className="h-3 w-3" />}
            <span className="hidden sm:inline">{searchLoading ? '…' : 'Search'}</span>
          </button>
        </div>

        <div className="flex-1" />

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={onNotificationToggle}
              aria-label="Notifications"
              className="relative grid h-8 w-8 place-items-center rounded-xl water-glow text-slate-500"
              style={{ background: 'rgba(255,255,255,0.70)', border: `1px solid ${notificationOpen ? 'rgba(14,165,233,0.40)' : 'rgba(148,163,184,0.25)'}` }}
            >
              <Bell className="h-3.5 w-3.5" />
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full text-[0.5rem] font-black text-white"
                  style={{ background: 'linear-gradient(135deg, #F46C00, #FB471F)', boxShadow: '0 2px 8px rgba(244,108,0,0.40)' }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {notificationOpen && (
              <div
                className="absolute top-full right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-4 shadow-2xl z-[100] glass-strong animate-slide-up overflow-hidden"
                style={{ boxShadow: '0 16px 64px rgba(14,165,233,0.12), 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)' }}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, #0EA5E9, #6366F1)' }} />
                <div className="flex items-center justify-between mb-3 mt-1">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-slate-400" />
                    <p className="text-sm font-bold text-slate-800">Notifications</p>
                    {unreadCount > 0 && (
                      <span className="rounded-full px-1.5 py-0.5 text-[0.55rem] font-black" style={{ background: 'rgba(14,165,233,0.12)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.25)' }}>
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <button
                    onClick={onMarkAllNotificationsRead}
                    className="text-[0.68rem] font-bold rounded-full px-2.5 py-0.5 water-glow-sm"
                    style={{ color: '#0EA5E9', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.20)' }}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className="rounded-xl p-2.5 text-xs"
                      style={{
                        background: n.read ? 'rgba(255,255,255,0.50)' : 'rgba(14,165,233,0.06)',
                        border: `1px solid ${n.read ? 'rgba(148,163,184,0.15)' : 'rgba(14,165,233,0.18)'}`,
                        color: n.read ? '#64748b' : '#0F172A',
                      }}
                    >
                      {!n.read && <span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 animate-pulse" style={{ background: '#0EA5E9' }} />}
                      {n.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(p => !p)}
              className="flex items-center gap-2 rounded-xl pl-1.5 pr-2.5 py-1 water-glow"
              style={{
                background: 'rgba(255,255,255,0.70)',
                border: `1px solid ${profileOpen ? 'rgba(14,165,233,0.35)' : 'rgba(148,163,184,0.25)'}`,
              }}
            >
              <div
                className="grid h-6 w-6 place-items-center rounded-lg font-black flex-shrink-0 text-[0.62rem] text-white"
                style={{ background: 'linear-gradient(135deg, #F46C00, #FB471F)', boxShadow: '0 2px 8px rgba(244,108,0,0.35)' }}
              >
                AV
              </div>
              <div className="hidden sm:block leading-tight text-left">
                <p className="text-xs font-bold text-slate-700">Admin</p>
                <p className="text-[0.58rem] text-slate-400">{viewerRole}</p>
              </div>
              <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <div
                className="absolute top-full right-0 mt-2 w-44 rounded-2xl py-1.5 shadow-xl z-[100] glass-strong animate-slide-up overflow-hidden"
                style={{ boxShadow: '0 16px 48px rgba(14,165,233,0.10), 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)' }}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, #0EA5E9, #6366F1)' }} />
                <div className="mt-1 space-y-0.5 px-1.5">
                  {[
                    { label: 'Profile',   icon: User,     action: 'Profile'  },
                    { label: 'Settings',  icon: Settings, action: 'Settings' },
                    { label: 'Sign Out',  icon: LogOut,   action: 'Sign Out', danger: true },
                  ].map(({ label, icon: Icon, action, danger }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setProfileOpen(false); action === 'Profile' ? onProfileNav?.('Profile') : action === 'Settings' ? onProfileNav?.('Settings') : action === 'Sign Out' ? onSignOut?.() : notify('info', label, `${label} — coming soon`) }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl water-glow"
                      style={{ color: danger ? '#EF4444' : '#475569' }}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
