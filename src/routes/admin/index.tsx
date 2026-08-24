import { createFileRoute, redirect } from '@tanstack/react-router'

/** Belépés után a Videók lista nyílik meg (spec 12.1); külön dashboard nincs. */
export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/videos' })
  },
})
