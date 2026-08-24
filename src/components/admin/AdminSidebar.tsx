import { Link, useMatchRoute } from '@tanstack/react-router'

export interface SidebarItem {
  to: string
  label: string
  leadershipOnly?: boolean
}

/** A specifikáció 12.1 fejezete szerinti sidebar-elemek sorrendben. */
export const ADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
  { to: '/admin/videos', label: 'Videók' },
  { to: '/admin/events', label: 'Események' },
  { to: '/admin/homepage', label: 'Live és kiemelés', leadershipOnly: true },
  { to: '/admin/catalog/tags', label: 'Címkekatalógus', leadershipOnly: true },
  {
    to: '/admin/catalog/staff-roles',
    label: 'Stábszerepek',
    leadershipOnly: true,
  },
  { to: '/admin/members', label: 'Tagok', leadershipOnly: true },
  { to: '/admin/trash', label: 'Lomtár' },
  { to: '/admin/audit', label: 'Auditnapló', leadershipOnly: true },
]

/**
 * Admin sidebar (BSS-027): a tag nem lát vezetőségi menüpontot — de a
 * vezetőségi oldalakat a szerver is külön tiltja közvetlen URL-en is.
 */
export function AdminSidebar({ level }: { level: string }) {
  const matchRoute = useMatchRoute()
  const items = ADMIN_SIDEBAR_ITEMS.filter(
    (item) => !item.leadershipOnly || level === 'leadership',
  )

  return (
    <nav
      aria-label="Admin navigáció"
      className="flex gap-1 overflow-x-auto border-(--nav-border-b) md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:px-3 md:py-4"
    >
      {items.map((item) => {
        const active = Boolean(matchRoute({ to: item.to, fuzzy: true }))
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded px-3 py-2 text-sm font-bold whitespace-nowrap ${
              active
                ? 'bg-(--orange) text-white'
                : 'ctrl-btn text-(--bss-text-secondary)'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
