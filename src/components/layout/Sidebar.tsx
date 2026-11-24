import { useState, useEffect } from 'react'
import { Settings, ChevronDown } from 'lucide-react'
import { navItems, connectedSources, NAV_GROUP_ORDER, AUTOMATION_GROUP } from '../../data/dashboardData'
import { Badge } from '../ui/Badge'
import { ZinniaHorizontal } from '../ui/ZinniaLogo'
import { api } from '../../api'
import type { IntegrationStatusItem } from '../../api'
import type { ConnectedSource, BadgeVariant, UserToolRole } from '../../types'
import { canAccess } from '../../lib/permissions'
import { useNavVisibility } from '../../context/navVisibilityHooks'
import { usePermissions } from '../../context/permissionsHooks'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  activePage: string
  onNavSelect: (page: string) => void
  onSourceClick: (source: ConnectedSource) => void
  viewerRole?: UserToolRole
}

function StatusDot({ configured, healthy, loading }: { configured: boolean; healthy: boolean | null; loading: boolean }) {
  if (loading)           return <span className="h-1.5 w-1.5 rounded-full bg-slate-300 flex-shrink-0 animate-pulse" />
  if (!configured)       return <span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
  if (healthy === false) return <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
  return                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
}


function GroupHeader({ label, collapsed, onToggle, isAutomation }: {
  label: string; collapsed: boolean; onToggle: () => void; isAutomation: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group w-full flex items-center justify-between px-3 py-1.5 rounded-xl transition water-glow-sm"
      style={{ background: 'transparent' }}
    >
      <span
        className="text-[0.55rem] font-black uppercase tracking-[0.18em] select-none"
        style={{ color: isAutomation ? '#F46C00' : '#94A3B8' }}
      >
        {label}
      </span>
      <ChevronDown
        className={`h-3 w-3 transition-transform flex-shrink-0 ${collapsed ? '-rotate-90' : ''}`}
        style={{ color: isAutomation ? '#F46C00' : '#CBD5E1' }}
      />
    </button>
  )
}

function NavButton({ item, isActive, isAutomation, onClick }: {
  item: { title: string; label?: string; icon: React.ElementType; badge?: string }
  isActive: boolean
  isAutomation: boolean
  onClick: () => void
}) {
  const Icon = item.icon

  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold transition-all water-glow focus-visible:outline-none"
      style={isActive ? {
        background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(99,102,241,0.08))',
        border: '1px solid rgba(14,165,233,0.30)',
        boxShadow: 'var(--water-glow-sm)',
        color: '#0284C7',
      } : {
        background: 'transparent',
        border: '1px solid transparent',
        color: isAutomation ? '#F46C00' : '#64748B',
      }}
    >
      {/* Icon */}
      <span
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl transition-all duration-200 group-hover:scale-110"
        style={isActive ? {
          background: 'linear-gradient(135deg, rgba(14,165,233,0.20), rgba(99,102,241,0.12))',
          border: '1px solid rgba(14,165,233,0.30)',
          color: '#0EA5E9',
          boxShadow: '0 4px 12px rgba(14,165,233,0.20)',
        } : {
          background: isAutomation ? 'rgba(244,108,0,0.08)' : 'rgba(255,255,255,0.60)',
          border: `1px solid ${isAutomation ? 'rgba(244,108,0,0.20)' : 'rgba(148,163,184,0.20)'}`,
          color: isAutomation ? '#F46C00' : '#94A3B8',
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <span className="flex-1 truncate">{item.label ?? item.title}</span>

      {item.badge && (
        <span
          className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.5rem] font-black"
          style={isActive
            ? { background: 'rgba(14,165,233,0.15)', color: '#0EA5E9' }
            : { background: 'rgba(244,108,0,0.12)', color: '#F46C00' }}
        >
          {item.badge}
        </span>
      )}
    </button>
  )
}

function ParentButton({ label, icon: Icon, expanded, hasActiveChild, onToggle }: {
  label: string; icon: React.ElementType; expanded: boolean; hasActiveChild: boolean; onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold transition-all water-glow focus-visible:outline-none"
      style={{ background: 'transparent', border: '1px solid transparent', color: hasActiveChild ? '#0284C7' : '#64748B' }}
    >
      <span
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl"
        style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(148,163,184,0.20)', color: hasActiveChild ? '#0EA5E9' : '#94A3B8' }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
    </button>
  )
}

