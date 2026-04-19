import React from 'react';

interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  full?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  style?: React.CSSProperties;
}

export function PrimaryBtn({ children, onClick, full, disabled, type = 'button', className = '', style }: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`
        inline-flex items-center justify-center gap-1.5
        bg-[var(--zi-brand)] text-white
        rounded-[var(--zi-r-xl)] shadow-zi-fab
        px-[18px] py-3 text-sm font-semibold tracking-[-0.1px]
        min-h-[44px] cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-opacity duration-[var(--zi-dur-fast)]
        ${full ? 'w-full' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </button>
  );
}

export function SecondaryBtn({ children, onClick, full, disabled, type = 'button', className = '', style }: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`
        inline-flex items-center justify-center gap-1.5
        bg-white text-[var(--zi-text)]
        border border-[var(--zi-border-strong)]
        rounded-[var(--zi-r-lg)]
        px-4 py-[10px] text-sm font-medium
        min-h-[40px] cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${full ? 'w-full' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </button>
  );
}

export function DangerBtn({ children, onClick, full, disabled, type = 'button', className = '', style }: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`
        inline-flex items-center justify-center gap-1.5
        bg-[var(--zi-danger)] text-white
        rounded-[var(--zi-r-lg)]
        px-4 py-[10px] text-sm font-semibold
        min-h-[40px] cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${full ? 'w-full' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </button>
  );
}
