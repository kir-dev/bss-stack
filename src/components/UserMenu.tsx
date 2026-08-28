'use client'

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import type { ViewerStateDto } from '#/server/pages/viewer-fn.ts'

const LEVEL_LABELS: Record<ViewerStateDto['level'], string> = {
  anonymous: 'Vendég',
  schonherz: 'Schönherz',
  member: 'Tag',
  leadership: 'Vezetőség',
}

/** Monogram in place of the profile picture: initials of at most two name parts. */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase('hu-HU'))
    .join('')
  return letters === '' ? '?' : letters
}

function Avatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  const [failed, setFailed] = useState(false)

  if (avatarUrl === null || failed) {
    return (
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--orange) text-xs font-bold text-white"
      >
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      // The button carries the accessible name; the image is decorative.
      alt=""
      src={avatarUrl}
      width={32}
      height={32}
      // Fall back to a monogram if the avatar is broken.
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-full object-cover"
    />
  )
}

export default function UserMenu({ viewer }: { viewer: ViewerStateDto }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()
  const name = viewer.displayName ?? viewer.username ?? 'Profil'

  // Close the menu on route change.
  useEffect(() => {
    setOpen(false)
  }, [location.href])

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
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const itemClass =
    'block w-full px-3 py-2 text-left text-sm font-bold text-(--bss-text-secondary) hover:bg-(--nav-search-bg) hover:text-(--orange)'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Profilmenü – ${name}`}
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-[color-mix(in_srgb,var(--orange)_16%,transparent)]"
      >
        <Avatar name={name} avatarUrl={viewer.avatarUrl} />
        <span className="hidden max-w-[14ch] truncate font-bold sm:inline">
          {name}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
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
          role="menu"
          aria-label="Profilmenü"
          className="absolute top-full right-0 z-50 mt-2 w-60 border border-(--nav-border-b) bg-(--popover-bg) shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
        >
          <div className="flex items-center gap-3 border-b border-(--nav-border-b) px-3 py-3">
            <Avatar name={name} avatarUrl={viewer.avatarUrl} />
            <div className="min-w-0">
              <p className="truncate font-bold text-(--bss-text)">{name}</p>
              <p className="truncate text-xs text-(--bss-text-secondary)">
                {viewer.username !== null && `${viewer.username} · `}
                {LEVEL_LABELS[viewer.level]}
              </p>
            </div>
          </div>

          {viewer.canAccessAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              Adminfelület
            </Link>
          )}

          <form method="post" action="/api/auth/logout">
            <button type="submit" role="menuitem" className={itemClass}>
              Kilépés
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
