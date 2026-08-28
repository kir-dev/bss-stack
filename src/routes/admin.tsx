import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { ForbiddenContent } from '#/components/PageStates.tsx'
import { AdminSidebar } from '#/components/admin/AdminSidebar.tsx'
import { fetchAdminAreaAccess } from '#/server/pages/admin/access-fn.ts'

export const Route = createFileRoute('/admin')({
  loader: async () => {
    const access = await fetchAdminAreaAccess()
    if (access.kind === 'login') {
      throw redirect({ href: access.loginUrl })
    }
    return { access }
  },
  component: AdminLayout,
})

function AdminLayout() {
  const { access } = Route.useLoaderData()

  if (access.kind === 'forbidden' || access.viewer === undefined) {
    return <ForbiddenContent />
  }

  return (
    <div className="site-width my-[3dvh] flex flex-col gap-4 md:flex-row">
      <meta name="robots" content="noindex, nofollow" />
      <AdminSidebar level={access.viewer.level} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
