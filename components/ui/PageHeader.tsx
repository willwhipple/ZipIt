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
  return (
    <div className={`zi-header header-noise px-4 pt-[10px] pb-[18px] ${className}`}>
      {(leading != null || trailing != null) && (
        <div className="flex items-center justify-between mb-[18px]">
          <div>{leading}</div>
          <div className="flex items-center gap-1.5">{trailing}</div>
        </div>
      )}
      {eyebrow && (
        <div
          className="mb-1"
          style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.7)' }}
        >
          {eyebrow}
        </div>
      )}
      {title && (
        <div
          className={chips ? 'mb-[14px]' : ''}
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: -1,
            lineHeight: 1.05,
            color: '#fff',
          }}
        >
          {title}
        </div>
      )}
      {chips && (
        <div className="flex flex-wrap gap-2">{chips}</div>
      )}
    </div>
  );
}
