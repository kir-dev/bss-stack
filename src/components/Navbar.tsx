'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '#/components/ThemeToggle.tsx'
import SearchBox from '#/components/SearchBox.tsx'
import UserMenu from '#/components/UserMenu.tsx'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'

const NAV_LINKS = [
  { to: '/videos', label: 'Videók' },
  { to: '/events', label: 'Események' },
  { to: '/members', label: 'Tagok' },
  { to: '/courses', label: 'Tanfolyamok' },
  { to: '/about', label: 'Mivel foglalkozunk?' },
] as const

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const viewerQuery = useQuery({
    queryKey: ['viewer'],
    queryFn: fetchViewerState,
    staleTime: 60_000,
  })
  const viewer = viewerQuery.data

  // Close the mobile menu on route change.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.href])

  return (
    <header className="sticky top-0 z-50 bg-(--nav-bg) text-(--bss-text) shadow-[0_2px_2px_rgba(0,0,0,0.2)]">
      <nav
        className="site-width flex items-center gap-2 py-[1dvh] sm:gap-4"
        aria-label="Fő navigáció"
      >
        <Link
          to="/"
          className="shrink-0 transition-transform hover:scale-105 active:scale-95"
          aria-label="Főoldal"
        >
          <picture>
            <source
              media="(max-width: 639px)"
              srcSet="/bss-navbar-logo-mobile.svg"
            />
            <img
              src="/bss-navbar-logo.svg"
              alt="Budavári Schönherz Stúdió"
              width={123}
              height={37}
              className="h-8 w-auto sm:h-[37px]"
            />
          </picture>
        </Link>

        {/* desktop links */}
        <nav style={{ flex: 1 }} className="hidden lg:block">
          <div className="inline-flex items-center gap-6 *:font-bold">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.to}
                aria-current={
                  location.pathname.startsWith(item.to) ? 'page' : undefined
                }
                className={`nav-link ${location.pathname.startsWith(item.to) ? 'text-(--orange)' : ''}`}
                to={item.to}
                preload={item.to === '/courses' ? false : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* right: utilities */}
        <div className="ml-auto inline-flex items-center gap-2 sm:gap-4">
          <div>
            <ThemeToggle />
          </div>
          <div className="hidden sm:block">
            <SearchBox />
          </div>
          {viewer !== undefined && viewer.loggedIn ? (
            <UserMenu viewer={viewer} />
          ) : (
            <LoginButton />
          )}
          <button
            type="button"
            className="icon-btn p-1.5 lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Menü bezárása' : 'Menü megnyitása'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 9.2 12 4.3 7.1 5.7 5.7l4.9 4.9 6.3-6.3z" />
              ) : (
                <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      {menuOpen && (
        <nav className="border-t border-(--nav-border-b) bg-(--nav-bg) lg:hidden">
          <div className="site-width flex flex-col gap-1 py-3">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.to}
                aria-current={
                  location.pathname.startsWith(item.to) ? 'page' : undefined
                }
                className={`nav-link py-2 font-bold ${location.pathname.startsWith(item.to) ? 'text-(--orange)' : ''}`}
                to={item.to}
                preload={item.to === '/courses' ? false : undefined}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/search"
              search={{ q: '', tab: 'all' }}
              className="nav-link py-2 font-bold"
            >
              Keresés
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}

/** Logs in, returning to the current page; logout lives in the profile menu. */
function LoginButton() {
  const location = useLocation()
  const returnTo = `${location.pathname}${location.searchStr}`
  return (
    <a
      href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
      className="nav-link font-bold text-(--orange)"
    >
      Belépés
    </a>
  )
}
