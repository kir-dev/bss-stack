'use client'

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

interface SearchResults {
  videos: Array<{ slug: string; title: string }>
  events: Array<{ slug: string; title: string }>
  members: Array<{ username: string; fullName: string }>
  tags: Array<{ name: string }>
}

const EMPTY_RESULTS: SearchResults = {
  videos: [],
  events: [],
  members: [],
  tags: [],
}

export default function SearchBox() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [activeIndex, setActiveIndex] = useState(-1)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current === null) return
      if (
        event.target instanceof Node &&
        boxRef.current.contains(event.target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS)
      setActiveIndex(-1)
      return
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=5`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : EMPTY_RESULTS))
        .then((data: SearchResults) => {
          setResults(data)
          setOpen(true)
        })
        .catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  type Hit =
    | { kind: 'video'; label: string; href: string }
    | { kind: 'event'; label: string; href: string }
    | { kind: 'member'; label: string; href: string }
    | { kind: 'tag'; label: string; href: string }

  const hits: Array<Hit> = [
    ...results.videos.map((video) => ({
      kind: 'video' as const,
      label: video.title,
      href: `/videos/${video.slug}`,
    })),
    ...results.events.map((event) => ({
      kind: 'event' as const,
      label: event.title,
      href: `/events/${event.slug}`,
    })),
    ...results.members.map((member) => ({
      kind: 'member' as const,
      label: `${member.fullName} (Tag)`,
      href: `/members/${member.username}`,
    })),
    ...results.tags.map((tag) => ({
      kind: 'tag' as const,
      label: `${tag.name} (Címke)`,
      href: `/videos?tags=${encodeURIComponent(tag.name)}`,
    })),
  ]

  function openHit(hit: Hit) {
    setOpen(false)
    if (hit.href.startsWith('/videos?')) {
      const tagName = decodeURIComponent(hit.href.replace('/videos?tags=', ''))
      void navigate({
        to: '/videos',
        search: { tags: [tagName] },
      })
      return
    }
    window.location.assign(hit.href)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!open || hits.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? hits.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      const hit = hits.at(activeIndex)
      if (hit === undefined) {
        return
      }
      event.preventDefault()
      openHit(hit)
    }
  }

  const kindLabels: Record<Hit['kind'], string> = {
    video: 'Videó',
    event: 'Esemény',
    member: 'Tag',
    tag: 'Címke',
  }

  return (
    <div ref={boxRef} className="relative" role="search">
      <div
        className={
          'inline-flex items-center gap-2 border-b border-b-(--nav-border-b) bg-(--nav-search-bg) px-[1dvw] py-[1dvh] transition-colors focus-within:border-b-(--orange)'
        }
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Keresés..."
          aria-label="Keresés"
          aria-expanded={open}
          role="combobox"
          aria-controls="global-search-results"
          className="w-40 border-0 text-(--nav-search-placeholder) outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 lg:w-56"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="var(--nav-icon)"
          aria-hidden="true"
        >
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
        </svg>
      </div>

      {open && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 top-full z-50 w-80 border border-(--nav-border-b) bg-(--bg) shadow-lg"
        >
          {hits.length === 0 ? (
            <p className="p-3 text-sm text-(--bss-text-secondary)">
              Nincs találat.
            </p>
          ) : (
            <ul>
              {hits.map((hit, index) => (
                <li key={`${hit.kind}-${hit.href}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => openHit(hit)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-(--nav-search-bg) hover:text-(--orange) ${
                      index === activeIndex
                        ? 'bg-(--nav-search-bg) text-(--orange)'
                        : 'text-(--bss-text-secondary)'
                    }`}
                  >
                    <span className="min-w-0 truncate">{hit.label}</span>
                    <span className="ml-2 shrink-0 text-xs opacity-70">
                      {kindLabels[hit.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void navigate({
                to: '/search',
                search: { q: query.trim(), tab: 'all' },
              })
            }}
            className="ctrl-btn w-full border-t border-t-(--nav-border-b) px-3 py-2 text-left text-sm font-bold text-(--orange)"
          >
            Teljes keresőoldal megnyitása
          </button>
        </div>
      )}
    </div>
  )
}
