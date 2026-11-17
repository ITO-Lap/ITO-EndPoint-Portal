import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhatsNewBanner } from '../WhatsNewBanner'

beforeEach(() => localStorage.clear())

describe('WhatsNewBanner', () => {
  it('points users who can open the page to it, and remembers dismissal', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(<WhatsNewBanner canOpen={() => true} onOpen={onOpen} />)
    expect(screen.getByText('New: Windows Package Builder')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Open Windows Package Builder/ }))
    expect(onOpen).toHaveBeenCalledWith('Windows Package Builder')
    unmount()
    render(<WhatsNewBanner canOpen={() => true} onOpen={onOpen} />)
    expect(screen.queryByText('New: Windows Package Builder')).not.toBeInTheDocument()
  })
  it('is hidden for users without access', () => {
    render(<WhatsNewBanner canOpen={() => false} onOpen={() => undefined} />)
    expect(screen.queryByRole('region', { name: "What's new" })).not.toBeInTheDocument()
  })
})