export function Sidebar({
  isOpen = true, onClose, activePage, onNavSelect, onSourceClick, viewerRole = 'Global Admin',
}: SidebarProps) {
  const [statusMap, setStatusMap]         = useState<Record<string, IntegrationStatusItem>>({})
  const [statusLoading, setStatusLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.fetchIntegrationStatus()
      .then(items => {
        const map: Record<string, IntegrationStatusItem> = {}
        items.forEach(i => { map[i.id] = i })
        setStatusMap(map)
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false))
  }, [])

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g); else next.add(g)
      return next
    })
  }

  const toggleParent = (p: string) => {
    setCollapsedParents(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }

  const { hiddenNavIds } = useNavVisibility()
  const permissions = usePermissions()
  const accessible = navItems.filter(i => canAccess(viewerRole, permissions, i.title) && !hiddenNavIds.has(i.id))
  const grouped    = NAV_GROUP_ORDER.map(g => ({
    group: g,
    items: accessible.filter(i => i.group === g),
  })).filter(g => g.items.length > 0)

  const anyConfigured = Object.values(statusMap).some(s => s.configured)
  const anyError      = Object.values(statusMap).some(s => s.configured && s.healthy === false)
  const liveLabel     = statusLoading ? 'Checking' : anyError ? 'Issues' : anyConfigured ? 'Live' : 'Offline'
  const liveVariant   = statusLoading ? 'gray'     : anyError ? 'orange' : anyConfigured ? 'green' : 'red'

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 xl:hidden cursor-pointer" style={{ background: 'rgba(15,23,42,0.20)', backdropFilter: 'blur(4px)' }} onClick={onClose} />}

      <aside
        className={`flex min-h-full w-full max-w-[16.25rem] xl:w-[16.25rem] xl:max-w-none flex-col px-3 py-4 glass-light transition-transform duration-300 xl:translate-x-0 fixed left-0 top-0 z-50 h-full overflow-y-auto xl:static xl:z-auto xl:h-auto ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ borderRight: '1px solid rgba(148,163,184,0.15)', boxShadow: '4px 0 24px rgba(14,165,233,0.06)' }}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 40%, #0EA5E9 70%, #6366F1 100%)' }} />

        {/* Brand lockup — Zinnia official logo */}
        <div
          className="mt-1 mb-5 rounded-2xl px-3 py-2.5 water-glow-card"
          style={{ background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.90)', boxShadow: '0 4px 16px rgba(244,108,0,0.08), inset 0 1px 0 rgba(255,255,255,1)' }}
        >
          <ZinniaHorizontal iconSize="sm" wordmarkSize="sm" subtitle="ITO Endpoint" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5" aria-label="Main navigation">
          {grouped.map(({ group, items }, idx) => {
            const isAutomation = group === AUTOMATION_GROUP
            const isCollapsed  = collapsedGroups.has(group)

            return (
              <div key={group} className={idx > 0 ? 'mt-2' : ''}>
                {group !== 'Overview' && (
                  <div className="mb-1">
                    <GroupHeader label={group} collapsed={isCollapsed} onToggle={() => toggleGroup(group)} isAutomation={isAutomation} />
                  </div>
                )}

                {/* Automation accent line */}
                {isAutomation && !isCollapsed && (
                  <div className="mb-1.5 ml-3 h-px" style={{ background: 'linear-gradient(90deg, rgba(244,108,0,0.35) 0%, transparent 100%)' }} />
                )}

                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {items.map(item => {
                      const button = (
                        <NavButton
                          key={item.title}
                          item={item}
                          isActive={item.title === activePage}
                          isAutomation={isAutomation}
                          onClick={() => { onNavSelect(item.title); onClose?.() }}
                        />
                      )
                      if (!item.parent) return button
                      const siblings = items.filter(i => i.parent === item.parent)
                      if (siblings[0] !== item) return null // rendered together with the first child
                      const parentOpen = !collapsedParents.has(item.parent)
                      const parent = item.parent
                      return (
                        <div key={`parent-${parent}`}>
                          <ParentButton
                            label={parent}
                            icon={item.icon}
                            expanded={parentOpen}
                            hasActiveChild={siblings.some(c => c.title === activePage)}
                            onToggle={() => toggleParent(parent)}
                          />
                          {parentOpen && (
                            <div className="ml-5 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: 'rgba(148,163,184,0.25)' }}>
                              {siblings.map(child => (
                                <NavButton
                                  key={child.title}
                                  item={child}
                                  isActive={child.title === activePage}
                                  isAutomation={isAutomation}
                                  onClick={() => { onNavSelect(child.title); onClose?.() }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Integration sources */}
        <div
          className="mt-4 rounded-2xl p-3"
          style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(148,163,184,0.15)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.90)' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.55rem] font-black uppercase tracking-[0.18em] text-slate-400">Integrations</p>
            <Badge label={liveLabel} variant={liveVariant as BadgeVariant} className="text-[0.5rem] py-0.5 px-1.5 h-fit" />
          </div>
          <div className="space-y-1">
            {connectedSources.map(source => {
              const Icon    = source.icon
              const stat    = statusMap[source.integrationId]
              const configured = stat?.configured ?? false
              const healthy    = stat?.healthy ?? null

              return (
                <button
                  key={source.name}
                  type="button"
                  onClick={() => onSourceClick(source)}
                  aria-label={`View details for ${source.name}`}
                  className="w-full flex items-center justify-between rounded-xl px-2 py-1.5 text-left group water-glow-sm transition-all"
                  style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(148,163,184,0.12)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="grid h-5 w-5 place-items-center rounded-lg flex-shrink-0"
                      style={{
                        background: !statusLoading && !configured ? 'rgba(148,163,184,0.10)' : 'rgba(244,108,0,0.10)',
                        border: `1px solid ${!statusLoading && !configured ? 'rgba(148,163,184,0.20)' : 'rgba(244,108,0,0.20)'}`,
                        color: !statusLoading && !configured ? '#CBD5E1' : '#F46C00',
                      }}
                    >
                      <Icon className="h-2.5 w-2.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.62rem] font-semibold leading-tight truncate text-slate-600">
                        {source.name}
                      </p>
                      {!statusLoading && !configured && <p className="text-[0.55rem] text-slate-400">Not connected</p>}
                      {!statusLoading && configured && healthy === false && <p className="text-[0.55rem] text-amber-500">Error</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!statusLoading && !configured && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); onNavSelect('Settings') }}>
                        <Settings className="h-2.5 w-2.5 text-slate-300 hover:text-[#0EA5E9] transition-colors" />
                      </span>
                    )}
                    <StatusDot configured={configured} healthy={healthy} loading={statusLoading} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-3 px-2 text-center text-[0.5rem] text-slate-300">ITO Endpoint v2.0 · Enterprise</p>
      </aside>
    </>
  )
}
