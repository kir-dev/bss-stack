import { Link } from '@tanstack/react-router'

/**
 * Közös magyar oldalállapotok (BSS-019): eltérő betöltési, üres és hibaállapot
 * minden listára és nézetre (spec 18).
 */

export function LoadingState({ label = 'Betöltés…' }: { label?: string }) {
  return (
    <div className="flex justify-center py-[6dvh] text-(--bss-text-secondary)">
      <p role="status">{label}</p>
    </div>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="mx-auto max-w-prose py-[8dvh] text-center">
      <p className="text-xl font-bold text-(--bss-text)">{title}</p>
      {description !== undefined && (
        <p className="mt-3 text-(--bss-text-secondary)">{description}</p>
      )}
    </div>
  )
}

export function ErrorState({
  label = 'Hiba történt az adatok betöltése közben. Próbáld újra később.',
}: {
  label?: string
}) {
  return (
    <div className="mx-auto max-w-prose py-[8dvh] text-center">
      <p className="text-xl font-bold text-(--orange)">Hoppá!</p>
      <p className="mt-3 text-(--bss-text-secondary)" role="alert">
        {label}
      </p>
    </div>
  )
}

export function NotFoundContent() {
  return (
    <main className="mx-auto w-[90dvw] max-w-prose py-[10dvh] text-center">
      <h1 className="text-5xl font-bold text-(--bss-text)">404</h1>
      <p className="mt-4 text-xl font-bold text-(--bss-text)">
        Az oldal nem található
      </p>
      <p className="mt-3 text-(--bss-text-secondary)">
        A keresett tartalom nem létezik, még nem jelent meg, vagy már nem
        elérhető.
      </p>
      <Link to="/" className="mt-6 inline-block font-bold text-(--orange)">
        Vissza a főoldalra
      </Link>
    </main>
  )
}

export function ForbiddenContent() {
  return (
    <main className="mx-auto w-[90dvw] max-w-prose py-[10dvh] text-center">
      <h1 className="text-5xl font-bold text-(--bss-text)">403</h1>
      <p className="mt-4 text-xl font-bold text-(--bss-text)">
        Hozzáférés megtagadva
      </p>
      <p className="mt-3 text-(--bss-text-secondary)">
        Ehhez az oldalhoz nincs jogosultságod.
      </p>
      <Link to="/" className="mt-6 inline-block font-bold text-(--orange)">
        Vissza a főoldalra
      </Link>
    </main>
  )
}
