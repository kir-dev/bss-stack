import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { postJson } from '#/lib/admin-api.ts'
import { AdminPrimaryButton, AdminTextField } from '#/components/admin/form.tsx'
import {
  LoginRequiredBanner,
  ValidationProblems,
} from '#/components/admin/Alerts.tsx'

export const Route = createFileRoute('/admin/videos/new')({
  component: NewVideoPage,
})

function NewVideoPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setProblems([])
    setErrorMessage(null)
    setLoginUrl(null)
    // A piszkozathoz csak cím kell (spec 5.3); hibás média-URL is menthető.
    const result = await postJson<{ id: string }>('/api/admin/videos', {
      title,
    })
    setBusy(false)
    if (result.ok) {
      await navigate({
        to: '/admin/videos/$id',
        params: { id: result.data.id },
      })
      return
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setLoginUrl(result.error.loginUrl)
      return
    }
    if (result.error.problems !== undefined) {
      setProblems(result.error.problems)
      return
    }
    setErrorMessage(result.error.message)
  }

  return (
    <main className="max-w-prose">
      <h1 className="mb-4 text-2xl font-bold text-(--bss-text)">Új videó</h1>
      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-4"
      >
        <AdminTextField
          label="Cím"
          value={title}
          onChange={setTitle}
          required
          hint="A piszkozathoz csak a cím kötelező; a többi mezőt a szerkesztőben töltheted ki."
        />
        {problems.length > 0 && <ValidationProblems problems={problems} />}
        {errorMessage !== null && (
          <p role="alert" className="text-sm text-red-500">
            {errorMessage}
          </p>
        )}
        <div>
          <AdminPrimaryButton onClick={() => void submit()} disabled={busy}>
            {busy ? 'Mentés…' : 'Piszkozat létrehozása'}
          </AdminPrimaryButton>
        </div>
      </form>
    </main>
  )
}
