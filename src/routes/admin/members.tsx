import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getMemberDiagnostics } from '#/server/admin/member-diagnostics.ts'
import { fetchLeadershipAreaAccess } from '#/server/pages/admin/access-fn.ts'
import { getCachedOobConfig } from '#/server/config/load.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import { AdminPrimaryButton } from '#/components/admin/form.tsx'
import {
  FormMessage,
  LoginRequiredBanner,
  ValidationProblems,
} from '#/components/admin/Alerts.tsx'
import { ResponsiveTable } from '#/components/admin/ResponsiveTable.tsx'
import type { AdminColumn } from '#/components/admin/ResponsiveTable.tsx'
import type { DiagnosticsProfile } from '#/server/admin/member-diagnostics.ts'
import { postJson } from '#/lib/admin-api.ts'
import { MEMBERSHIP_STATUS_LABELS } from '#/lib/admin-labels.ts'
import { formatAdminDateTimeHu } from '#/lib/format-date.ts'

const loadMemberDiagnostics = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDefaultDb()
    return getMemberDiagnostics(db)
  },
)

/** The root of the Authentik admin UI, derived from the OOB issuer URL. */
const loadAuthentikBaseUrl = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string | null> => {
    try {
      const issuerUrl = getCachedOobConfig().authentik.issuerUrl
      const url = new URL(issuerUrl)
      return `${url.protocol}//${url.host}`
    } catch {
      return null
    }
  },
)

export const Route = createFileRoute('/admin/members')({
  beforeLoad: async () => {
    const access = await fetchLeadershipAreaAccess()
    if (access.kind === 'login') {
      throw redirect({ href: access.loginUrl })
    }
    if (access.kind === 'forbidden') {
      throw redirect({ to: '/admin/videos' })
    }
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ['admin-member-diagnostics'],
        queryFn: loadMemberDiagnostics,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['admin-authentik-base'],
        queryFn: loadAuthentikBaseUrl,
        staleTime: Number.POSITIVE_INFINITY,
      }),
    ]),
  component: MemberDiagnosticsPage,
})

