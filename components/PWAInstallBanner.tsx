'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'zipit_pwa_dismissed';

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isChromeIOS, setIsChromeIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Don't show if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if already dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const chromeIOS = ios && /CriOS/i.test(ua);
    setIsIOS(ios);
    setIsChromeIOS(chromeIOS);

    if (ios) {
      // On iOS we can always show the manual instructions (no beforeinstallprompt support)
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }

    // On Chrome/Android, wait for the browser's install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const timer = setTimeout(() => setShow(true), 1500);
      // Store timer cleanup via closure — not strictly needed but tidy
      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShow(false);
  }

  async function handleInstall() {
    if (isIOS) {
      setShowIOSHint(true);
      // Mark as shown — can't detect when user completes the iOS flow
      localStorage.setItem(DISMISSED_KEY, 'true');
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // Dismiss regardless of outcome — don't re-prompt after they've seen the native dialog
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="mx-4 mt-3 mb-1 rounded-2xl flex flex-col gap-2 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)',
        border: '1px solid #bae6fd',
        padding: '12px 14px',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Suitcase icon */}
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-xl"
          style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #60a5fa, #1d4ed8)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <rect x="3" y="8" width="18" height="12" rx="2"/>
            <line x1="3" y1="14" x2="21" y2="14"/>
            <line x1="9" y1="8" x2="9" y2="20"/>
            <line x1="15" y1="8" x2="15" y2="20"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--zi-text)', lineHeight: 1.3 }}>
            Add to your home screen
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-muted)', lineHeight: 1.4 }}>
            For a smoother packing experience
          </p>
        </div>

        <button
          onClick={dismiss}
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 24, height: 24, color: 'var(--zi-text-subtle)', background: 'rgba(0,0,0,0.06)' }}
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {showIOSHint ? (
        <p className="text-xs px-1" style={{ color: 'var(--zi-text-muted)' }}>
          {isChromeIOS ? (
            <>Tap the <strong>Share</strong> button <span style={{ fontSize: 13 }}>⎙</span> in Chrome, then choose <strong>Add to Home Screen</strong>.</>
          ) : (
            <>Tap the <strong>Share</strong> button <span style={{ fontSize: 13 }}>⎙</span> in Safari, then choose <strong>Add to Home Screen</strong>.</>
          )}
        </p>
      ) : (
        <button
          onClick={handleInstall}
          className="w-full text-sm font-semibold rounded-xl py-2"
          style={{
            background: 'var(--zi-brand)',
            color: '#fff',
          }}
        >
          Add to Home Screen
        </button>
      )}
    </div>
  );
}
