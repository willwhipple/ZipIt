import React from 'react';

interface InputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  id?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}

interface TextareaProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  rows?: number;
  id?: string;
}

export function Input({ label, value, onChange, placeholder, type = 'text', error, id, autoFocus, autoComplete }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-[var(--zi-text)] mb-[5px]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className={`
          w-full border rounded-[var(--zi-r-lg)]
          px-3 py-[11px] text-sm min-h-[44px]
          bg-white outline-none
          focus:ring-2 focus:ring-[var(--zi-brand)] focus:ring-offset-0
          transition-shadow duration-[var(--zi-dur-fast)]
          ${error ? 'border-[var(--zi-danger)]' : 'border-[var(--zi-border-strong)]'}
        `.trim()}
      />
      {error && (
        <p className="text-xs text-[var(--zi-danger)] mt-1">{error}</p>
      )}
    </div>
  );
}

export function Textarea({ label, value, onChange, placeholder, error, rows = 4, id }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-[var(--zi-text)] mb-[5px]"
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`
          w-full border rounded-[var(--zi-r-lg)]
          px-3 py-[11px] text-sm resize-none
          bg-white outline-none
          focus:ring-2 focus:ring-[var(--zi-brand)] focus:ring-offset-0
          transition-shadow duration-[var(--zi-dur-fast)]
          ${error ? 'border-[var(--zi-danger)]' : 'border-[var(--zi-border-strong)]'}
        `.trim()}
      />
      {error && (
        <p className="text-xs text-[var(--zi-danger)] mt-1">{error}</p>
      )}
    </div>
  );
}
