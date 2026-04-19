import React from 'react';

// ─── CategoryHeader ───────────────────────────────────────
interface CategoryHeaderProps {
  name: string;
  meta?: React.ReactNode;
}

export function CategoryHeader({ name, meta }: CategoryHeaderProps) {
  return (
    <div className="flex items-baseline justify-between px-5 pt-[14px] pb-[6px]">
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 'var(--zi-track-snug)',
          color: 'var(--zi-text)',
        }}
      >
        {name}
      </span>
      {meta != null && (
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--zi-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--zi-text-subtle)',
          }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

// ─── ListRow ──────────────────────────────────────────────
interface ListRowProps {
  leading?: React.ReactNode;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
}

export function ListRow({ leading, children, trailing, onClick }: ListRowProps) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-5 py-[10px] min-h-[40px] bg-white"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {leading}
      <div
        className="flex-1"
        style={{
          fontSize: 14,
          fontWeight: 450,
          color: 'var(--zi-text)',
          letterSpacing: 'var(--zi-track-body)',
        }}
      >
        {children}
      </div>
      {trailing}
    </div>
  );
}
