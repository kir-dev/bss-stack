import type { ReactNode } from 'react'

/** Közös admin űrlapmezők (BSS-028). */

export function AdminTextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  /** Megadva esetén a mező korlátos, és karakterhátralék-jelzést kap (spec 18). */
  maxLength?: number
  hint?: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold text-(--bss-text)">
        {label}
        {maxLength !== undefined && (
          <span className="ml-2 text-xs font-normal text-(--bss-text-secondary)">
            ({maxLength - value.length} karakter hátra)
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none focus:border-(--orange)"
      />
      {hint !== undefined && (
        <span className="text-xs text-(--bss-text-secondary)">{hint}</span>
      )}
    </label>
  )
}

export function AdminTextArea({
  label,
  value,
  onChange,
  rows = 4,
  maxLength,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  maxLength?: number
  hint?: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold text-(--bss-text)">
        {label}
        {maxLength !== undefined && (
          <span className="ml-2 text-xs font-normal text-(--bss-text-secondary)">
            ({maxLength - value.length} karakter hátra)
          </span>
        )}
      </span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="border-b border-(--nav-border-b) bg-(--nav-search-bg) p-2 outline-none focus:border-(--orange)"
      />
      {hint !== undefined && (
        <span className="text-xs text-(--bss-text-secondary)">{hint}</span>
      )}
    </label>
  )
}

export function AdminPrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="solid-btn rounded bg-(--orange) px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function AdminSecondaryButton({
  children,
  onClick,
  disabled = false,
  confirm,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Megadva esetén normál megerősítést kér (spec 13.1). */
  confirm?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (confirm === undefined || window.confirm(confirm)) {
          onClick()
        }
      }}
      className="ctrl-btn rounded border border-(--nav-border-b) px-4 py-2 text-sm font-bold text-(--bss-text) hover:border-(--orange) disabled:opacity-40"
    >
      {children}
    </button>
  )
}
