import type { ReactNode } from 'react'

/**
 * Admin mentési hibaállapotok (BSS-028, spec 12.4):
 * - lejárt session: az űrlapadat a kliensen marad; új belépés után újraküldhető;
 * - elavult mentés (409): konfliktusüzenet + frissítési lehetőség,
 *   „utolsó mentés nyer" viselkedés nincs.
 */

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
        className="mt-2 rounded bg-(--orange) px-3 py-1 font-bold text-white"
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
