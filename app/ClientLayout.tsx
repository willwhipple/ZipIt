'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isInventory = pathname.startsWith('/inventory') || pathname.startsWith('/activities');

  return (
    <div className="max-w-[430px] mx-auto min-h-dvh relative flex flex-col bg-white">
      <main className="flex-1 pb-[88px]">
        {children}
      </main>

      {/* Bottom tab nav — iOS-style floating pill */}
      <nav
        className="fixed bottom-4 left-1/2 -translate-x-1/2 flex"
        style={{
          width: 'calc(100% - 130px)',
          maxWidth: 260,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px) saturate(150%)',
          WebkitBackdropFilter: 'blur(20px) saturate(150%)',
          border: '1px solid rgba(255,255,255,0.75)',
          borderRadius: 'var(--zi-r-pill)',
          boxShadow: '0 8px 32px -4px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06)',
          padding: '5px 6px',
        }}
      >
        <Link
          href="/"
          className="flex-1 flex flex-col items-center justify-center gap-0.5"
          style={{
            color: isHome ? 'var(--zi-brand)' : 'var(--zi-text-muted)',
            fontSize: 11,
            fontWeight: 500,
            minHeight: 52,
            borderRadius: 'var(--zi-r-pill)',
            background: isHome ? 'var(--zi-brand-tint)' : 'transparent',
            transition: `background var(--zi-dur-fast) var(--zi-ease), color var(--zi-dur-fast) var(--zi-ease)`,
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 11.5L12 4l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-8.5z" />
          </svg>
          Home
        </Link>
        <Link
          href="/inventory"
          className="flex-1 flex flex-col items-center justify-center gap-0.5"
          style={{
            color: isInventory ? 'var(--zi-brand)' : 'var(--zi-text-muted)',
            fontSize: 11,
            fontWeight: 500,
            minHeight: 52,
            borderRadius: 'var(--zi-r-pill)',
            background: isInventory ? 'var(--zi-brand-tint)' : 'transparent',
            transition: `background var(--zi-dur-fast) var(--zi-ease), color var(--zi-dur-fast) var(--zi-ease)`,
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          My stuff
        </Link>
      </nav>
    </div>
  );
}
