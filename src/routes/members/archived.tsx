import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { loadArchiveMembersServer } from '#/server/pages/member-archive-fn.ts'
import { EmptyState } from '#/components/PageStates.tsx'

export const Route = createFileRoute('/members/archived')({
  validateSearch: (search: Record<string, unknown>) => ({
    page:
      typeof search['page'] === 'string' && search['page'] !== ''
        ? Number(search['page'])
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['members-archive', 'archived', deps.page ?? 1],
      queryFn: () =>
        loadArchiveMembersServer({
          data: { kind: 'archived', page: deps.page },
        }),
    }),
  component: ArchivedMembersPage,
})

function ArchivedMembersPage() {
  const search = Route.useSearch()
  const listQuery = useQuery({
    queryKey: ['members-archive', 'archived', search.page ?? 1],
    queryFn: () =>
      loadArchiveMembersServer({
        data: { kind: 'archived', page: search.page },
      }),
  })

  return (
    <main className="site-width my-[4dvh]">
      {listQuery.isPending && (
        <p
          role="status"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Betöltés…
        </p>
      )}
      {listQuery.isError && (
        <p
          role="alert"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Hiba történt az adatok betöltése közben. Próbáld újra később.
        </p>
      )}
      {listQuery.isSuccess && (
        <>
          <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">
            {listQuery.data.title}
          </h1>
          {listQuery.data.items.length === 0 ? (
            <EmptyState
              title="Nincs megjeleníthető tag"
              description="Ezen a listán jelenleg nincs senki."
            />
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-4">
                {listQuery.data.items.map((member) => (
                  <Link
                    key={member.sub}
                    to="/members/$slug"
                    params={{ slug: member.username }}
                    className="flex w-[178px] flex-col items-center border border-(--card-border) bg-(--members-card-bg) p-3 text-center shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
                  >
                    <img
                      src={member.avatarUrl ?? '/test_member.png'}
                      alt={member.fullName}
                      className="h-[178px] w-[178px] overflow-hidden object-cover"
                    />
                    <p className="text-lg font-bold text-(--bss-text-secondary)">
                      {member.fullName}
                    </p>
                    {member.nickname !== null && (
                      <p className="text-(--bss-text-secondary)">
                        „{member.nickname}”
                      </p>
                    )}
                  </Link>
                ))}
              </div>
              {listQuery.data.totalPages > 1 && (
                <nav
                  aria-label="Tagok lapozása"
                  className="mt-8 flex justify-center gap-2"
                >
                  {Array.from(
                    { length: listQuery.data.totalPages },
                    (_, index) => index + 1,
                  ).map((value) => (
                    <Link
                      key={value}
                      to="/members/archived"
                      search={{ page: value === 1 ? undefined : value }}
                      aria-current={
                        value === listQuery.data.page ? 'page' : undefined
                      }
                      className={`h-10 w-10 text-center leading-10 ${
                        value === listQuery.data.page
                          ? 'font-bold text-(--orange)'
                          : 'text-(--bss-text-secondary)'
                      }`}
                    >
                      {value}
                    </Link>
                  ))}
                </nav>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}
