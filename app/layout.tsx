'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boldonse } from 'next/font/google';

const boldonse = Boldonse({
  subsets: ['latin'],
  variable: '--font-boldonse',
  display: 'swap',
  weight: '400',
  adjustFontFallback: false,
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isInventory = pathname.startsWith('/inventory') || pathname.startsWith('/activities');

  return (
    <html lang="en" className={boldonse.variable}>
      <body className="bg-gray-50 text-gray-900">
        {/* Mobile-width container centered on desktop */}
        <div className="max-w-[430px] mx-auto min-h-dvh relative flex flex-col bg-white">
          {/* Page content — pb-20 clears the fixed bottom nav */}
          <main className="flex-1 pb-20">
            {children}
          </main>

          {/* Bottom tab nav */}
          <nav
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex backdrop-blur-xl"
            style={{
              background: 'rgba(255,255,255,.88)',
              borderTop: '1px solid var(--zi-border)',
              padding: '4px 8px',
            }}
          >
            <Link
              href="/"
              className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px]"
              style={{ color: isHome ? 'var(--zi-brand)' : 'var(--zi-text-muted)', fontSize: 11, fontWeight: 500 }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 11.5L12 4l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-8.5z" />
              </svg>
              Home
            </Link>
            <Link
              href="/inventory"
              className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px]"
              style={{ color: isInventory ? 'var(--zi-brand)' : 'var(--zi-text-muted)', fontSize: 11, fontWeight: 500 }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              My stuff
            </Link>
          </nav>
        </div>
      </body>
    </html>
  );
}