function MemberDiagnosticsPage() {
  const queryClient = useQueryClient()
  const dataQuery = useQuery({
    queryKey: ['admin-member-diagnostics'],
    queryFn: loadMemberDiagnostics,
  })
  const authentikBase = useQuery({
    queryKey: ['admin-authentik-base'],
    queryFn: loadAuthentikBaseUrl,
    staleTime: Number.POSITIVE_INFINITY,
  })

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ['admin-member-diagnostics'],
    })
  }

  return (
    <main className="max-w-5xl">
      <h1 className="mb-4 text-2xl font-bold text-(--bss-text)">Tagok</h1>

      {dataQuery.isPending && <LoadingState />}
      {dataQuery.isError && (
        <ErrorState label="Hiba történt a tagadatok betöltése közben. Próbáld újra később." />
      )}

      {dataQuery.isSuccess &&
        (() => {
          const data = dataQuery.data
          const hasSyncProblem =
            data.summary.lastRunStatus === 'error' ||
            data.summary.errorProfiles > 0 ||
            data.runs.some((run) => run.status === 'error')
          return (
            <div className="flex flex-col gap-6">
              {hasSyncProblem && (
                <div
                  role="alert"
                  className="rounded border border-(--orange) bg-(--nav-search-bg) p-3 text-sm"
                >
                  <p className="font-bold">Tartós szinkronhiba</p>
                  <p className="mt-1 text-(--bss-text-secondary)">
                    {data.summary.lastRunMessage ??
                      `${data.summary.errorProfiles} profil szinkronhibás állapotban van.`}
                  </p>
                </div>
              )}

              <SyncSection onDone={refresh} />

              <section>
                <h2 className="mb-2 font-bold text-(--bss-text)">
                  Utolsó szinkronfutások
                </h2>
                {data.runs.length === 0 ? (
                  <p className="text-sm text-(--bss-text-secondary)">
                    Még nem futott szinkron.
                  </p>
                ) : (
                  <ul className="list-inside list-disc text-sm">
                    {data.runs.slice(0, 10).map((run) => (
                      <li key={run.id}>
                        <span className="font-bold">
                          {run.status === 'ok' ? 'Sikeres' : 'Hibás'}
                        </span>{' '}
                        ({run.trigger}) · {formatAdminDateTimeHu(run.startedAt)}{' '}
                        · {run.totalCount} profil, {run.changedCount} változás
                        {run.errorCount > 0 && `, ${run.errorCount} hiba`}
                        {run.message !== null && (
                          <span className="text-red-500"> — {run.message}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-2 font-bold text-(--bss-text)">
                  Profilok ({data.summary.total}) — csak olvashatóan
                </h2>
                <ResponsiveTable
                  columns={profileColumns}
                  rows={data.profiles}
                  emptyTitle="A tagcache üres."
                  emptyDescription="Indíts szinkront, hogy feltöltsön az Authentikből."
                />
              </section>

              {authentikBase.data !== null &&
                authentikBase.data !== undefined && (
                  <a
                    href={authentikBase.data}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold text-(--orange) underline"
                  >
                    Authentik admin megnyitása (új fülön)
                  </a>
                )}
            </div>
          )
        })()}
    </main>
  )
}

function SyncSection({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  async function sync() {
    setBusy(true)
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
    const result = await postJson<{
      result: {
        status: string
        totalCount: number
        changedCount: number
        errorCount: number
      }
    }>('/api/admin/members/sync', {})
    setBusy(false)
    if (result.ok) {
      const runResult = result.data.result
      setMessage(
        runResult.status === 'ok'
          ? `Szinkron kész: ${runResult.totalCount} profil, ${runResult.changedCount} változás.`
          : 'A szinkron hibával zárult; lásd a futások listáját.',
      )
      onDone()
      return
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setLoginUrl(result.error.loginUrl)
      return
    }
    setProblems([result.error.message])
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AdminPrimaryButton onClick={() => void sync()} disabled={busy}>
        {busy ? 'Szinkron fut…' : 'Kézi szinkron indítása'}
      </AdminPrimaryButton>
      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}
    </div>
  )
}

const profileColumns: Array<AdminColumn<DiagnosticsProfile>> = [
  {
    key: 'name',
    header: 'Név',
    primary: true,
    render: (row) => (
      <>
        {row.fullName}
        {row.nickname !== null && (
          <span className="text-(--bss-text-secondary)"> ({row.nickname})</span>
        )}
      </>
    ),
  },
  { key: 'username', header: 'Felhasználónév', render: (row) => row.username },
  {
    key: 'status',
    header: 'Tagsági státusz',
    render: (row) =>
      MEMBERSHIP_STATUS_LABELS[row.membershipStatus] ?? row.membershipStatus,
  },
  {
    key: 'leadership',
    header: 'Vezetőség',
    render: (row) => (row.isLeadership ? 'Igen' : '—'),
  },
  {
    key: 'sync',
    header: 'Szinkronállapot',
    render: (row) =>
      row.syncStatus === 'error' ? (
        <span className="text-red-500">
          Hiba{row.lastSyncError !== null ? `: ${row.lastSyncError}` : ''}
        </span>
      ) : (
        'Rendben'
      ),
  },
  {
    key: 'joined',
    header: 'Csatlakozási félév',
    render: (row) => row.joinedSemesterRaw ?? '—',
  },
  {
    key: 'lastSeen',
    header: 'Utoljára látva',
    render: (row) => formatAdminDateTimeHu(row.lastSeenAt),
  },
  {
    key: 'vanished',
    header: 'Eltűnt?',
    render: (row) => (row.likelyVanished ? 'Valószínűleg eltűnt' : '—'),
  },
]
