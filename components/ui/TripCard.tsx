import React from 'react';

interface TripCardProps {
  name: string;
  dates: string;
  destination?: string;
  packed: number;
  total: number;
  onClick: () => void;
}

export function TripCard({ name, dates, destination, packed, total, onClick }: TripCardProps) {
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left cursor-pointer"
      style={{
        background: 'var(--zi-surface)',
        borderRadius: 'var(--zi-r-xl)',
        padding: 16,
        border: '1px solid var(--zi-border)',
      }}
    >
      <div className="flex items-start justify-between mb-[10px]">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--zi-text)', letterSpacing: -0.3 }}>
            {name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--zi-text-muted)', marginTop: 2 }}>
            {dates}{destination ? ` · ${destination}` : ''}
          </div>
        </div>
        <div style={{ color: 'var(--zi-brand)', fontSize: 20 }}>›</div>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className="flex-1 overflow-hidden"
          style={{ height: 4, background: 'var(--zi-border)', borderRadius: 'var(--zi-r-pill)' }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(to right, var(--zi-brand-hi), var(--zi-brand))',
              transition: 'width .3s',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--zi-text-subtle)',
            fontFamily: 'var(--zi-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {packed} / {total}
        </div>
      </div>
    </button>
  );
}
