import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownText } from '../MarkdownText'
import { parseMarkdown } from '../../../lib/markdown'

describe('MarkdownText', () => {
  it('renders bold, inline code and drops chunk separators instead of showing raw markers', () => {
    const { container } = render(<MarkdownText text={'Modal that shows status.\n\n**Props:** `open: boolean`, `onClose: () => void`\n\n---'} />)
    expect(container.textContent).not.toMatch(/\*\*|`|---/)
    expect(screen.getByText('Props:').tagName).toBe('STRONG')
    expect(screen.getByText('open: boolean').tagName).toBe('CODE')
    expect(container.querySelector('hr')).toBeNull()
  })
  it('renders headings, lists, fenced code and tables', () => {
    const md = '## Setup\n\n- one\n- two\n\n1. first\n2. second\n\n```ts\nconst a = 1\n```\n\n| Col | Val |\n|---|---|\n| a | 1 |'
    const { container } = render(<MarkdownText text={md} />)
    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument()
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelector('pre code')?.textContent).toBe('const a = 1')
    expect(container.querySelectorAll('table th')).toHaveLength(2)
    expect(screen.getByText('1', { selector: 'td' })).toBeInTheDocument()
  })
  it('never injects HTML and only links http(s)', () => {
    const { container } = render(<MarkdownText text={'<img src=x onerror=alert(1)> [ok](https://zinnia.com) [bad](javascript:alert(1))'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://zinnia.com')
    expect(container.textContent).toContain('bad')
  })
  it('keeps paragraphs separate and tolerates empty input', () => {
    expect(parseMarkdown('a\nb\n\nc')).toHaveLength(2)
    expect(parseMarkdown('')).toEqual([])
  })
})
