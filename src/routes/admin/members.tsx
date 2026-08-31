import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getMemberDiagnostics } from '#/server/admin/member-diagnostics.ts'
import { fetchLeadershipAreaAccess } from '#/server/pages/admin/access-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextField,
} from '#/components/admin/form.tsx'
import {
  FormMessage,
  LoginRequiredBanner,
  ValidationProblems,
} from '#/components/admin/Alerts.tsx'
import { ResponsiveTable } from '#/components/admin/ResponsiveTable.tsx'
import type { AdminColumn } from '#/components/admin/ResponsiveTable.tsx'
import type {
  DiagnosticsDelivery,
  DiagnosticsProfile,
} from '#/server/admin/member-diagnostics.ts'
import type { WebhookClientRecord } from '#/server/webhooks/clients.ts'
import { MEMBER_WEBHOOK_PATH } from '#/lib/webhook.ts'
import { postJson } from '#/lib/admin-api.ts'
import { MEMBERSHIP_STATUS_LABELS } from '#/lib/admin-labels.ts'
import { formatAdminDateTimeHu } from '#/lib/format-date.ts'

const QUERY_KEY = ['admin-member-diagnostics']

const loadMemberDiagnostics = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDefaultDb()
    return getMemberDiagnostics(db)
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
    context.queryClient.ensureQueryData({
      queryKey: QUERY_KEY,
      queryFn: loadMemberDiagnostics,
    }),
  component: MemberAdminPage,
})

function MemberAdminPage() {
  const queryClient = useQueryClient()
  const dataQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: loadMemberDiagnostics,
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }

  return (
    <main className="w-full">
      <h1 className="mb-4 text-2xl font-bold text-(--bss-text)">Tagok</h1>

      {dataQuery.isPending && <LoadingState />}
      {dataQuery.isError && (
        <ErrorState label="Hiba történt a tagadatok betöltése közben. Próbáld újra később." />
      )}

      {dataQuery.isSuccess &&
        (() => {
          const data = dataQuery.data
          return (
            <div className="flex flex-col gap-8">
              {data.summary.recentRejections > 0 && (
                <div
                  role="alert"
                  className="rounded border border-(--orange) bg-(--nav-search-bg) p-3 text-sm"
                >
                  <p className="font-bold">Elutasított tagfrissítés</p>
                  <p className="mt-1 text-(--bss-text-secondary)">
                    Az utolsó {data.deliveries.length} beérkezés között{' '}
                    {data.summary.recentRejections} elutasított van.{' '}
                    {data.summary.lastDeliveryMessage ??
                      'Részletek a beérkezések listájában.'}
                  </p>
                </div>
              )}

              <EndpointSection />

              <ClientsSection clients={data.clients} onChanged={refresh} />

              <DeliveriesSection deliveries={data.deliveries} />

              <section>
                <h2 className="mb-2 font-bold text-(--bss-text)">
                  Profilok ({data.summary.active} aktív
                  {data.summary.archived > 0 &&
                    `, ${data.summary.archived} archivált`}
                  ) — csak olvashatóan
                </h2>
                <p className="mb-2 text-sm text-(--bss-text-secondary)">
                  A tagadatokat kizárólag a webhook írja; itt nem
                  szerkeszthetők.
                </p>
                <ResponsiveTable
                  columns={profileColumns}
                  rows={data.profiles}
                  emptyTitle="Még nincs egyetlen tag sem."
                  emptyDescription="Hozz létre egy webhook klienst, és küldd be az első tagnévsort."
                />
              </section>
            </div>
          )
        })()}
    </main>
  )
}

