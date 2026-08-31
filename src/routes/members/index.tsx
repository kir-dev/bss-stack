import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { getActiveMemberBlocks } from '#/server/pages/members.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

const loadActiveMembers = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDefaultDb()
    return getActiveMemberBlocks(db)
  },
)

export const Route = createFileRoute('/members/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['members-active'],
      queryFn: loadActiveMembers,
      staleTime: 60_000,
    }),
  component: MembersPage,
})

function MembersPage() {
  const blocksQuery = useQuery({
    queryKey: ['members-active'],
    queryFn: loadActiveMembers,
    staleTime: 60_000,
  })

  return (
    <main className="site-width my-[4dvh]">
      <h1 className="mb-6 text-center text-3xl font-bold text-(--bss-text)">
        Tagok
      </h1>

      {blocksQuery.isPending && (
        <p
          role="status"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Betöltés…
        </p>
      )}
      {blocksQuery.isError && (
        <p
          role="alert"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Hiba történt a tagok betöltése közben. Próbáld újra később.
        </p>
      )}
      {blocksQuery.isSuccess && (
        <>
          <MemberBlock
            title="Vezetőség"
            members={blocksQuery.data.leadership}
          />
          <MemberBlock
            title="Stúdiósok"
            members={blocksQuery.data.members}
          />
          <MemberBlock
            title="Stúdiósjelöltek"
            members={blocksQuery.data.member_candidates}
          />
          <MemberBlock
            title="Stúdiósjelölt-jelöltek"
            members={blocksQuery.data.member_candiate_candidates}
          />
          <MemberBlock
            title="Aktív öregtagok"
            members={blocksQuery.data.seniorActive}
          />

          <nav aria-label="Korábbi tagok" className="mt-10 flex gap-6">
            <Link
              to="/members/archived"
              search={() => ({ page: undefined })}
              className="font-bold text-(--orange) underline"
            >
              Dolgoztak még velünk
            </Link>
          </nav>
        </>
      )}
    </main>
  )
}

export function MemberBlock({
  title,
  members,
}: {
  title: string
  members: Array<{
    sub: string
    username: string
    fullName: string
    nickname: string | null
    avatarUrl: string | null
  }>
}) {
  if (members.length === 0) {
    return null
  }
  return (
    <section className="mt-8">
      <h2 className="text-center text-2xl font-bold text-(--bss-text)">
        {title}
      </h2>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {members.map((member) => (
          <Link
            key={member.sub}
            to="/members/$slug"
            params={{ slug: member.username }}
            className="hover-lift flex w-[178px] flex-col items-center border border-(--card-border) bg-(--members-card-bg) p-3 text-center shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
          >
            <img
              src={member.avatarUrl ?? '/default-avatar.png'}
              alt={member.fullName}
              className="h-[178px] w-[178px] overflow-hidden object-cover"
            />
            <p className="text-lg font-bold text-(--bss-text-secondary)">
              {member.fullName}
            </p>
            {member.nickname !== null && (
              <p className="text-(--bss-text-secondary)">„{member.nickname}”</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
