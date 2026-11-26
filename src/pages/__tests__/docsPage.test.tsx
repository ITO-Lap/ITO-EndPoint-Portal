import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocsPage } from '../DocsPage'

describe('in-app Documentation', () => {
  it('explains the four Security Posture pillars, the hybrid model and the check-in settings', async () => {
    render(<DocsPage />)
    await userEvent.click(screen.getByRole('button', { name: /Security Posture/ }))
    for (const t of ['Disk Encryption', 'Critical Patching', 'MDM Compliance', 'MDM Check-in', 'POSTURE_CHECKIN_RULE', 'MDM_DETAIL_MAX_STALE_DAYS']) expect(screen.getAllByText(t).length).toBeGreaterThan(0)
    expect(screen.getByText(/BOTH Microsoft Intune and Endpoint Central/)).toBeInTheDocument()
    expect(screen.queryByText('Firewall')).not.toBeInTheDocument()   // the old, inaccurate six-control list is gone
  })
  it('has Patching, Security Analysis, Ocean and an A–Z page index', async () => {
    render(<DocsPage />)
    await userEvent.click(screen.getByRole('button', { name: /Patching/ }))
    expect(screen.getByText('Patch Operations')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Ocean Assistant/ }))
    expect(screen.getByText(/17 role-filtered tools/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Every Page/ }))
    expect(screen.getByText('Scheduled Reports')).toBeInTheDocument()
    expect(screen.getByText('SECURITY-POSTURE.md')).toBeInTheDocument()
  })
})
