import React from 'react';

interface SmartCTAProps {
  children?: React.ReactNode;
  onClick?: () => void;
}

export function SmartCTA({ children = 'What am I missing?', onClick }: SmartCTAProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-[var(--zi-r-xl)] p-4 zi-grad-smart-quiet text-left cursor-pointer"
      style={{ border: '1px solid rgba(45,212,191,.35)' }}
    >
      <span className="text-[var(--zi-smart)] text-base flex-shrink-0" aria-hidden>✦</span>
      <span className="flex-1 text-[14px] font-medium tracking-[-0.1px] text-[var(--zi-smart-deep)]">
        {children}
      </span>
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        className="text-[var(--zi-smart)] opacity-70 flex-shrink-0"
        aria-hidden
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
