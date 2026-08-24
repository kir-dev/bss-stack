import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getTrashPage } from '#/server/admin/trash-admin.ts'
import type { TrashPage } from '#/server/admin/trash-admin.ts'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import { AdminPrimaryButton } from '#/components/admin/form.tsx'
import { postJson } from '#/lib/admin-api.ts'
import { formatAdminDateTimeHu } from '#/lib/format-date.ts'

const loadTrashPage = createServerFn({ method: 'GET' })
  .validator(
    (input: Record<string, string | number | undefined> | undefined) =>
      input ?? {},
  )
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getTrashPage(db, {
      page: typeof data['page'] === 'number' ? data['page'] : 1,
      perPage: typeof data['perPage'] === 'number' ? data['perPage'] : 25,
    })
  })

export const Route = createFileRoute('/admin/trash')({
  validateSearch: (search: Record<string, unknown>) => ({
    page:
      typeof search['page'] === 'string' && search['page'] !== ''
        ? Number(search['page'])
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-trash', deps.page],
      queryFn: () => loadTrashPage({ data: { page: deps.page } }),
    }),
  component: TrashPageComponent,
})

function TrashPageComponent() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const page = Route.useSearch().page ?? 1
  const trashQuery = useQuery({
    queryKey: ['admin-trash', page],
    queryFn: () => loadTrashPage({ data: { page } }),
  })
  const viewerQuery = useQuery({
    queryKey: ['viewer'],
    queryFn: fetchViewerState,
    staleTime: 60_000,
  })
  const isLeadership = viewerQuery.data?.level === 'leadership'

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-trash', page] })
    void queryClient.invalidateQueries({ queryKey: ['viewer'] })
  }

  return (
    <main className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold text-(--bss-text)">Lomtár</h1>
      <p className="mb-4 text-sm text-(--bss-text-secondary)">
        A lomtárban lévő videók kapcsolatai megmaradnak; a napi feladat a
        legalább 30 napja lomtárban lévő rekordokat véglegesen törli (a külső
        médiafájlokat nem). A visszaállítás vezetőségi jog; a visszaállított
        videó archivált állapotba kerül.
      </p>

      {trashQuery.isPending && <LoadingState />}
      {trashQuery.isError && (
        <ErrorState label="Hiba történt a lomtár betöltése közben. Próbáld újra később." />
      )}

      {trashQuery.isSuccess &&
        (trashQuery.data.items.length === 0 ? (
          <div className="py-[6dvh] text-center text-(--bss-text-secondary)">
            A lomtár üres.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {trashQuery.data.expiredCount > 0 && (
              <p role="status" className="text-sm text-(--orange)">
                {trashQuery.data.expiredCount} videót a napi feladat már
                véglegesen töröl az elkövetkező futásakor.
              </p>
            )}
            {trashQuery.data.items.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                isLeadership={isLeadership}
                onChanged={refresh}
              />
            ))}
            <nav
              aria-label="Oldalazás"
              className="flex items-center gap-2 text-sm"
            >
              <button
                type="button"
                disabled={trashQuery.data.page <= 1}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      page:
                        trashQuery.data.page - 1 <= 1
                          ? undefined
                          : trashQuery.data.page - 1,
                    }),
                  })
                }
                className="rounded border border-(--nav-border-b) px-3 py-1 disabled:opacity-30"
              >
                ‹ Előző
              </button>
              <span className="text-(--bss-text-secondary)">
                {trashQuery.data.page}. /{' '}
                {Math.max(trashQuery.data.totalPages, 1)}. oldal ·{' '}
                {trashQuery.data.total} videó
              </span>
              <button
                type="button"
                disabled={trashQuery.data.page >= trashQuery.data.totalPages}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      page: trashQuery.data.page + 1,
                    }),
                  })
                }
                className="rounded border border-(--nav-border-b) px-3 py-1 disabled:opacity-30"
              >
                Következő ›
              </button>
            </nav>
          </div>
        ))}
    </main>
  )
}

function TrashRow({
  item,
  isLeadership,
  onChanged,
}: {
  item: TrashPageItem
  isLeadership: boolean
  onChanged: () => void
}) {
  return (
    <div className="rounded border border-(--nav-border-b) p-3">
      <div className="flex flex-wrap items-center gap-3">
        <img
          src={item.thumbnailUrl ?? '/video-thumbnail.png'}
          alt=""
          className="h-8 w-14 rounded object-cover"
        />
        <Link
          to="/admin/videos/$id"
          params={{ id: item.id }}
          className="font-bold hover:text-(--orange)"
        >
          {item.title}
        </Link>
        <span className="text-xs text-(--bss-text-secondary)">
          Lomtárba helyezte: {item.trashedByName ?? 'ismeretlen'} ·{' '}
          {formatAdminDateTimeHu(item.trashedAt)} · hátralévő idő kb.{' '}
          {item.remainingDays} nap
        </span>
        {isLeadership && (
          <>
            <span className="flex-1" />
            <RestoreButton
              videoId={item.id}
              version={item.version}
              onDone={onChanged}
            />
          </>
        )}
      </div>
    </div>
  )
}

type TrashPageItem = TrashPage['items'][number]

function RestoreButton({
  videoId,
  version,
  onDone,
}: {
  videoId: string
  version: number
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restore() {
    setBusy(true)
    setError(null)
    const result = await postJson(`/api/admin/videos/${videoId}/restore`, {
      version,
    })
    setBusy(false)
    if (result.ok) {
      onDone()
      return
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setError('A bejelentkezés lejárt; jelentkezz be újra, majd próbáld újra.')
      return
    }
    setError(result.error.message)
  }

  return (
    <span>
      <AdminPrimaryButton onClick={() => void restore()} disabled={busy}>
        Visszaállítás
      </AdminPrimaryButton>
      {error !== null && (
        <span role="alert" className="ml-2 text-xs text-red-500">
          {error}
        </span>
      )}
    </span>
  )
}
