import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getAdminEventDetail } from '#/server/admin/event-list.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { allowedMediaHosts } from '#/server/media/allowed-hosts.ts'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextArea,
  AdminTextField,
} from '#/components/admin/form.tsx'
import {
  ConflictBanner,
  FormMessage,
  LoginRequiredBanner,
  ValidationProblems,
  WarningList,
} from '#/components/admin/Alerts.tsx'
import { postJson } from '#/lib/admin-api.ts'
import { eventStatusLabel } from '#/lib/admin-labels.ts'
import { mediaUrlWarning } from '#/lib/media-url.ts'
import type { AdminEventDetail } from '#/server/admin/event-list.ts'

const loadAdminEventEditor = createServerFn({ method: 'GET' })
  .validator((input: unknown) => input as { id: string })
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    const detail = await getAdminEventDetail(db, data.id)
    return { detail, mediaAllowedHosts: allowedMediaHosts() }
  })

export const Route = createFileRoute('/admin/events/$id')({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-event-editor', params.id],
      queryFn: () => loadAdminEventEditor({ data: { id: params.id } }),
    }),
  component: AdminEventEditorPage,
})

function AdminEventEditorPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const editorQuery = useQuery({
    queryKey: ['admin-event-editor', id],
    queryFn: () => loadAdminEventEditor({ data: { id } }),
  })
  const viewerQuery = useQuery({
    queryKey: ['viewer'],
    queryFn: fetchViewerState,
    staleTime: 60_000,
  })

  if (editorQuery.isPending) {
    return <LoadingState />
  }
  if (editorQuery.isError) {
    return (
      <ErrorState label="Hiba történt az esemény betöltése közben. Próbáld újra később." />
    )
  }
  const detail = editorQuery.data.detail
  if (detail === null) {
    throw notFound()
  }

  return (
    <EventEditor
      key={`${detail.id}-${detail.version}`}
      detail={detail}
      mediaAllowedHosts={editorQuery.data.mediaAllowedHosts}
      isLeadership={viewerQuery.data?.level === 'leadership'}
      onReload={() =>
        queryClient.invalidateQueries({ queryKey: ['admin-event-editor', id] })
      }
    />
  )
}

