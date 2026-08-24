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

/* --- Betöltési helyőrzők ------------------------------------------------- */

/** Egy szövegsor helyőrzője; a magasságot a hívó adja meg. */
export function SkeletonLine({ className = '' }: { className?: string }) {
  return <span className={`skeleton block rounded ${className}`} />
}

/**
 * Videó- vagy eseménykártya helyőrzője: 16:9 borítókép plusz címsor. A méretei
 * megegyeznek a valódi kártyáéval, így a tartalom megjelenésekor nem ugrik a
 * tördelés.
 */
export function ThumbnailCardSkeleton({
  lines = 1,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`card-surface block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)] ${className}`}
    >
      <div className="thumb-frame skeleton" />
      <div className="flex flex-col gap-1 px-2 py-2">
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonLine
            key={index}
            className={index === 0 ? 'h-4 w-11/12' : 'h-3 w-2/3'}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Kártyarács helyőrzője. A `className`-ben a valódi rács oszlopbeállítását kell
 * átadni, hogy a helyőrzők ugyanannyi hasábban jelenjenek meg.
 */
export function ThumbnailGridSkeleton({
  count,
  className = '',
  lines = 1,
  label = 'Betöltés…',
}: {
  count: number
  className?: string
  lines?: number
  label?: string
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className={className}>
        {Array.from({ length: count }, (_, index) => (
          <ThumbnailCardSkeleton key={index} lines={lines} />
        ))}
      </div>
    </div>
  )
}
