import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getAdminVideoDetail,
  getAdminVideoEditorOptions,
} from '#/server/admin/video-detail.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSelectField,
  AdminTextArea,
  AdminTextField,
} from '#/components/admin/form.tsx'
import {
  ConflictBanner,
  FormMessage,
  LoginRequiredBanner,
  ValidationProblems,
} from '#/components/admin/Alerts.tsx'
import { postJson } from '#/lib/admin-api.ts'
import { videoStatusLabel, visibilityLabel } from '#/lib/admin-labels.ts'
import { formatAdminDateTimeHu } from '#/lib/format-date.ts'
import type { AdminVideoDetail } from '#/server/admin/video-detail.ts'

const loadAdminVideoEditor = createServerFn({ method: 'GET' })
  .validator((input: unknown) => input as { id: string })
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    const detail = await getAdminVideoDetail(db, data.id)
    if (detail === null) {
      return null
    }
    const options = await getAdminVideoEditorOptions(db, data.id)
    return { detail, options }
  })

export const Route = createFileRoute('/admin/videos/$id')({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-video-editor', params.id],
      queryFn: () => loadAdminVideoEditor({ data: { id: params.id } }),
    }),
  component: AdminVideoEditorPage,
})

interface EditorForm {
  title: string
  slug: string
  description: string
  guests: string
  songs: string
  videoUrl: string
  thumbnailUrl: string
  visibility: string
  eventId: string
  recordedAt: string
  publishedAtLocal: string
}

function formFromDetail(detail: AdminVideoDetail): EditorForm {
  return {
    title: detail.title,
    slug: detail.slug,
    description: detail.description ?? '',
    guests: detail.guests ?? '',
    songs: detail.songs ?? '',
    videoUrl: detail.videoUrl ?? '',
    thumbnailUrl: detail.thumbnailUrl ?? '',
    visibility: detail.visibility,
    eventId: detail.eventId ?? '',
    recordedAt: detail.recordedAt ?? '',
    publishedAtLocal:
      detail.publishedAt !== null ? toDatetimeLocal(detail.publishedAt) : '',
  }
}

function toDatetimeLocal(date: Date): string {
  // Europe/Budapest szerinti helyi idő a datetime-local mezőhöz.
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return formatter.format(date).replace('T', 'T')
}

function AdminVideoEditorPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const editorQuery = useQuery({
    queryKey: ['admin-video-editor', id],
    queryFn: () => loadAdminVideoEditor({ data: { id } }),
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
      <ErrorState label="Hiba történt a videó betöltése közben. Próbáld újra később." />
    )
  }
  const payload = editorQuery.data
  if (payload === null) {
    throw notFound()
  }

  return (
    <VideoEditor
      key={`${payload.detail.id}-${payload.detail.version}`}
      detail={payload.detail}
      options={payload.options}
      isLeadership={viewerQuery.data?.level === 'leadership'}
      onReload={() =>
        queryClient.invalidateQueries({ queryKey: ['admin-video-editor', id] })
      }
    />
  )
}