function EventEditor({
  detail,
  mediaAllowedHosts,
  isLeadership,
  onReload,
}: {
  detail: AdminEventDetail
  mediaAllowedHosts: string[]
  isLeadership: boolean
  onReload: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: detail.title,
    slug: detail.slug,
    description: detail.description ?? '',
    thumbnailUrl: detail.thumbnailUrl ?? '',
    startDate: detail.startDate ?? '',
    endDate: detail.endDate ?? '',
  })
  const [version, setVersion] = useState(detail.version)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteSummary, setDeleteSummary] = useState<string | null>(null)

  // Capture the initial state only at load time (the key re-mounts it).
  const [initialSnapshot] = useState(() => JSON.stringify(form))
  const isDirty = JSON.stringify(form) !== initialSnapshot

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // so we surface it here while editing.
  const thumbnailWarning = mediaUrlWarning(
    'Thumbnail URL',
    form.thumbnailUrl,
    mediaAllowedHosts,
  )

  function patch(partial: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  async function call(
    action: string,
    body: Record<string, unknown>,
    successMessage?: string,
  ): Promise<boolean> {
    setBusy(true)
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
    setConflictMessage(null)
    setDeleteSummary(null)
    const result = await postJson<{
      version?: number
      slug?: string
      detachedVideoCount?: number
    }>(`/api/admin/events/${detail.id}/${action}`, { version, ...body })
    setBusy(false)
    if (result.ok) {
      if (typeof result.data.version === 'number') {
        setVersion(result.data.version)
      }
      if (result.data.slug !== undefined && result.data.slug !== form.slug) {
        patch({ slug: result.data.slug })
      }
      if (
        typeof result.data.detachedVideoCount === 'number' &&
        action === 'delete_permanent'
      ) {
        setDeleteSummary(
          `Az esemény véglegesen törölve; ${result.data.detachedVideoCount} videó leválasztva.`,
        )
        await navigate({ to: '/admin/events' })
        return true
      }
      setMessage(successMessage ?? null)
      return true
    }
    const error = result.error
    if (error.code === 'auth_required' && error.loginUrl !== undefined) {
      setLoginUrl(error.loginUrl)
      return false
    }
    if (error.code === 'conflict') {
      setConflictMessage(error.message)
      return false
    }
    if (error.problems !== undefined) {
      setProblems(error.problems)
      return false
    }
    setProblems([error.message])
    return false
  }

  async function saveDraft(): Promise<boolean> {
    return call('update', form, 'Piszkozat elmentve.')
  }

  async function publish() {
    if (isDirty && !(await saveDraft())) return
    await call('publish', {}, 'Esemény publikálva.')
  }

  async function deletePermanently() {
    await call('delete_permanent', { confirmationTitle: deleteConfirmation })
  }

  return (
    <main className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-(--bss-text)">{detail.title}</h1>
        <span className="rounded bg-(--nav-search-bg) px-2 py-1 text-xs font-bold text-(--bss-text-secondary)">
          {eventStatusLabel(detail.status)} · v{version}
        </span>
        {/* Public page of a published event in a new tab, so editing isn't lost. */}
        {detail.status === 'published' ? (
          <Link
            to="/events/$slug"
            params={{ slug: detail.slug }}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-(--orange) underline"
          >
            Megnyitás az oldalon ↗
          </Link>
        ) : (
          <span className="text-xs text-(--bss-text-secondary)">
            A nyilvános oldal csak publikált állapotban érhető el.
          </span>
        )}
      </div>

      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      {conflictMessage !== null && (
        <ConflictBanner
          message={conflictMessage}
          onReload={() => void onReload()}
        />
      )}
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}

      <section className="flex flex-col gap-4 rounded border border-(--nav-border-b) p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <AdminTextField
            label="Cím"
            value={form.title}
            onChange={(value) => patch({ title: value })}
            required
            maxLength={200}
          />
          <AdminTextField
            label="Slug"
            value={form.slug}
            onChange={(value) => patch({ slug: value })}
            maxLength={200}
            hint="Módosításkor a régi slug átirányításként megmarad."
          />
          <AdminTextField
            label="Kezdődátum"
            type="date"
            value={form.startDate}
            onChange={(value) => patch({ startDate: value })}
          />
          <AdminTextField
            label="Befejezés dátuma"
            type="date"
            value={form.endDate}
            onChange={(value) => patch({ endDate: value })}
          />
        </div>
        <AdminTextField
          label="Thumbnail URL"
          value={form.thumbnailUrl}
          onChange={(value) => patch({ thumbnailUrl: value })}
          hint="Opcionális; hiányában a legfrissebb látható videó thumbnailje jelenik meg."
        />
        <WarningList
          warnings={thumbnailWarning === null ? [] : [thumbnailWarning]}
        />
        <AdminTextArea
          label="Leírás"
          value={form.description}
          onChange={(value) => patch({ description: value })}
          rows={5}
          maxLength={10_000}
        />
      </section>

      <section className="flex flex-wrap gap-2 rounded border border-(--nav-border-b) p-4">
        {detail.status !== 'published' && (
          <AdminPrimaryButton onClick={() => void publish()} disabled={busy}>
            Publikálás
          </AdminPrimaryButton>
        )}
        {(detail.status === 'published' || detail.status === 'draft') && (
          <AdminSecondaryButton
            onClick={() => void call('archive', {}, 'Esemény archiválva.')}
            disabled={busy}
          >
            Archiválás
          </AdminSecondaryButton>
        )}
      </section>

      {isLeadership && (
        <section className="flex flex-col gap-3 rounded border border-red-500 p-4">
          <h2 className="font-bold text-(--bss-text)">Végleges törlés</h2>
          <p className="text-sm text-(--bss-text-secondary)">
            A művelet azonnali és visszavonhatatlan. A hozzárendelt{' '}
            <strong>{detail.attachedVideoIds.length}</strong> videó
            leválasztásra kerül (a készülési dátumuk megmarad), a slug nem
            használható fel újra. A megerősítéshez írd be az esemény címét:{' '}
            <strong>{detail.title}</strong>
          </p>
          <input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={detail.title}
            className="h-10 w-full max-w-md border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none"
          />
          <div>
            <AdminSecondaryButton
              onClick={() => void deletePermanently()}
              disabled={busy || deleteConfirmation.trim() !== detail.title}
              confirm={`Biztosan VÉGLEGesen törlöd „${detail.title}" eseményt? ${detail.attachedVideoIds.length} videó válik le róla.`}
            >
              Végleges törlés
            </AdminSecondaryButton>
          </div>
          {deleteSummary !== null && <FormMessage>{deleteSummary}</FormMessage>}
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-(--nav-border-b) bg-(--bg) py-3">
        <AdminPrimaryButton
          onClick={() => void saveDraft()}
          disabled={busy || !isDirty}
        >
          Piszkozat mentése
        </AdminPrimaryButton>
        {!isDirty ? (
          <span className="text-xs text-(--bss-text-secondary)">
            Nincs mentetlen változás.
          </span>
        ) : (
          <span className="text-xs text-red-500">Mentetlen változások!</span>
        )}
      </div>
    </main>
  )
}
