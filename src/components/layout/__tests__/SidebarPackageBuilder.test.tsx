import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api', () => ({ api: { fetchIntegrationStatus: vi.fn().mockResolvedValue([]) } }))

import { Sidebar } from '../Sidebar'
import { NavVisibilityProvider } from '../../../context/NavVisibilityContext'
import { PermissionsProvider } from '../../../context/PermissionsContext'
import { KNOWN_PAGES, pageKey } from '../../../lib/permissions'

describe('Sidebar — Windows Package Builder', () => {
  it('shows a single "Windows Package Builder" item (no Package Builder group, no Mac entry)', async () => {
    const onNavSelect = vi.fn()
    const all = Object.fromEntries(KNOWN_PAGES.map(p => [pageKey(p), true]))
    render(
      <PermissionsProvider permissions={all}>
        <NavVisibilityProvider>
          <Sidebar activePage="Dashboard" onNavSelect={onNavSelect} onSourceClick={() => undefined} viewerRole="Global Admin" />
        </NavVisibilityProvider>
      </PermissionsProvider>,
    )
    expect(screen.queryByRole('button', { name: /^Package Builder/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mac Package Builder/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Windows Package Builder/ }))
    expect(onNavSelect).toHaveBeenCalledWith('Windows Package Builder')
  })
})
