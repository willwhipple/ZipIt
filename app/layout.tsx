'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isInventory = pathname.startsWith('/inventory') || pathname.startsWith('/activities');

  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        {/* Mobile-width container centered on desktop */}
        <div className="max-w-[430px] mx-auto min-h-dvh relative flex flex-col bg-white">
          {/* Page content — pb-20 clears the fixed bottom nav */}
          <main className="flex-1 pb-20">
            {children}
          </main>

          {/* Bottom tab nav */}
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-200 flex">
            <Link
              href="/"
              className={`flex-1 flex flex-col items-center justify-center py-3 text-xs gap-1 ${
                isHome ? 'text-blue-500' : 'text-gray-400'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </Link>
            <Link
              href="/inventory"
              className={`flex-1 flex flex-col items-center justify-center py-3 text-xs gap-1 ${
                isInventory ? 'text-blue-500' : 'text-gray-400'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              My Stuff
            </Link>
          </nav>
        </div>
      </body>
    </html>
  );
}
