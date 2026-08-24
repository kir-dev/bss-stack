import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { listTagsWithUsage } from '#/server/catalog/tags.ts'
import { fetchLeadershipAreaAccess } from '#/server/pages/admin/access-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextField,
} from '#/components/admin/form.tsx'
import {
  ConflictBanner,
  FormMessage,
  LoginRequiredBanner,
} from '#/components/admin/Alerts.tsx'
import { postJson } from '#/lib/admin-api.ts'

interface TagRow {
  id: string
  name: string
  videoCount: number
}

const loadTagCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDefaultDb()
  return listTagsWithUsage(db)
})

export const Route = createFileRoute('/admin/catalog/tags')({
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
      queryKey: ['admin-tag-catalog'],
      queryFn: loadTagCatalog,
    }),
  component: TagCatalogPage,
})

function TagCatalogPage() {
  const queryClient = useQueryClient()
  const catalogQuery = useQuery({
    queryKey: ['admin-tag-catalog'],
    queryFn: loadTagCatalog,
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-tag-catalog'] })
  }

  return (
    <main className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold text-(--bss-text)">
        Címkekatalógus
      </h1>
      <NewTagForm onCreated={refresh} />
      {catalogQuery.isPending && <LoadingState />}
      {catalogQuery.isError && (
        <ErrorState label="Hiba történt a címkék betöltése közben. Próbáld újra később." />
      )}
      {catalogQuery.isSuccess && (
        <>
          {catalogQuery.data.length === 0 ? (
            <p className="py-[4dvh] text-center text-(--bss-text-secondary)">
              Még nincs címke a katalógusban.
            </p>
          ) : (
            catalogQuery.data.map((tag) => (
              <TagRowEditor
                key={tag.id}
                tag={tag}
                onChanged={refresh}
                allTags={catalogQuery.data}
              />
            ))
          )}
        </>
      )}
    </main>
  )
}

function NewTagForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [similar, setSimilar] = useState<string[]>([])
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  async function checkSimilar(value: string) {
    if (value.trim() === '') {
      setSimilar([])
      return
    }
    const response = await fetch(
      `/api/admin/tags/similar?name=${encodeURIComponent(value)}`,
    )
    if (response.ok) {
      const payload = (await response.json()) as { similar?: string[] }
      setSimilar(payload.similar ?? [])
    }
  }

  async function submit() {
    setBusy(true)
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
    const result = await postJson('/api/admin/tags', { name })
    setBusy(false)
    if (result.ok) {
      setMessage(`„${name.trim()}" címke létrehozva.`)
      setName('')
      setSimilar([])
      onCreated()
      return
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setLoginUrl(result.error.loginUrl)
      return
    }
    setProblems(result.error.problems ?? [result.error.message])
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="mb-6 rounded border border-(--nav-border-b) p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <AdminTextField
          label="Új címke neve"
          maxLength={64}
          value={name}
          onChange={(value) => {
            setName(value)
            void checkSimilar(value)
          }}
          required
        />
        <AdminPrimaryButton onClick={() => void submit()} disabled={busy}>
          Létrehozás
        </AdminPrimaryButton>
      </div>
      {similar.length > 0 && (
        <p role="status" className="mt-2 text-xs text-(--orange)">
          Figyelem: ékezet nélkül hasonló címke már létezik:{' '}
          {similar.join(', ')}
        </p>
      )}
      {loginUrl !== null && (
        <div className="mt-2">
          <LoginRequiredBanner loginUrl={loginUrl} />
        </div>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-sm text-red-500">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
      {message !== null && <FormMessage>{message}</FormMessage>}
    </form>
  )
}

function TagRowEditor({
  tag,
  allTags,
  onChanged,
}: {
  tag: TagRow
  allTags: TagRow[]
  onChanged: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(tag.name)
  const [merging, setMerging] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [conflict, setConflict] = useState<string | null>(null)

  async function act(url: string, body: Record<string, unknown>) {
    setBusy(true)
    setProblems([])
    setConflict(null)
    const result = await postJson(url, body)
    setBusy(false)
    if (result.ok) {
      onChanged()
      setRenaming(false)
      setMerging(false)
      setDeleting(false)
      return true
    }
    if (result.error.code === 'conflict') {
      setConflict(result.error.message)
      return false
    }
    setProblems(result.error.problems ?? [result.error.message])
    return false
  }

  return (
    <div className="border-b border-(--nav-border-b)/50 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold">{tag.name}</span>
        <span className="text-xs text-(--bss-text-secondary)">
          {tag.videoCount} videón használva
        </span>
        <span className="flex-1" />
        <AdminSecondaryButton onClick={() => setRenaming((value) => !value)}>
          Átnevezés
        </AdminSecondaryButton>
        {allTags.length > 1 && (
          <AdminSecondaryButton onClick={() => setMerging((value) => !value)}>
            Összevonás
          </AdminSecondaryButton>
        )}
        <AdminSecondaryButton
          onClick={() => {
            setDeleting((value) => !value)
            setConfirmation('')
          }}
        >
          Törlés
        </AdminSecondaryButton>
      </div>

      {renaming && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <AdminTextField
            label="Új név"
            value={newName}
            onChange={setNewName}
            maxLength={64}
          />
          <AdminPrimaryButton
            disabled={busy || newName.trim() === ''}
            onClick={() =>
              void act(`/api/admin/tags/${tag.id}/rename`, { name: newName })
            }
          >
            Mentés
          </AdminPrimaryButton>
        </div>
      )}

      {merging && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Célcímke (minden kapcsolat átkerül)
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="h-10 bg-(--nav-search-bg) px-2"
            >
              <option value="">Válassz…</option>
              {allTags
                .filter((other) => other.id !== tag.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
            </select>
          </label>
          <AdminPrimaryButton
            disabled={busy || targetId === ''}
            onClick={() =>
              void act(`/api/admin/tags/${tag.id}/merge`, {
                targetTagId: targetId,
              })
            }
          >
            Összevonás
          </AdminPrimaryButton>
        </div>
      )}

      {deleting && (
        <div className="mt-2 flex flex-col gap-2">
          {tag.videoCount > 0 && (
            <p className="text-xs text-red-500">
              Ez a címke {tag.videoCount} videón szerepel; törléskor minden
              kapcsolat megszűnik. Írd be a nevét a megerősítéshez:{' '}
              <strong>{tag.name}</strong>
            </p>
          )}
          {tag.videoCount > 0 && (
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={tag.name}
              className="h-10 w-full max-w-md border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
            />
          )}
          <div>
            <AdminSecondaryButton
              disabled={
                busy || (tag.videoCount > 0 && confirmation !== tag.name)
              }
              confirm={`Biztosan törlöd „${tag.name}" címkét?`}
              onClick={() =>
                void act(`/api/admin/tags/${tag.id}/delete`, {
                  confirmation,
                })
              }
            >
              Végleges törlés
            </AdminSecondaryButton>
          </div>
        </div>
      )}

      {conflict !== null && (
        <ConflictBanner message={conflict} onReload={onChanged} />
      )}
      {problems.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-sm text-red-500">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
