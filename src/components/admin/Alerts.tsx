import type { ReactNode } from 'react'

export function LoginRequiredBanner({ loginUrl }: { loginUrl: string }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded border border-(--orange) bg-(--nav-search-bg) p-3 text-sm"
    >
      <p className="font-bold">A bejelentkezésed lejárt.</p>
      <p className="mt-1 text-(--bss-text-secondary)">
        A kitöltött adatok nem vesznek el ezen az oldalon.{' '}
        <a
          href={loginUrl}
          className="font-bold text-(--orange) underline"
          target="_blank"
          rel="noreferrer"
        >
          Jelentkezz be újra
        </a>{' '}
        egy új fülön, majd próbáld meg itt újra menteni.
      </p>
    </div>
  )
}

export function ConflictBanner({
  message,
  onReload,
}: {
  message: string
  onReload: () => void
}) {
  return (
    <div
      role="alert"
      className="mb-4 rounded border border-(--orange) bg-(--nav-search-bg) p-3 text-sm"
    >
      <p className="font-bold">Ütközés: más módosította közben a rekordot.</p>
      <p className="mt-1 text-(--bss-text-secondary)">{message}</p>
      <button
        type="button"
        onClick={onReload}
        className="solid-btn mt-2 rounded bg-(--orange) px-3 py-1 font-bold text-white"
      >
        Legfrissebb állapot betöltése
      </button>
    </div>
  )
}

export function ValidationProblems({ problems }: { problems: string[] }) {
  return (
    <ul role="alert" className="list-inside list-disc text-sm text-red-500">
      {problems.map((problem, index) => (
        <li key={index}>{problem}</li>
      ))}
    </ul>
  )
}

export function FormMessage({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-sm text-(--bss-text-secondary)">
      {children}
    </p>
  )
}

/**
 * Non-blocking warning (e.g. disallowed media host): the draft can still be
 * saved with it, but it cannot be published.
 */
export function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return null
  }
  return (
    <div
      role="alert"
      className="rounded border border-(--orange) bg-(--nav-search-bg) p-3 text-sm"
    >
      <p className="font-bold text-(--orange)">Figyelem</p>
      <ul className="mt-1 list-inside list-disc text-(--bss-text-secondary)">
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}
