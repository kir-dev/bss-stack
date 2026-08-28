'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { matchesSearch } from '#/lib/text-search.ts'
import type { LucideIcon } from 'lucide-react'

export interface SearchSelectOption {
  value: string
  label: string
  /** Secondary info shown at the end of the row (e.g. event date). */
  meta?: string
  icon?: LucideIcon
}

/** Subtler label style for filter bars. */
export const FILTER_LABEL_CLASS = 'text-xs text-(--bss-text-secondary)'

/** The search bar in the dropdown appears above this many items. */
export const SEARCH_SELECT_THRESHOLD = 8

export function AdminSearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Válassz…',
  searchPlaceholder = 'Keresés…',
  emptyOptionLabel,
  hint,
  disabled = false,
  triggerClassName = '',
  labelClassName = 'font-bold text-(--bss-text)',
  searchThreshold = SEARCH_SELECT_THRESHOLD,
}: {
  label?: string
  /** Selected value; empty text = no selection. */
  value: string
  options: ReadonlyArray<SearchSelectOption>
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  /** When set, a separate row is added at the top of the list to choose the empty value. */
  emptyOptionLabel?: string
  hint?: ReactNode
  disabled?: boolean
  triggerClassName?: string
  /** In filter bars we use a subtler label style. */
  labelClassName?: string
  /** The search bar appears above this many items. */
  searchThreshold?: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const labelId = useId()
  const showSearch = options.length > searchThreshold

  const visible = useMemo(() => {
    const filtered = options.filter((option) =>
      matchesSearch(`${option.label} ${option.meta ?? ''}`, query),
    )
    return emptyOptionLabel !== undefined
      ? [{ value: '', label: emptyOptionLabel }, ...filtered]
      : filtered
  }, [options, query, emptyOptionLabel])

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? null

  const SelectedIcon: LucideIcon | null = options.find((option) => option.value === value)?.icon ?? null

  useEffect(() => {
    if (!open) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current !== null &&
        event.target instanceof Node &&
        containerRef.current.contains(event.target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Without a search bar, the panel gets focus so the arrow keys work.
  useEffect(() => {
    if (open && !showSearch) {
      panelRef.current?.focus()
    }
  }, [open, showSearch])

  function select(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Enter') {
      // Works inside filter forms too: Enter selects from the list instead of submitting the form.
      event.preventDefault()
      const option = visible.at(activeIndex)
      if (option !== undefined) {
        select(option.value)
      }
      return
    }
    if (visible.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % visible.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? visible.length - 1 : index - 1))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      {label !== undefined && (
        <span id={labelId} className={labelClassName}>
          {label}
        </span>
      )}
      <div ref={containerRef} className="relative">
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-labelledby={label !== undefined ? labelId : undefined}
          disabled={disabled}
          onClick={() => {
            setQuery('')
            setActiveIndex(0)
            setOpen((current) => !current)
          }}
          className={`flex h-10 w-full items-center justify-between gap-2 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 text-left outline-none hover:border-(--orange) active:scale-100 disabled:opacity-40 ${triggerClassName}`}
        >
          <span
            className={`min-w-0 truncate flex flex-row items-center gap-2 justify-start ${
              selectedLabel === null ? 'text-(--bss-text-secondary)' : ''
            }`}
          >
            {SelectedIcon && (
              <SelectedIcon size={16} strokeWidth={2} aria-hidden="true" />
            )}
            {selectedLabel ?? placeholder}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M12 15.5 5.5 9l1.4-1.4L12 12.7l5.1-5.1L18.5 9z" />
          </svg>
        </button>

        {open && (
          <div
            ref={panelRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="absolute top-full left-0 z-50 mt-1 max-h-72 w-full min-w-56 overflow-hidden border border-(--nav-border-b) bg-(--popover-bg) shadow-[0_8px_24px_rgba(0,0,0,0.28)] outline-none"
          >
            {showSearch && (
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-10 w-full border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none focus:border-(--orange)"
              />
            )}
            {visible.length === 0 ? (
              <p className="p-3 text-sm text-(--bss-text-secondary)">
                Nincs találat.
              </p>
            ) : (
              <ul
                id={listboxId}
                role="listbox"
                className="max-h-56 overflow-y-auto"
              >
                {visible.map((option, index) => (
                  <li key={`${option.value}-${index}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(option.value)}
                      className={`flex w-full items-center justify-start gap-2 px-3 py-2 text-left text-sm hover:text-(--orange) ${
                        index === activeIndex
                          ? 'bg-(--nav-search-bg) text-(--orange)'
                          : 'text-(--bss-text-secondary)'
                      } ${option.value === value ? 'font-bold' : ''}`}
                    >
                      {option.icon !== undefined && (
                        <option.icon
                          size={16}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 truncate">{option.label}</span>
                      {option.meta !== undefined && (
                        <span className="ml-2 shrink-0 text-xs opacity-70">
                          {option.meta}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {hint !== undefined && (
        <span className="text-xs text-(--bss-text-secondary)">{hint}</span>
      )}
    </div>
  )
}
