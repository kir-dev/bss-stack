'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '#/components/ThemeToggle.tsx'
import { Link } from '@tanstack/react-router'

export default function Navbar() {
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )

  useEffect(() => {
    const handleLocationChange = () => setPathname(window.location.pathname)

    // catch back/forward
    window.addEventListener('popstate', handleLocationChange)

    // also patch pushState to detect client-side navigations that don't trigger popstate
    const _pushState = history.pushState
    ;(history as any).pushState = function (...args: any[]) {
      _pushState.call(this, args[0], args[1], args[2])
      handleLocationChange()
    }

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      // restore
      ;(history as any).pushState = _pushState
    }
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-(--nav-bg) text-(--bss-text) shadow-[0_2px_2px_rgba(0,0,0,0.2)]">
      <nav
        className="mx-auto flex w-[90dvw] items-center gap-4"
        aria-label="Top navigation"
      >
        {/* center: main links */}
        <nav style={{ flex: 1 }} className={'py-[1dvh]'}>
          <div className="inline-flex items-center gap-6 *:font-bold">
            <Link className="nav-link" to="/">
              <img alt={'Bss logo'} />
            </Link>
            <Link
              className={`nav-link ${pathname.startsWith('/videos') ? 'text-(--orange)' : ''}`}
              to="/videos"
              search={{ page: 1, sort: 'newest' }}
            >
              Videók
            </Link>
            <Link
              to="/events"
              className={`nav-link ${pathname.startsWith('/events') ? 'text-(--orange)' : ''}`}
            >
              Események
            </Link>
            <Link
              to="/members"
              className={`nav-link ${pathname.startsWith('/members') ? 'text-(--orange)' : ''}`}
            >
              Tagok
            </Link>
            <Link
              to="/courses"
              className={`nav-link ${pathname.startsWith('/courses') ? 'text-(--orange)' : ''}`}
            >
              Tanfolyamok
            </Link>
            <Link
              to="/about"
              className={`nav-link ${pathname.startsWith('/about') ? 'text-(--orange)' : ''}`}
            >
              Mivel foglalkozunk?
            </Link>
          </div>
        </nav>

        {/* right: utilities */}
        <div className="ml-auto inline-flex items-center gap-4">
          <div>
            <ThemeToggle />
          </div>
          <div
            className={
              'inline-flex items-center gap-2 bg-(--nav-search-bg) py-[1dvh] px-[1dvw] border-b-(--nav-border-b) border-b'
            }
          >
            <input
              placeholder="Keresés..."
              className="border-0 text-(--nav-search-placeholder) outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="var(--nav-icon)"
            >
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
            </svg>
          </div>
        </div>
      </nav>
    </header>
  )
}
