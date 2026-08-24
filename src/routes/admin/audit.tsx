import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import {
  parsePaginationNumber,
  parseSearchPage,
} from '#/server/shared/pagination.ts'
import {
  getAuditFilterValues,
  getAuditPage,
  parseAuditFilters,
} from '#/server/admin/audit-admin.ts'
import type { AuditListItem } from '#/server/admin/audit-admin.ts'
import { fetchLeadershipAreaAccess } from '#/server/pages/admin/access-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import { ResponsiveTable } from '#/components/admin/ResponsiveTable.tsx'
import type { AdminColumn } from '#/components/admin/ResponsiveTable.tsx'
import { formatAdminDateTimeHu } from '#/lib/format-date.ts'

const loadAuditPage = createServerFn({ method: 'GET' })
  .validator(
    (input: Record<string, string | number | undefined> | undefined) =>
      input ?? {},
  )
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getAuditPage(db, {
      page: parsePaginationNumber(data['page'], 1),
      perPage: parsePaginationNumber(data['perPage'], 25),
      filters: parseAuditFilters(data),
    })
  })

const loadAuditFilterValues = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDefaultDb()
    return getAuditFilterValues(db)
  },
)

interface AuditSearch extends Record<string, string | number | undefined> {
  page?: number
}

export const Route = createFileRoute('/admin/audit')({
  validateSearch: (search: Record<string, unknown>): AuditSearch => ({
    actor: typeof search['actor'] === 'string' ? search['actor'] : undefined,
    action: typeof search['action'] === 'string' ? search['action'] : undefined,
    entityType:
      typeof search['entityType'] === 'string'
        ? search['entityType']
        : undefined,
    entityId:
      typeof search['entityId'] === 'string' ? search['entityId'] : undefined,
    from: typeof search['from'] === 'string' ? search['from'] : undefined,
    to: typeof search['to'] === 'string' ? search['to'] : undefined,
    page: parseSearchPage(search['page']),
  }),
  beforeLoad: async () => {
    const access = await fetchLeadershipAreaAccess()
    if (access.kind === 'login') {
      throw redirect({ href: access.loginUrl })
    }
    if (access.kind === 'forbidden') {
      throw redirect({ to: '/admin/videos' })
    }
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-audit', deps.search],
      queryFn: () => loadAuditPage({ data: deps.search }),
    }),
  component: AuditAdminPage,
})

function AuditAdminPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const queryClient = useQueryClient()
  const auditQuery = useQuery({
    queryKey: ['admin-audit', search],
    queryFn: () => loadAuditPage({ data: search }),
  })
  const valuesQuery = useQuery({
    queryKey: ['admin-audit-values'],
    queryFn: loadAuditFilterValues,
    staleTime: 60_000,
  })

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ['admin-audit-values'],
    })
  }
  void refresh

  return (
    <main className="max-w-5xl">
      <h1 className="mb-2 text-2xl font-bold text-(--bss-text)">Auditnapló</h1>
      <p className="mb-4 text-sm text-(--bss-text-secondary)">
        Minden adminmódosítás előtte-utána értékkel. A napló nem módosítható,
        nem törölhető és nem exportálható; megőrzése korlátlan.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
        }}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <input
          placeholder="Szereplő (sub vagy system)"
          defaultValue={search.actor ?? ''}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              applyPatch({ actor: event.currentTarget.value || undefined })
            }
          }}
          onBlur={(event) =>
            applyPatch({ actor: event.currentTarget.value || undefined })
          }
          className="h-10 w-56 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 text-sm"
        />
        <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
          Művelet
          <select
            value={search.action ?? ''}
            onChange={(event) =>
              applyPatch({ action: event.target.value || undefined })
            }
            className="h-10 bg-(--nav-search-bg) px-2 text-sm"
          >
            <option value="">Mind</option>
            {valuesQuery.data?.actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
          Entitástípus
          <select
            value={search.entityType ?? ''}
            onChange={(event) =>
              applyPatch({ entityType: event.target.value || undefined })
            }
            className="h-10 bg-(--nav-search-bg) px-2 text-sm"
          >
            <option value="">Mind</option>
            {valuesQuery.data?.entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType}
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder="Entitás azonosító"
          defaultValue={search.entityId ?? ''}
          onBlur={(event) =>
            applyPatch({ entityId: event.currentTarget.value || undefined })
          }
          className="h-10 w-56 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 text-sm"
        />
        <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
          Dátumtól
          <input
            type="date"
            value={search.from ?? ''}
            onChange={(event) =>
              applyPatch({ from: event.target.value || undefined })
            }
            className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
          Dátumig
          <input
            type="date"
            value={search.to ?? ''}
            onChange={(event) =>
              applyPatch({ to: event.target.value || undefined })
            }
            className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
          />
        </label>
      </form>

      {auditQuery.isPending && <LoadingState />}
      {auditQuery.isError && (
        <ErrorState label="Hiba történt a napló betöltése közben. Próbáld újra később." />
      )}
      {auditQuery.isSuccess &&
        (auditQuery.data.items.length === 0 ? (
          <div className="py-[6dvh] text-center text-(--bss-text-secondary)">
            Nincs a szűrőknek megfelelő bejegyzés.
          </div>
        ) : (
          <>
            <ResponsiveTable
              columns={auditColumns}
              rows={auditQuery.data.items}
              emptyTitle="Nincs bejegyzés."
            />
            <nav
              aria-label="Oldalazás"
              className="mt-4 flex items-center gap-2 text-sm"
            >
              <button
                type="button"
                disabled={auditQuery.data.page <= 1}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      page:
                        auditQuery.data.page - 1 <= 1
                          ? undefined
                          : auditQuery.data.page - 1,
                    }),
                  })
                }
                className="ctrl-btn rounded border border-(--nav-border-b) px-3 py-1"
              >
                ‹ Előző
              </button>
              <span className="text-(--bss-text-secondary)">
                {auditQuery.data.page}. /{' '}
                {Math.max(auditQuery.data.totalPages, 1)}. oldal ·{' '}
                {auditQuery.data.total} bejegyzés
              </span>
              <button
                type="button"
                disabled={auditQuery.data.page >= auditQuery.data.totalPages}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      page: auditQuery.data.page + 1,
                    }),
                  })
                }
                className="ctrl-btn rounded border border-(--nav-border-b) px-3 py-1"
              >
                Következő ›
              </button>
            </nav>
          </>
        ))}
    </main>
  )

  function applyPatch(patch: Partial<Record<string, string | undefined>>) {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: undefined }),
    })
  }
}

function JsonCell({ json }: { json: string | null }) {
  if (json === null) {
    return <>—</>
  }
  return (
    <details>
      <summary className="cursor-pointer">részletek</summary>
      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-(--nav-search-bg) p-2 text-xs">
        {json}
      </pre>
    </details>
  )
}

const auditColumns: Array<AdminColumn<AuditListItem>> = [
  {
    key: 'time',
    header: 'Időpont',
    primary: true,
    render: (row) => formatAdminDateTimeHu(row.occurredAt),
  },
  { key: 'actor', header: 'Szereplő', render: (row) => row.actor },
  { key: 'action', header: 'Művelet', render: (row) => row.action },
  {
    key: 'entity',
    header: 'Entitás',
    render: (row) => `${row.entityType} (${row.entityId.slice(0, 8)}…)`,
  },
  {
    key: 'before',
    header: 'Előtte',
    render: (row) => <JsonCell json={row.beforeJson} />,
  },
  {
    key: 'after',
    header: 'Utána',
    render: (row) => <JsonCell json={row.afterJson} />,
  },
]
