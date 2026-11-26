import { useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { useToast } from './toastHooks'

interface CopyTextProps {
  /** Text placed on the clipboard. Nothing is rendered when empty or a placeholder. */
  value?: string | null
  /** Used in the toast, e.g. "Device name". */
  label?: string
  children?: ReactNode
  className?: string
}

const PLACEHOLDER = /^(—|-|unknown|n\/a|not reported|none)$/i

/** Wraps a table cell value and adds a hover-revealed copy button that doesn't trigger row clicks. */
export function CopyText({ value, label = 'Value', children, className = '' }: CopyTextProps) {
  const { notify } = useToast()
  const [copied, setCopied] = useState(false)
  const text = value?.trim() ?? ''
  const copyable = text !== '' && !PLACEHOLDER.test(text)

  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      notify('success', 'Copied', `${label} copied to clipboard`)
    }).catch(() => notify('error', 'Error', 'Failed to copy to clipboard'))
  }

  return (
    <span className={`group/copy inline-flex min-w-0 max-w-full items-center gap-1 ${className}`}>
      <span className="min-w-0 truncate">{children ?? text}</span>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          title={`Copy ${label.toLowerCase()}`}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex-shrink-0 rounded p-0.5 text-blue-500 opacity-0 transition hover:bg-blue-50 hover:text-blue-700 focus:opacity-100 group-hover/copy:opacity-100"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}
