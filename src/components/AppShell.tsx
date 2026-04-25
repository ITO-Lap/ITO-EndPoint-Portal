import type { ReactNode } from 'react'
import { useState } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 overflow-x-hidden w-full">
      <div className="w-full min-h-screen">
        <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[260px_1fr]">
          <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
          <div className="flex min-h-screen flex-col w-full">
            <Header onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
            <main className="flex-1 bg-[#f6f8fb] px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6 xl:px-8 xl:py-8 overflow-x-hidden w-full">
              {children}
              <footer className="mt-8 text-center text-sm text-slate-500">© 2026 Endpoint AI Copilot. All rights reserved.</footer>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
