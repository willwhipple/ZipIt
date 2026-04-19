'use client';

import React from 'react';

interface ToggleProps {
  on: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  id?: string;
}

export function Toggle({ on, onChange, label, id }: ToggleProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-3 cursor-pointer"
    >
      {label && (
        <span className="text-sm text-[var(--zi-text)]">{label}</span>
      )}
      <div
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="relative flex-shrink-0 cursor-pointer"
        style={{
          width: 44,
          height: 26,
          borderRadius: 'var(--zi-r-pill)',
          background: on ? 'var(--zi-brand)' : 'var(--zi-border-strong)',
          transition: `background var(--zi-dur-base) var(--zi-ease)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: 20,
            height: 20,
            background: '#fff',
            borderRadius: 'var(--zi-r-pill)',
            transform: on ? 'translateX(18px)' : 'translateX(0)',
            transition: `transform var(--zi-dur-base) var(--zi-ease)`,
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        />
      </div>
    </label>
  );
}