/** The push target, shown with a ready-to-paste example request. */
function EndpointSection() {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const url = `${origin}${MEMBER_WEBHOOK_PATH}`
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section>
      <h2 className="mb-2 font-bold text-(--bss-text)">Webhook végpont</h2>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded bg-(--nav-search-bg) px-2 py-1 text-sm break-all">
          POST {url}
        </code>
        <AdminSecondaryButton onClick={() => void copy()}>
          {copied ? 'Kimásolva' : 'URL másolása'}
        </AdminSecondaryButton>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-bold text-(--bss-text)">
          Példa kérés
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-(--nav-search-bg) p-3 text-xs">
          {`curl -X POST ${url || '/api/webhooks/members'} \\
  -H 'authorization: Bearer <kliens-id>.<titok>' \\
  -H 'content-type: application/json' \\
  -H 'x-bss-delivery-id: 2026-08-28T10:00:00Z-1' \\
  -d '{
    "operations": [
      { "op": "upsert", "member": {
          "sub": "42",
          "username": "jgipsz",
          "fullName": "Gipsz Jakab",
          "nickname": "Pitypang",
          "avatarUrl": null,
          "membershipStatus": "MEMBER",
          "isLeadership": false,
          "joinedSemester": "2021/2022/1"
      }},
      { "op": "archive", "sub": "57" }
    ]
  }'`}
        </pre>
        <p className="mt-2 text-(--bss-text-secondary)">
          A <code>sub</code> mező az Authentik OIDC <code>sub</code> értéke —
          ezen keresztül kapcsolódik a tag a bejelentkezéséhez és a
          stáblistákhoz. A <code>mode: &quot;replace&quot;</code> +{' '}
          <code>members</code> alakkal a teljes névsor cserélhető: ami kimarad,
          az archiválásra kerül. A <code>x-bss-delivery-id</code> fejléc
          opcionális; ha megadod, ugyanaz a kérés kétszer nem fut le. A{' '}
          <code>joinedSemester</code> alakja <code>ÉÉÉÉ/ÉÉÉÉ/N</code>, ahol{' '}
          <code>N</code> 1 (őszi) vagy 2 (tavaszi) félév.
        </p>
      </details>
    </section>
  )
}

