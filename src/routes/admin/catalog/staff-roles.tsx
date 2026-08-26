import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { listStaffRolesWithUsage } from '#/server/catalog/staff-roles.ts'
import { fetchLeadershipAreaAccess } from '#/server/pages/admin/access-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import {
  AdminSearchSelect,
  FILTER_LABEL_CLASS,
} from '#/components/admin/SearchSelect.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextField,
} from '#/components/admin/form.tsx'
import { FormMessage, LoginRequiredBanner } from '#/components/admin/Alerts.tsx'
import { postJson } from '#/lib/admin-api.ts'

interface RoleRow {
  id: string
  name: string
  displayOrder: number
  videoCount: number
}

const loadRoleCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDefaultDb()
  return listStaffRolesWithUsage(db)
})

export const Route = createFileRoute('/admin/catalog/staff-roles')({
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
      queryKey: ['admin-role-catalog'],
      queryFn: loadRoleCatalog,
    }),
  component: StaffRoleCatalogPage,
})

function StaffRoleCatalogPage() {
  const queryClient = useQueryClient()
  const catalogQuery = useQuery({
    queryKey: ['admin-role-catalog'],
    queryFn: loadRoleCatalog,
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-role-catalog'] })
  }

  return (
    <main className="w-full">
      <h1 className="mb-4 text-2xl font-bold text-(--bss-text)">
        Stábszerepek
      </h1>
      <NewRoleForm onCreated={refresh} />
      {catalogQuery.isPending && <LoadingState />}
      {catalogQuery.isError && (
        <ErrorState label="Hiba történt a stábszerepek betöltése közben. Próbáld újra később." />
      )}
      {catalogQuery.isSuccess && (
        <RoleList roles={catalogQuery.data} onChanged={refresh} />
      )}
    </main>
  )
}

function RoleList({
  roles,
  onChanged,
}: {
  roles: RoleRow[]
  onChanged: () => void
}) {
  const [order, setOrder] = useState<string[]>(() =>
    [...roles]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((role) => role.id),
  )
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderProblems, setOrderProblems] = useState<string[]>([])
  const [orderLoginUrl, setOrderLoginUrl] = useState<string | null>(null)

  if (roles.length === 0) {
    return (
      <p className="py-[4dvh] text-center text-(--bss-text-secondary)">
        Még nincs stábszerep a katalógusban.
      </p>
    )
  }

  const byId = new Map(roles.map((role) => [role.id, role]))
  const savedOrder = [...roles]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((role) => role.id)
  const ordered = order.filter((id) => byId.has(id))
  // New roles that are not yet in the order:
  for (const role of [...roles].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  )) {
    if (!ordered.includes(role.id)) ordered.push(role.id)
  }
  const orderChanged = JSON.stringify(savedOrder) !== JSON.stringify(ordered)

  function move(index: number, delta: number) {
    const next = [...ordered]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
  }

  async function saveOrder() {
    setSavingOrder(true)
    setOrderProblems([])
    setOrderLoginUrl(null)
    const result = await postJson('/api/admin/staff-roles/reorder', {
      orderedRoleIds: ordered,
    })
    setSavingOrder(false)
    if (!result.ok) {
      if (result.error.code === 'auth_required' && result.error.loginUrl) {
        setOrderLoginUrl(result.error.loginUrl)
        return
      }
      setOrderProblems(result.error.problems ?? [result.error.message])
      return
    }
    onChanged()
  }

  return (
    <>
      <ol className="list-none">
        {ordered.map((roleId, index) => (
          <RoleRowEditor
            key={roleId}
            role={byId.get(roleId)!}
            allRoles={roles}
            index={index}
            total={ordered.length}
            onMove={(delta) => move(index, delta)}
            onChanged={() => {
              setOrder(ordered)
              onChanged()
            }}
          />
        ))}
      </ol>
      <div className="mt-4 flex items-center gap-3">
        <AdminPrimaryButton
          onClick={() => void saveOrder()}
          disabled={!orderChanged || savingOrder}
        >
          {savingOrder ? 'Mentés…' : 'Sorrend mentése'}
        </AdminPrimaryButton>
        {orderChanged && (
          <span className="text-xs text-red-500">
            A megjelenítési sorrend módosult.
          </span>
        )}
      </div>
      {orderLoginUrl !== null && (
        <div className="mt-2">
          <LoginRequiredBanner loginUrl={orderLoginUrl} />
        </div>
      )}
      {orderProblems.length > 0 && (
        <ul
          role="alert"
          className="mt-2 list-inside list-disc text-sm text-red-500"
        >
          {orderProblems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function RoleRowEditor({
  role,
  allRoles,
  index,
  total,
  onMove,
  onChanged,
}: {
  role: RoleRow
  allRoles: RoleRow[]
  index: number
  total: number
  onMove: (delta: number) => void
  onChanged: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(role.name)
  const [merging, setMerging] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)

  async function act(url: string, body: Record<string, unknown>) {
    setBusy(true)
    setProblems([])
    setMessage(null)
    const result = await postJson(url, body)
    setBusy(false)
    if (result.ok) {
      setRenaming(false)
      setMerging(false)
      onChanged()
      return true
    }
    setProblems(result.error.problems ?? [result.error.message])
    return false
  }

  return (
    <li className="border-b border-(--nav-border-b)/50 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1 font-bold">
          <button
            type="button"
            aria-label="Feljebb"
            disabled={index === 0 || busy}
            onClick={() => onMove(-1)}
            className="px-1 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Lejjebb"
            disabled={index === total - 1 || busy}
            onClick={() => onMove(1)}
            className="px-1 disabled:opacity-30"
          >
            ↓
          </button>
          {index + 1}. {role.name}
        </span>
        <span className="text-xs text-(--bss-text-secondary)">
          {role.videoCount} videón használva
        </span>
        <span className="flex-1" />
        <AdminSecondaryButton onClick={() => setRenaming((value) => !value)}>
          Átnevezés
        </AdminSecondaryButton>
        {allRoles.length > 1 && (
          <AdminSecondaryButton onClick={() => setMerging((value) => !value)}>
            Összevonás
          </AdminSecondaryButton>
        )}
        <span
          className="group relative"
          tabIndex={role.videoCount > 0 ? 0 : undefined}
          aria-describedby={
            role.videoCount > 0 ? `delete-tooltip-${role.id}` : undefined
          }
        >
          <AdminSecondaryButton
            disabled={role.videoCount > 0}
            confirm={`Biztosan törlöd „${role.name}" stábszerepet?`}
            onClick={() =>
              void act(`/api/admin/staff-roles/${role.id}/delete`, {})
            }
          >
            Törlés
          </AdminSecondaryButton>
          {role.videoCount > 0 && (
            <span
              id={`delete-tooltip-${role.id}`}
              role="tooltip"
              className="pointer-events-none absolute right-0 bottom-full z-10 mb-2 w-max max-w-64 rounded bg-black/90 px-2 py-1 text-xs text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus:opacity-100"
            >
              Használatban van, csak összevonható.
            </span>
          )}
        </span>
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
              void act(`/api/admin/staff-roles/${role.id}/rename`, {
                name: newName,
              })
            }
          >
            Mentés
          </AdminPrimaryButton>
        </div>
      )}

      {merging && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
          <div className="w-full sm:w-72">
            <AdminSearchSelect
              label="Célszerep (minden stábkapcsolat átkerül)"
              value={targetId}
              onChange={setTargetId}
              options={allRoles
                .filter((other) => other.id !== role.id)
                .map((other) => ({ value: other.id, label: other.name }))}
              searchPlaceholder="Szerep keresése…"
              labelClassName={FILTER_LABEL_CLASS}
            />
          </div>
          <AdminPrimaryButton
            disabled={busy || targetId === ''}
            onClick={() =>
              void act(`/api/admin/staff-roles/${role.id}/merge`, {
                targetRoleId: targetId,
              })
            }
          >
            Összevonás
          </AdminPrimaryButton>
        </div>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-sm text-red-500">
          {problems.map((problem, i) => (
            <li key={i}>{problem}</li>
          ))}
        </ul>
      )}
      {message !== null && <FormMessage>{message}</FormMessage>}
    </li>
  )
}

function NewRoleForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setProblems([])
    setLoginUrl(null)
    const result = await postJson('/api/admin/staff-roles', { name })
    setBusy(false)
    if (result.ok) {
      setName('')
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
          label="Új stábszerep neve"
          value={name}
          onChange={setName}
          required
          maxLength={64}
        />
        <AdminPrimaryButton onClick={() => void submit()} disabled={busy}>
          Létrehozás
        </AdminPrimaryButton>
      </div>
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
    </form>
  )
}
