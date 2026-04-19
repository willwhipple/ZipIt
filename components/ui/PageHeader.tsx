import React from 'react';

// ─── MetaChip ─────────────────────────────────────────────
interface MetaChipProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function MetaChip({ icon, children }: MetaChipProps) {
  return (
    <div
      className="flex items-center gap-[5px] whitespace-nowrap"
      style={{
        padding: '5px 10px',
        background: 'rgba(255,255,255,.12)',
        borderRadius: 'var(--zi-r-md)',
        fontSize: 12,
        color: 'rgba(255,255,255,.9)',
        fontWeight: 500,
      }}
    >
      {icon}
      {children}
    </div>
  );
}

// ─── HeaderIconBtn ────────────────────────────────────────
interface HeaderIconBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  label?: string;
  'aria-label'?: string;
}

export function HeaderIconBtn({ children, onClick, label, 'aria-label': ariaLabel }: HeaderIconBtnProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className="flex items-center justify-center gap-1.5 cursor-pointer"
      style={{
        minWidth: 40,
        height: 40,
        padding: label ? '0 12px 0 8px' : 0,
        border: 'none',
        background: 'rgba(255,255,255,.12)',
        color: '#fff',
        borderRadius: 'var(--zi-r-lg)',
        fontSize: 14,
        fontWeight: 500,
        fontFamily: 'inherit',
      }}
    >
      {children}
      {label && <span>{label}</span>}
    </button>
  );
}

// ─── PageHeader ───────────────────────────────────────────
interface PageHeaderProps {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  chips?: React.ReactNode;
  className?: string;
}

export function PageHeader({ leading, trailing, eyebrow, title, chips, className = '' }: PageHeaderProps) {
  const hasChipsOrEyebrow = eyebrow != null || chips != null;
  return (
    <div className={`zi-header header-noise px-4 pt-[10px] ${hasChipsOrEyebrow ? 'pb-[16px]' : 'pb-[10px]'} ${className}`}>
      {/* Single inline row: back button · title (flex-1, truncates) · trailing actions */}
      <div className="flex items-center min-h-[40px] gap-3">
        {leading != null && <div className="flex-shrink-0">{leading}</div>}
        {title != null && (
          <div
            className="flex-1 min-w-0 truncate"
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: -0.5,
              lineHeight: 1.1,
              color: '#fff',
            }}
          >
            {title}
          </div>
        )}
        {/* spacer keeps trailing pinned right when there's no title */}
        {title == null && <div className="flex-1" />}
        {trailing != null && (
          <div className="flex items-center gap-1.5 flex-shrink-0">{trailing}</div>
        )}
      </div>
      {eyebrow && (
        <div
          className="mt-2"
          style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.7)' }}
        >
          {eyebrow}
        </div>
      )}
      {chips && (
        <div className="flex flex-wrap gap-2 mt-[10px]">{chips}</div>
      )}
    </div>
  );
}