function ClientsSection({
  clients,
  onChanged,
}: {
  clients: WebhookClientRecord[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [token, setToken] = useState<{ name: string; value: string } | null>(
    null,
  )

  function reset() {
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
  }

  async function call(
    url: string,
    body: unknown,
    onSuccess: (data: { token?: string; client?: WebhookClientRecord }) => void,
  ) {
    setBusy(true)
    reset()
    const result = await postJson<{
      token?: string
      client?: WebhookClientRecord
    }>(url, body)
    setBusy(false)
    if (result.ok) {
      onSuccess(result.data)
      onChanged()
      return
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setLoginUrl(result.error.loginUrl)
      return
    }
    setProblems(result.error.problems ?? [result.error.message])
  }

  return (
    <section>
      <h2 className="mb-2 font-bold text-(--bss-text)">Webhook kliensek</h2>

      {token !== null && (
        <div className="mb-3 rounded border border-(--orange) bg-(--nav-search-bg) p-3 text-sm">
          <p className="font-bold">
            {token.name} — a token csak most jelenik meg
          </p>
          <code className="mt-2 block overflow-x-auto rounded bg-(--bss-bg) p-2 text-xs break-all">
            {token.value}
          </code>
          <p className="mt-2 text-(--bss-text-secondary)">
            Mentsd el most: az alkalmazás csak a titok hash-ét tárolja, később
            nem lehet visszanézni, csak újat generálni.
          </p>
          <AdminSecondaryButton onClick={() => setToken(null)}>
            Elrejtés
          </AdminSecondaryButton>
        </div>
      )}

      <div className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64">
            <AdminTextField
              label="Új kliens neve"
              value={name}
              onChange={setName}
              maxLength={200}
            />
          </div>
          <AdminPrimaryButton
            disabled={busy || name.trim() === ''}
            onClick={() =>
              void call('/api/admin/webhook-clients', { name }, (data) => {
                if (data.token !== undefined && data.client !== undefined) {
                  setToken({ name: data.client.name, value: data.token })
                }
                setName('')
                setMessage('A kliens létrejött.')
              })
            }
          >
            {busy ? 'Mentés…' : 'Kliens létrehozása'}
          </AdminPrimaryButton>
        </div>
      </div>

      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}

      <ResponsiveTable
        columns={[
          { key: 'name', header: 'Név', primary: true, render: (c) => c.name },
          {
            key: 'id',
            header: 'Kliens-id',
            render: (c) => <code className="text-xs">{c.id}</code>,
          },
          {
            key: 'state',
            header: 'Állapot',
            render: (c) =>
              c.revokedAt === null ? (
                'Aktív'
              ) : (
                <span className="text-red-500">
                  Visszavonva ({formatAdminDateTimeHu(c.revokedAt)})
                </span>
              ),
          },
          {
            key: 'lastUsed',
            header: 'Utoljára használva',
            render: (c) =>
              c.lastUsedAt === null ? '—' : formatAdminDateTimeHu(c.lastUsedAt),
          },
          {
            key: 'actions',
            header: 'Műveletek',
            render: (c) => (
              <div className="flex flex-wrap gap-2">
                <AdminSecondaryButton
                  disabled={busy}
                  onClick={() =>
                    void call(
                      `/api/admin/webhook-clients/${c.id}/rotate`,
                      {},
                      (data) => {
                        if (data.token !== undefined) {
                          setToken({ name: c.name, value: data.token })
                        }
                        setMessage(`${c.name}: új titok generálva.`)
                      },
                    )
                  }
                >
                  Új titok
                </AdminSecondaryButton>
                {c.revokedAt === null && (
                  <AdminSecondaryButton
                    disabled={busy}
                    onClick={() =>
                      void call(
                        `/api/admin/webhook-clients/${c.id}/revoke`,
                        {},
                        () => setMessage(`${c.name}: visszavonva.`),
                      )
                    }
                  >
                    Visszavonás
                  </AdminSecondaryButton>
                )}
                <AdminSecondaryButton
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Biztosan törlöd a(z) "${c.name}" klienst? A beérkezési naplója is törlődik.`,
                      )
                    ) {
                      return
                    }
                    void call(
                      `/api/admin/webhook-clients/${c.id}/delete`,
                      {},
                      () => setMessage(`${c.name}: törölve.`),
                    )
                  }}
                >
                  Törlés
                </AdminSecondaryButton>
              </div>
            ),
          },
        ]}
        rows={clients}
        emptyTitle="Nincs webhook kliens."
        emptyDescription="Hozz létre egyet, hogy a tagnyilvántartás be tudja küldeni a frissítéseket."
      />
    </section>
  )
}

function DeliveriesSection({
  deliveries,
}: {
  deliveries: DiagnosticsDelivery[]
}) {
  return (
    <section>
      <h2 className="mb-2 font-bold text-(--bss-text)">Utolsó beérkezések</h2>
      <ResponsiveTable
        columns={deliveryColumns}
        rows={deliveries}
        emptyTitle="Még nem érkezett tagfrissítés."
      />
    </section>
  )
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  ok: 'Feldolgozva',
  rejected: 'Elutasítva',
  duplicate: 'Ismétlés',
}

const deliveryColumns: Array<AdminColumn<DiagnosticsDelivery>> = [
  {
    key: 'receivedAt',
    header: 'Időpont',
    primary: true,
    render: (row) => formatAdminDateTimeHu(row.receivedAt),
  },
  { key: 'client', header: 'Kliens', render: (row) => row.clientName },
  {
    key: 'mode',
    header: 'Mód',
    render: (row) => (row.mode === 'replace' ? 'Teljes csere' : 'Műveletek'),
  },
  {
    key: 'status',
    header: 'Állapot',
    render: (row) =>
      row.status === 'ok' ? (
        DELIVERY_STATUS_LABELS[row.status]
      ) : (
        <span className="text-red-500">
          {DELIVERY_STATUS_LABELS[row.status] ?? row.status}
        </span>
      ),
  },
  {
    key: 'counts',
    header: 'Eredmény',
    render: (row) =>
      row.status === 'ok'
        ? `${row.operationCount} művelet — ${row.createdCount} új, ${row.updatedCount} módosítás, ${row.archivedCount} archiválás, ${row.restoredCount} visszaállítás`
        : '—',
  },
  {
    key: 'message',
    header: 'Üzenet',
    render: (row) => row.message ?? '—',
  },
]

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
    key: 'joined',
    header: 'Csatlakozási félév',
    render: (row) => row.joinedSemester ?? '—',
  },
  {
    key: 'state',
    header: 'Állapot',
    render: (row) =>
      row.archivedAt === null ? (
        'Aktív'
      ) : (
        <span className="text-red-500">
          Archiválva ({formatAdminDateTimeHu(row.archivedAt)})
        </span>
      ),
  },
  {
    key: 'updatedAt',
    header: 'Utolsó frissítés',
    render: (row) => formatAdminDateTimeHu(row.updatedAt),
  },
]