function VideoEditor({
  detail,
  options,
  isLeadership,
  onReload,
}: {
  detail: AdminVideoDetail
  options: Awaited<ReturnType<typeof getAdminVideoEditorOptions>>
  isLeadership: boolean
  onReload: () => Promise<unknown>
}) {
  const [form, setForm] = useState<EditorForm>(() => formFromDetail(detail))
  const [version, setVersion] = useState(detail.version)
  const [tagIds, setTagIds] = useState<string[]>(detail.tagIds)
  const [staff, setStaff] = useState<
    Array<{ roleId: string; memberSub: string }>
  >(detail.staffAssignments)
  const [relatedIds, setRelatedIds] = useState<string[]>(detail.relatedVideoIds)

  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        form: formFromDetail(detail),
        tagIds: detail.tagIds,
        staff: detail.staffAssignments,
        relatedIds: detail.relatedVideoIds,
      }),
    [detail],
  )
  const currentSnapshot = JSON.stringify({
    form,
    tagIds,
    staff,
    relatedIds,
  })
  const isDirty = currentSnapshot !== initialSnapshot

  // Mentetlen változásokkal navigáció előtt megerősítés (spec 5.3).
  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  function patch(partial: Partial<EditorForm>) {
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
    const result = await postJson<{
      version?: number
      warnings?: string[]
      slug?: string
    }>(`/api/admin/videos/${detail.id}/${action}`, { version, ...body })
    setBusy(false)
    if (result.ok) {
      if (typeof result.data.version === 'number') {
        setVersion(result.data.version)
      }
      if (result.data.slug !== undefined && result.data.slug !== form.slug) {
        patch({ slug: result.data.slug })
      }
      if (
        Array.isArray(result.data.warnings) &&
        result.data.warnings.length > 0
      ) {
        setMessage(result.data.warnings.join(' '))
      } else if (successMessage !== undefined) {
        setMessage(successMessage)
      }
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
    return call(
      'update',
      {
        title: form.title,
        slug: form.slug,
        description: form.description,
        guests: form.guests,
        songs: form.songs,
        videoUrl: form.videoUrl,
        thumbnailUrl: form.thumbnailUrl,
        visibility: form.visibility,
        eventId: form.eventId === '' ? null : form.eventId,
        recordedAt: form.recordedAt === '' ? null : form.recordedAt,
        publishedAt:
          form.publishedAtLocal === ''
            ? null
            : new Date(`${form.publishedAtLocal}:00+02:00`).toISOString(),
      },
      'Piszkozat elmentve.',
    )
  }

  async function publish() {
    const saved = await saveCore()
    if (!saved) return
    await call('publish', {}, 'Videó publikálva.')
  }

  /** Publikálás előtt a mezők mentése, hogy az állapotváltás a friss adaton menjen. */
  async function saveCore(): Promise<boolean> {
    if (!isDirty) return true
    return saveDraft()
  }

  async function archiveAction() {
    await call('archive', {}, 'Videó archiválva.')
  }

  async function trashAction() {
    await call('trash', {}, 'Videó lomtárba helyezve.')
  }

  async function restoreAction() {
    await call('restore', {}, 'Videó visszaállítva archivált állapotba.')
  }

  async function saveTags() {
    await call('tags', { tagIds }, 'Címkék elmentve.')
  }

  async function saveStaff() {
    await call('staff', { assignments: staff }, 'Stáblista elmentve.')
  }

  async function saveRelated() {
    await call(
      'related',
      { relatedVideoIds: relatedIds },
      'Kapcsolódó videók elmentve.',
    )
  }

  const statusLabel = videoStatusLabel(detail.status)

  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-(--bss-text)">{detail.title}</h1>
        <span className="rounded bg-(--nav-search-bg) px-2 py-1 text-xs font-bold text-(--bss-text-secondary)">
          {statusLabel} · {visibilityLabel(detail.visibility)} · v{version}
        </span>
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
        <h2 className="font-bold text-(--bss-text)">Alapadatok</h2>
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
        </div>
        <AdminTextArea
          label="Leírás"
          value={form.description}
          onChange={(value) => patch({ description: value })}
          rows={5}
          maxLength={10_000}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <AdminTextArea
            label="Vendégek"
            value={form.guests}
            onChange={(value) => patch({ guests: value })}
            maxLength={5000}
            hint="Soronként egy név."
          />
          <AdminTextArea
            label="Felhasznált zenék"
            value={form.songs}
            onChange={(value) => patch({ songs: value })}
            maxLength={5000}
            hint="Soronként egy tétel: Előadó - Szám címe"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded border border-(--nav-border-b) p-4">
        <h2 className="font-bold text-(--bss-text)">Média</h2>
        <AdminTextField
          label="MP4 URL"
          value={form.videoUrl}
          onChange={(value) => patch({ videoUrl: value })}
          hint="Csak https://v.bsstudio.hu; publikáláskor hálózati ellenőrzés fut."
        />
        <AdminTextField
          label="Thumbnail URL"
          value={form.thumbnailUrl}
          onChange={(value) => patch({ thumbnailUrl: value })}
          hint="Hibás URL piszkozatban menthető, publikálni nem lehet vele."
        />
      </section>

      <section className="flex flex-col gap-4 rounded border border-(--nav-border-b) p-4">
        <h2 className="font-bold text-(--bss-text)">Besorolás</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <AdminSelectField
            label="Láthatóság"
            value={form.visibility}
            onChange={(value) => patch({ visibility: value })}
          >
            <option value="public">Nyilvános</option>
            <option value="schonherz">Schönherz</option>
            <option value="bss">BSS-tag</option>
          </AdminSelectField>
          <AdminSelectField
            label="Esemény"
            value={form.eventId}
            onChange={(value) => patch({ eventId: value })}
          >
            <option value="">Nincs esemény</option>
            {options.events.map((eventOption) => (
              <option key={eventOption.id} value={eventOption.id}>
                {eventOption.title}
              </option>
            ))}
          </AdminSelectField>
          <AdminTextField
            label="Készült dátuma"
            type="date"
            value={form.recordedAt}
            onChange={(value) => patch({ recordedAt: value })}
            hint="Egynapos eseménynél automatikusan kitöltődik, ha üres."
          />
          <AdminTextField
            label="Feltöltés időpontja"
            type="datetime-local"
            value={form.publishedAtLocal}
            onChange={(value) => patch({ publishedAtLocal: value })}
            hint="Üresen hagyva publikáláskor a mostani időpont kerül rá; csak múltbeli időpont adható meg."
          />
        </div>
      </section>

      <TagSection
        tags={options.tags}
        selected={tagIds}
        onChange={setTagIds}
        onSave={() => void saveTags()}
        busy={busy}
      />

      <StaffSection
        roles={options.staffRoles}
        members={options.members}
        assignments={staff}
        onChange={setStaff}
        onSave={() => void saveStaff()}
        busy={busy}
      />

      <RelatedSection
        candidates={options.candidateRelated}
        titlesById={
          new Map(options.candidateRelated.map((c) => [c.id, c.title]))
        }
        selectedIds={relatedIds}
        onChange={setRelatedIds}
        onSave={() => void saveRelated()}
        busy={busy}
      />

      <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
        <h2 className="font-bold text-(--bss-text)">Állapotműveletek</h2>
        <p className="text-xs text-(--bss-text-secondary)">
          Utolsó módosítás: {formatAdminDateTimeHu(detail.updatedAt)}
        </p>
        <div className="flex flex-wrap gap-2">
          {detail.status !== 'published' && (
            <AdminPrimaryButton onClick={() => void publish()} disabled={busy}>
              Publikálás
            </AdminPrimaryButton>
          )}
          {(detail.status === 'published' || detail.status === 'draft') && (
            <AdminSecondaryButton
              onClick={() => void archiveAction()}
              disabled={busy}
            >
              Archiválás
            </AdminSecondaryButton>
          )}
          {detail.status !== 'trash' && (
            <AdminSecondaryButton
              onClick={() => void trashAction()}
              disabled={busy}
              confirm={`Biztosan lomtárba helyezed „${detail.title}" videót? A lomtárból csak vezetőség tudja visszaállítani.`}
            >
              Lomtárba helyezés
            </AdminSecondaryButton>
          )}
          {detail.status === 'trash' && isLeadership && (
            <AdminPrimaryButton
              onClick={() => void restoreAction()}
              disabled={busy}
            >
              Visszaállítás archivált állapotba
            </AdminPrimaryButton>
          )}
        </div>
      </section>

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

function TagSection({
  tags,
  selected,
  onChange,
  onSave,
  busy,
}: {
  tags: Array<{ id: string; name: string }>
  selected: string[]
  onChange: (ids: string[]) => void
  onSave: () => void
  busy: boolean
}) {
  return (
    <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">Címkék</h2>
      {tags.length === 0 ? (
        <p className="text-sm text-(--bss-text-secondary)">
          Még nincs címke a katalógusban.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(tag.id)}
                onChange={() =>
                  onChange(
                    selected.includes(tag.id)
                      ? selected.filter((item) => item !== tag.id)
                      : [...selected, tag.id],
                  )
                }
              />
              {tag.name}
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-(--bss-text-secondary)">
        Csak meglévő címke rendelhető; új címkét a vezetőség készíthet a
        Címkekatalógusban.
      </p>
      <div>
        <AdminPrimaryButton onClick={onSave} disabled={busy}>
          Címkék mentése
        </AdminPrimaryButton>
      </div>
    </section>
  )
}

function StaffSection({
  roles,
  members,
  assignments,
  onChange,
  onSave,
  busy,
}: {
  roles: Array<{ id: string; name: string }>
  members: Array<{ sub: string; fullName: string }>
  assignments: Array<{ roleId: string; memberSub: string }>
  onChange: (assignments: Array<{ roleId: string; memberSub: string }>) => void
  onSave: () => void
  busy: boolean
}) {
  return (
    <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">Stáblista</h2>
      {assignments.length === 0 && (
        <p className="text-sm text-(--bss-text-secondary)">
          Még nincs stábtag hozzárendelve.
        </p>
      )}
      {assignments.map((assignment, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <AdminSelectField
            label="Szerep"
            value={assignment.roleId}
            onChange={(roleId) =>
              onChange(
                assignments.map((item, i) =>
                  i === index ? { ...item, roleId } : item,
                ),
              )
            }
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </AdminSelectField>
          <AdminSelectField
            label="Tag"
            value={assignment.memberSub}
            onChange={(memberSub) =>
              onChange(
                assignments.map((item, i) =>
                  i === index ? { ...item, memberSub } : item,
                ),
              )
            }
          >
            {members.map((member) => (
              <option key={member.sub} value={member.sub}>
                {member.fullName}
              </option>
            ))}
          </AdminSelectField>
          <AdminSecondaryButton
            onClick={() => onChange(assignments.filter((_, i) => i !== index))}
          >
            Eltávolítás
          </AdminSecondaryButton>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <AdminSecondaryButton
          disabled={roles.length === 0 || members.length === 0}
          onClick={() =>
            onChange([
              ...assignments,
              { roleId: roles[0]?.id ?? '', memberSub: members[0]?.sub ?? '' },
            ])
          }
        >
          + Stábtag hozzáadása
        </AdminSecondaryButton>
        <AdminPrimaryButton onClick={onSave} disabled={busy}>
          Stáblista mentése
        </AdminPrimaryButton>
      </div>
    </section>
  )
}

function RelatedSection({
  candidates,
  titlesById,
  selectedIds,
  onChange,
  onSave,
  busy,
}: {
  candidates: Array<{ id: string; title: string }>
  titlesById: Map<string, string>
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onSave: () => void
  busy: boolean
}) {
  const addRef = useRef<HTMLSelectElement>(null)
  const remaining = candidates.filter(
    (candidate) => !selectedIds.includes(candidate.id),
  )

  return (
    <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">Kapcsolódó videók</h2>
      <p className="text-xs text-(--bss-text-secondary)">
        Ha itt üresen hagyod, automatikus ajánlás jelenik meg (azonos esemény,
        majd közös címkék). Csak publikált videó választható, sorrendben.
      </p>
      {selectedIds.length === 0 ? (
        <p className="text-sm text-(--bss-text-secondary)">
          Nincs manuális lista.
        </p>
      ) : (
        <ol className="list-decimal list-inside text-sm">
          {selectedIds.map((relatedId, index) => (
            <li key={relatedId} className="flex items-center gap-2 py-0.5">
              <span>{titlesById.get(relatedId) ?? relatedId}</span>
              <button
                type="button"
                aria-label="Feljebb"
                disabled={index === 0}
                onClick={() => {
                  const next = [...selectedIds]
                  ;[next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ]
                  onChange(next)
                }}
                className="px-1 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Lejjebb"
                disabled={index === selectedIds.length - 1}
                onClick={() => {
                  const next = [...selectedIds]
                  ;[next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ]
                  onChange(next)
                }}
                className="px-1 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Eltávolítás"
                onClick={() =>
                  onChange(selectedIds.filter((id) => id !== relatedId))
                }
                className="px-1 text-red-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          ref={addRef}
          className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 text-sm"
          defaultValue=""
        >
          <option value="">Válassz videót…</option>
          {remaining.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
        <AdminSecondaryButton
          onClick={() => {
            const value = addRef.current?.value
            if (value !== undefined && value !== '') {
              onChange([...selectedIds, value])
              if (addRef.current) addRef.current.value = ''
            }
          }}
        >
          Hozzáadás
        </AdminSecondaryButton>
        <AdminPrimaryButton onClick={onSave} disabled={busy}>
          Kapcsolódók mentése
        </AdminPrimaryButton>
      </div>
    </section>
  )
}
