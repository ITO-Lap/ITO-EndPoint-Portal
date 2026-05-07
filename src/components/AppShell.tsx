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
    <div className="min-h-full bg-slate-100 text-slate-900 overflow-x-hidden w-full">
      <div className="w-full min-h-full">
        <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,268px)_minmax(0,1fr)]">
          <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
          <div className="flex min-h-full flex-col w-full">
            <Header onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
            <main className="flex-1 bg-[#f6f8fb] px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-6 xl:py-6 overflow-x-hidden w-full">
              <div className="mx-auto w-full max-w-[1600px]">
                {children}
                <footer className="mt-6 text-center text-xs text-slate-500">© 2026 ITO Endpoint. All rights reserved.</footer>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
