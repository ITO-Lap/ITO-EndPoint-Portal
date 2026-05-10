import { Bell, ChevronDown, Menu, Moon, Search, User, Settings, LogOut } from 'lucide-react'
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
  onMenuToggle,
  onSearch,
  searchValue = '',
  onSearchChange,
  notificationOpen = false,
  notifications = [],
  onNotificationToggle,
  onMarkAllNotificationsRead,
  searchLoading = false,
  onProfileNav,
  onSignOut,
  viewerRole = 'Global Admin',
}: HeaderProps) {
  const { notify } = useToast()
  const [searchInput, setSearchInput] = useState(searchValue)
  const [profileOpen, setProfileOpen] = useState(false)

  // Keep local input in sync when parent clears it after a successful search
  useEffect(() => {
    setSearchInput(searchValue)
  }, [searchValue])

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useClickOutside(notifRef, () => {
    if (notificationOpen) onNotificationToggle?.()
  })
  useClickOutside(profileRef, () => setProfileOpen(false))

  // Close profile dropdown on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch?.(searchInput)
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    onSearchChange?.(value)
  }

  const handleProfileAction = (action: string) => {
    setProfileOpen(false)
    if (action === 'Profile') {
      onProfileNav?.('Profile')
    } else if (action === 'Account Settings') {
      onProfileNav?.('Settings')
    } else if (action === 'Sign Out') {
      onSignOut?.()
    } else {
      notify('info', action, `${action} clicked — coming soon`)
    }
  }

  const profileMenuItems = [
    { label: 'Profile', icon: User },
    { label: 'Account Settings', icon: Settings },
    { label: 'Sign Out', icon: LogOut },
  ]

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-slate-900/10 bg-[#071f49] text-slate-100 shadow-sm shadow-slate-950/10 overflow-visible w-full">
      <div className="flex h-full items-center gap-3 px-4 md:px-6 overflow-visible">
        {/* Mobile menu button */}
        <button
          type="button"
          className="xl:hidden flex-shrink-0 rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300 transition"
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search bar */}
        <div className="relative flex-1 min-w-0 max-w-[600px]">
          <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            aria-label="Search devices"
            placeholder="Search by Device Name, User Email or Serial Number..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 w-full rounded-full border border-slate-700/60 bg-slate-900/60 py-0 pl-9 pr-[6.5rem] text-xs text-slate-100 placeholder:text-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <button
            type="button"
            onClick={() => onSearch?.(searchInput)}
            disabled={searchLoading}
            className="absolute right-1 top-1 inline-flex h-7 items-center gap-1.5 rounded-full bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {searchLoading ? (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <Search className="h-3 w-3" />
            )}
            <span>{searchLoading ? 'Searching…' : 'Search'}</span>
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0 overflow-visible">
          {/* Notification bell */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={onNotificationToggle}
              aria-label="Notifications"
              aria-expanded={notificationOpen}
              className={`relative grid h-9 w-9 place-items-center rounded-full border border-slate-700/60 bg-slate-900/60 text-slate-300 transition hover:border-slate-600 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300 ${notificationOpen ? 'border-slate-600 text-white' : ''}`}
            >
              <Bell className="h-4 w-4" />
              {notifications.some(n => !n.read) && (
                <span className="absolute -right-0.5 -top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-red-500 text-[0.55rem] font-bold text-white">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notificationOpen && (
              <div className="absolute top-full right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/15 z-[100]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  <button
                    onClick={onMarkAllNotificationsRead}
                    className="text-xs text-sky-600 hover:text-sky-700 font-medium focus-visible:ring-2 focus-visible:ring-sky-300 rounded px-1"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-2.5 rounded-lg border text-sm ${notification.read ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-blue-50 border-blue-100 text-slate-800'}`}
                    >
                      {notification.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dark mode toggle — shows coming soon */}
          <button
            type="button"
            onClick={() => notify('info', 'Dark Mode', 'Dark mode is coming in the next release')}
            aria-label="Toggle dark mode"
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-700/60 bg-slate-900/60 text-slate-300 transition hover:border-slate-600 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Moon className="h-4 w-4" />
          </button>

          {/* User avatar + profile dropdown */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(prev => !prev)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              className="flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 pl-1 pr-2.5 py-1 text-slate-100 hover:border-slate-600 focus-visible:ring-2 focus-visible:ring-sky-300 transition"
            >
              <div className="grid h-7 w-7 place-items-center rounded-full bg-sky-500/30 text-sky-200 font-bold flex-shrink-0 text-xs">AV</div>
              <div className="hidden sm:block leading-tight">
                <p className="text-xs font-semibold">Admin</p>
                <p className="text-[0.6rem] text-slate-400">{viewerRole}</p>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 ml-0.5 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile dropdown */}
            {profileOpen && (
              <div className="absolute top-full right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/15 z-[100]">
                {profileMenuItems.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleProfileAction(label)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300 transition"
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
