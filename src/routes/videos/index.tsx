'use client'

import { useState, useRef, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import MiniVideo from '#/components/MiniVideo.tsx'

export const Route = createFileRoute('/videos/')({
  validateSearch: (search: Record<string, unknown>) => {
    const rawPage = search.page
    const sort = search.sort
    const parsedPage = Number(rawPage)

    return {
      page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      sort: typeof sort === 'string' ? sort : 'newest',
    }
  },
  component: RouteComponent,
})

function MegaVideo({
  videoName = 'Unknown video',
  thumbnailUrl = '/video-thumbnail.png',
}: Readonly<{
  videoName?: string
  thumbnailUrl?: string
}>) {
  return (
    <div className="relative w-full max-w-[986px]  shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)] mb-2">
      <img
        alt={videoName}
        src={thumbnailUrl}
        className="block w-full h-full max-h-[530px] object-cover"
      />
      <div
        className={
          'absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-(--mini-video-bg) py-1 px-2 text-(--bss-text-secondary) min-w-0'
        }
      >
        <svg
          viewBox="0 0 100 100"
          width="2em"
          height="2em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M50 15 L85 85 L15 85 Z"
            fill="var(--mini-video-triangle)"
            transform="rotate(90 50 50)"
          />
        </svg>
        <span
          title={videoName}
          aria-label={videoName}
          className="flex-1 min-w-0 truncate text-3xl"
        >
          {videoName}
        </span>
        <span
          className={
            'bg-(--videos-tag) text-xs font-bold float-right p-2 rounded-4xl text-(--videos-tag-text)'
          }
        >
          Legfrissebb!
        </span>
      </div>
    </div>
  )
}

function RouteComponent() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const navigate = Route.useNavigate()
  const { page, sort } = Route.useSearch()
  const currentPage = page
  const totalPages = 29

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (e.target && menuRef.current.contains(e.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const options: Array<{ value: string; label: string }> = [
    { value: 'newest', label: 'Legujabb' },
    { value: 'popular', label: 'Legnepszerubb' },
    { value: 'viewed', label: 'Legtobbet megnezett' },
  ]

  function handleSelect(option: string) {
    setOpen(false)
    // Add your event logic here — e.g., fetch/sort/update state
    // For now we'll just log to the console
    console.log('Selected:', option)
    navigate({
      search: (prev) => ({
        ...prev,
        sort: option,
        page: 1, // Reset to first page on sort change
      }),
    })
  }

  function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage)
      return

    navigate({
      search: (prev) => ({
        ...prev,
        page: nextPage,
      }),
    })
  }

  function getPaginationItems(): Array<
    { type: 'page'; value: number } | { type: 'ellipsis'; id: string }
  > {
    if (currentPage <= 4) {
      return [
        { type: 'page', value: 1 },
        { type: 'page', value: 2 },
        { type: 'page', value: 3 },
        { type: 'page', value: 4 },
        { type: 'page', value: 5 },
        { type: 'ellipsis', id: 'end' },
        { type: 'page', value: totalPages },
      ]
    }

    if (currentPage >= totalPages - 3) {
      return [
        { type: 'page', value: 1 },
        { type: 'ellipsis', id: 'start' },
        { type: 'page', value: totalPages - 4 },
        { type: 'page', value: totalPages - 3 },
        { type: 'page', value: totalPages - 2 },
        { type: 'page', value: totalPages - 1 },
        { type: 'page', value: totalPages },
      ]
    }

    return [
      { type: 'page', value: 1 },
      { type: 'ellipsis', id: 'start' },
      { type: 'page', value: currentPage - 1 },
      { type: 'page', value: currentPage },
      { type: 'page', value: currentPage + 1 },
      { type: 'ellipsis', id: 'end' },
      { type: 'page', value: totalPages },
    ]
  }

  return (
    <main className={'mx-auto w-[90dvw] my-[5dvh]'}>
      <div
        className={'mx-auto flex justify-start items-center gap-4 mb-[5dvh]'}
      >
        <div
          className={
            'inline-flex items-center gap-2 bg-(--videos-search-bg) px-4 py-2 border-b-(--videos-search-border-b) w-[288px] max-w-full h-[40px] max-h-full border-b'
          }
        >
          <input
            placeholder="Keresés..."
            className="border-0 text-(--videos-search-placeholder) outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="var(--vidoes-search-icon)"
          >
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
          </svg>
        </div>

        <div className="" ref={menuRef}>
          <div className="relative inline-block text-left ">
            <button
              type="button"
              onClick={() => setOpen((s) => !s)}
              className="inline-flex w-[288px] max-w-full h-[40px] max-h-full justify-between items-center px-4 py-2 bg-(--videos-search-bg) shadow-sm hover:bg-(--videos-search-bg)"
            >
              <span className="text-sm text-(--vidoes-search-icon)">
                {'Rendezés: ' +
                  (sort
                    ? options.find((o) => o.value === sort)?.label
                    : 'Rendezés kiválasztása')}
              </span>
              <svg
                className="w-4 h-4 ml-2"
                viewBox="0 0 20 20"
                fill="var(--vidoes-search-icon)"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {open && (
              <div className="absolute  bg-(--videos-search-bg) shadow-lg z-2">
                <div className="py-1 max-w-[288px]">
                  {options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSelect(opt.value)}
                      className="w-[256px] max-w-full h-[40px] max-h-full text-left mx-4 py-2 text-sm hover:bg-(--videos-search-bg) text-(--vidoes-search-icon) border-b-1 border-b-(--videos-dropdown-hr) last:border-b-0"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={'grid grid-cols-1 md:grid-cols-5 gap-2'}>
        {currentPage === 1 && sort === 'newest' ? (
          <>
            <div className={'col-span-3 row-span-3'}>
              <MegaVideo />
            </div>
            {Array.from({ length: 21 }, (_, i) => (
              <MiniVideo key={i} />
            ))}
          </>
        ) : (
          <>
            {Array.from({ length: 30 }, (_, i) => (
              <MiniVideo key={i} />
            ))}
          </>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <nav
          aria-label="Video pagination"
          className="flex h-12 items-center  bg-(--bg) shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
        >
          <button
            type="button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex h-12 w-12 items-center justify-center text-(--bss-text) disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous page"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M12.5 4.5L7 10l5.5 5.5-1.4 1.4L4.2 10l6.9-6.9 1.4 1.4z" />
            </svg>
          </button>

          <div className="flex h-full items-stretch">
            {getPaginationItems().map((item) => {
              if (item.type === 'ellipsis') {
                return (
                  <span
                    key={item.id}
                    className="flex h-12 w-12 items-center justify-center text-(--bss-text-secondary)"
                  >
                    …
                  </span>
                )
              }

              const isActive = item.value === currentPage

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handlePageChange(item.value)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex h-12 w-12 items-center justify-center text-sm transition-colors ${
                    isActive
                      ? 'font-semibold after:absolute after:bottom-0 after:left-1/2 after:h-1 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-(--videos-video-title)'
                      : 'text-(--bss-text-secondary) hover:text-(--orange)'
                  }`}
                >
                  {item.value}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex h-12 w-12 items-center justify-center text-(--bss-text-secondary) disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next page"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M7.5 4.5L13 10l-5.5 5.5 1.4 1.4L15.8 10 8.9 3.1 7.5 4.5z" />
            </svg>
          </button>
        </nav>
      </div>
    </main>
  )
}
