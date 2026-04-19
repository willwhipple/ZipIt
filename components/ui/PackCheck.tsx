'use client';

import React from 'react';

interface PackCheckProps {
  on: boolean;
  onClick: () => void;
}

export function PackCheck({ on, onClick }: PackCheckProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-checked={on}
      role="checkbox"
      className="flex-shrink-0 flex items-center justify-center cursor-pointer"
      style={{
        width: 20,
        height: 20,
        borderRadius: 'var(--zi-r-pill)',
        border: `1.5px solid ${on ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
        background: on ? 'var(--zi-brand)' : 'transparent',
        transition: `all var(--zi-dur-fast) var(--zi-ease)`,
        padding: 0,
      }}
    >
      {on && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
