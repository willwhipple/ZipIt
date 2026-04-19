'use client';

import React from 'react';

interface SegmentOption {
  id: string;
  label: string;
  count?: number;
}

interface FilterSegmentProps {
  options: SegmentOption[];
  value: string;
  onChange: (id: string) => void;
  full?: boolean;
}

export function FilterSegment({ options, value, onChange, full }: FilterSegmentProps) {
  return (
    <div
      className={full ? 'flex w-full' : 'inline-flex'}
      style={{
        gap: 2,
        padding: 3,
        background: 'var(--zi-border)',
        borderRadius: 'var(--zi-r-md)',
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex items-center justify-center gap-[5px] whitespace-nowrap cursor-pointer ${full ? 'flex-1' : ''}`}
            style={{
              padding: '7px 12px',
              fontSize: 13,
              fontWeight: 500,
              background: active ? 'var(--zi-surface)' : 'transparent',
              color: active ? 'var(--zi-brand)' : 'var(--zi-text-muted)',
              border: 'none',
              borderRadius: 'var(--zi-r-sm)',
              boxShadow: active ? 'var(--zi-elev-row)' : 'none',
              minHeight: 32,
              fontFamily: 'inherit',
              transition: `background var(--zi-dur-fast) var(--zi-ease), color var(--zi-dur-fast) var(--zi-ease)`,
            }}
          >
            {o.label}
            {o.count != null && (
              <span
                style={{
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'var(--zi-font-mono)',
                  color: active ? 'var(--zi-brand-hi)' : 'var(--zi-text-subtle)',
                }}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
