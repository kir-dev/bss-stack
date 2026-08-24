import { createFileRoute, redirect } from '@tanstack/react-router'

/** After login the Videos list opens (spec 12.1); there is no separate dashboard. */
export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/videos' })
  },
})
