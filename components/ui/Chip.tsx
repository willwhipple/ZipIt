import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}

export function Chip({ children, selected, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-[7px] rounded-[var(--zi-r-pill)]
        text-[13px] font-medium
        border min-h-[32px] cursor-pointer
        transition-colors duration-[var(--zi-dur-fast)]
        ${selected
          ? 'bg-[var(--zi-brand)] text-white border-[var(--zi-brand)]'
          : 'bg-white text-[var(--zi-text-muted)] border-[var(--zi-border-strong)]'
        }
      `.trim()}
    >
      {children}
    </button>
  );
}
