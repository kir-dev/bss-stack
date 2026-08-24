import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import {
  createTag,
  deleteTag,
  findAccentSimilarTagNames,
  listTagsWithUsage,
  mergeTag,
  renameTag,
  CatalogNameConflictError,
  ConfirmationMismatchError,
  TagNotFoundError,
} from '#/server/catalog/tags.ts'
import {
  createStaffRole,
  deleteStaffRole,
  listStaffRolesWithUsage,
  mergeStaffRole,
  renameStaffRole,
  reorderStaffRoles,
  StaffRoleInUseError,
} from '#/server/catalog/staff-roles.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import {
  events,
  memberCache,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
} from '#/db/schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const databases: Array<{ drop: () => Promise<void> }> = []
const poolCleanups: Array<() => Promise<void>> = []

afterAll(async () => {
  while (poolCleanups.length > 0) {
    await poolCleanups.pop()!()
  }
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const leaderViewer: Viewer = {
  level: 'leadership',
  sub: 'leader-sub',
  username: 'vezetoseg',
}
const memberViewer: Viewer = {
  level: 'member',
  sub: 'member-sub',
  username: 'tag',
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_catalog')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  await migrated.db.insert(memberCache).values([
    {
      sub: 'leader-sub',
      username: 'vezetoseg',
      fullName: 'Vezetőségi Tag',
      membershipStatus: 'studio_member',
    },
    {
      sub: 'member-sub',
      username: 'tag',
      fullName: 'BSS Tag',
      membershipStatus: 'studio_member',
    },
  ])
  return migrated.db
}

async function seedVideoWithEvent(
  db: NodePgDatabase<Record<string, never>>,
  slug: string,
): Promise<typeof videos.$inferSelect> {
  const eventRows = await db
    .insert(events)
    .values({
      slug: `${slug}-esemeny`,
      title: `${slug} esemény`,
      startDate: '2026-05-01',
    })
    .returning()
  const eventId = eventRows.at(0)?.id
  if (eventId === undefined) throw new Error('event seed failed')
  const videoRows = await db
    .insert(videos)
    .values({ slug, title: slug, eventId })
    .returning()
  const video = videoRows.at(0)
  if (video === undefined) throw new Error('video seed failed')
  return video
}

describe.skipIf(!hasTestDatabase)('BSS-012: címkék', () => {
  it('létrehozás normalizál: kisbetű és whitespace nem hoz létre duplikátumot', async () => {
    const db = await setupDb()
    await createTag(db, { viewer: leaderViewer }, 'Koncert')
    await expect(
      createTag(db, { viewer: leaderViewer }, '  koncert  '),
    ).rejects.toBeInstanceOf(CatalogNameConflictError)

    const allTags = await db.select().from(tags)
    expect(allTags).toHaveLength(1)
    expect(allTags.at(0)?.name).toBe('Koncert')
    expect(allTags.at(0)?.normalizedName).toBe('koncert')
  })

  it('tag nem kezelheti a katalógust — csak hozzárendelni tud meglévő címkét', async () => {
    const db = await setupDb()
    await expect(
      createTag(db, { viewer: memberViewer }, 'új címke'),
    ).rejects.toBeInstanceOf(ForbiddenError)
    const existing = await createTag(db, { viewer: leaderViewer }, 'stúdió')
    // hozzárendelés (meglévő címke videóhoz) tagjog — ezt BSS-014 építi erre az alaptermre
    const video = await seedVideoWithEvent(db, 'hozzarendeles-video')
    await db.insert(videoTags).values({ videoId: video.id, tagId: existing.id })
    const links = await db.select().from(videoTags)
    expect(links).toHaveLength(1)
  })

  it('névtelen néző minden katalógusművelettől el van tiltva', async () => {
    const db = await setupDb()
    const anonymous = anonymousViewer()
    await expect(
      createTag(db, { viewer: anonymous }, 'címke'),
    ).rejects.toBeInstanceOf(ForbiddenError)
    const created = await createTag(db, { viewer: leaderViewer }, 'címke')
    await expect(
      renameTag(db, { viewer: anonymous }, created.id, 'más'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('átnevezés működik, ütközéssel', async () => {
    const db = await setupDb()
    const first = await createTag(db, { viewer: leaderViewer }, 'első címke')
    const second = await createTag(
      db,
      { viewer: leaderViewer },
      'második címke',
    )

    const renamed = await renameTag(
      db,
      { viewer: leaderViewer },
      second.id,
      'Második  Címke!',
    )
    expect(renamed.name).toBe('Második Címke!')

    await expect(
      renameTag(db, { viewer: leaderViewer }, second.id, 'Első Címke'),
    ).rejects.toBeInstanceOf(CatalogNameConflictError)
    void first
  })

  it('ékezeti hasonlóság csak figyelmeztetés, nem blokkol', async () => {
    const db = await setupDb()
    await createTag(db, { viewer: leaderViewer }, 'Folytatás')
    const warnings = await findAccentSimilarTagNames(
      db,
      'folytataz'.replace('z', 's'),
    )
    expect(warnings).toContain('Folytatás')

    const created = await createTag(db, { viewer: leaderViewer }, 'Folytatas')
    expect(created.name).toBe('Folytatas')
    expect(await findAccentSimilarTagNames(db, 'nem-letezik-ilyen')).toEqual([])
  })

  it('összevonás: minden kapcsolat a célcímkére kerül, duplikátum nélkül', async () => {
    const db = await setupDb()
    const source = await createTag(db, { viewer: leaderViewer }, 'forrás')
    const target = await createTag(db, { viewer: leaderViewer }, 'cél')
    const videoA = await seedVideoWithEvent(db, 'merge-a')
    const videoB = await seedVideoWithEvent(db, 'merge-b')
    await db.insert(videoTags).values([
      { videoId: videoA.id, tagId: source.id },
      { videoId: videoB.id, tagId: source.id },
      { videoId: videoB.id, tagId: target.id },
    ])

    await mergeTag(db, { viewer: leaderViewer }, source.id, target.id)

    const remaining = await listTagsWithUsage(db)
    expect(remaining.map((t) => t.name)).toEqual(['cél'])
    expect(remaining.at(0)?.videoCount).toBe(2)
    const targetLinks = await db
      .select()
      .from(videoTags)
      .where(eq(videoTags.tagId, target.id))
    expect(targetLinks).toHaveLength(2)
  })

  it('használatban lévő címke törlése csak pontos név-beírással történik', async () => {
    const db = await setupDb()
    const used = await createTag(db, { viewer: leaderViewer }, 'Törlendő')
    const video = await seedVideoWithEvent(db, 'torles-video')
    await db.insert(videoTags).values({ videoId: video.id, tagId: used.id })

    await expect(
      deleteTag(db, { viewer: leaderViewer }, used.id),
    ).rejects.toBeInstanceOf(ConfirmationMismatchError)
    await expect(
      deleteTag(db, { viewer: leaderViewer }, used.id, 'rossz név'),
    ).rejects.toBeInstanceOf(ConfirmationMismatchError)

    const result = await deleteTag(
      db,
      { viewer: leaderViewer },
      used.id,
      'Törlendő',
    )
    expect(result.deletedVideoLinks).toBe(1)
    const remainingLinks = await db.select().from(videoTags)
    expect(remainingLinks).toHaveLength(0)

    // használaton kívüli címke megerősítés nélkül is törölhető
    const unused = await createTag(
      db,
      { viewer: leaderViewer },
      'használaton kívül',
    )
    await deleteTag(db, { viewer: leaderViewer }, unused.id)
  })

  it('nem létező címke érthető hibát ad', async () => {
    const db = await setupDb()
    await expect(
      deleteTag(
        db,
        { viewer: leaderViewer },
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toBeInstanceOf(TagNotFoundError)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-012: stábszerepek', () => {
  it('létrehozás displayOrder-t ad, tag tiltott', async () => {
    const db = await setupDb()
    const first = await createStaffRole(
      db,
      { viewer: leaderViewer },
      'Operatőr',
    )
    const second = await createStaffRole(db, { viewer: leaderViewer }, 'Vágó')
    expect(first.displayOrder).toBe(1)
    expect(second.displayOrder).toBe(2)
    await expect(
      createStaffRole(db, { viewer: memberViewer }, 'Hangos'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('átnevezés nem veszít stábkapcsolatot', async () => {
    const db = await setupDb()
    const role = await createStaffRole(db, { viewer: leaderViewer }, 'Rendező')
    const video = await seedVideoWithEvent(db, 'rename-role-video')
    await db
      .insert(videoStaff)
      .values({ videoId: video.id, roleId: role.id, memberSub: 'member-sub' })

    const renamed = await renameStaffRole(
      db,
      { viewer: leaderViewer },
      role.id,
      'Rendező-operatőr',
    )
    expect(renamed.id).toBe(role.id)
    const links = await db
      .select()
      .from(videoStaff)
      .where(eq(videoStaff.roleId, role.id))
    expect(links).toHaveLength(1)
  })

  it('összevonás áthelyezi a stábkapcsolatokat a célszerephez', async () => {
    const db = await setupDb()
    const source = await createStaffRole(
      db,
      { viewer: leaderViewer },
      'Világosító',
    )
    const target = await createStaffRole(
      db,
      { viewer: leaderViewer },
      'Villanyszerelő',
    )
    const videoA = await seedVideoWithEvent(db, 'role-merge-a')
    const videoB = await seedVideoWithEvent(db, 'role-merge-b')
    await db.insert(videoStaff).values([
      { videoId: videoA.id, roleId: source.id, memberSub: 'member-sub' },
      { videoId: videoB.id, roleId: source.id, memberSub: 'member-sub' },
      { videoId: videoB.id, roleId: target.id, memberSub: 'member-sub' },
    ])

    await mergeStaffRole(db, { viewer: leaderViewer }, source.id, target.id)

    const roles = await listStaffRolesWithUsage(db)
    const merged = roles.find((r) => r.id === target.id)
    expect(merged?.videoCount).toBe(2)
    const remainingRoles = await db.select().from(staffRoles)
    expect(remainingRoles.map((r) => r.name)).toEqual(['Villanyszerelő'])
  })

  it('használatban lévő szerep nem törölhető, használaton kívüli igen', async () => {
    const db = await setupDb()
    const used = await createStaffRole(
      db,
      { viewer: leaderViewer },
      'Zeneszerző',
    )
    const video = await seedVideoWithEvent(db, 'role-delete-video')
    await db
      .insert(videoStaff)
      .values({ videoId: video.id, roleId: used.id, memberSub: 'member-sub' })

    await expect(
      deleteStaffRole(db, { viewer: leaderViewer }, used.id),
    ).rejects.toBeInstanceOf(StaffRoleInUseError)
    await expect(
      db.delete(staffRoles).where(eq(staffRoles.id, used.id)),
    ).rejects.toThrow()

    const free = await createStaffRole(
      db,
      { viewer: leaderViewer },
      'Segédoperatőr',
    )
    await deleteStaffRole(db, { viewer: leaderViewer }, free.id)
    const remaining = await db
      .select()
      .from(staffRoles)
      .where(eq(staffRoles.id, free.id))
    expect(remaining).toHaveLength(0)
  })

  it('sorrendezés beállítja a displayOrder-t és a lista szerint rendez', async () => {
    const db = await setupDb()
    const a = await createStaffRole(db, { viewer: leaderViewer }, 'Sorrend A')
    const b = await createStaffRole(db, { viewer: leaderViewer }, 'Sorrend B')
    const c = await createStaffRole(db, { viewer: leaderViewer }, 'Sorrend C')

    await reorderStaffRoles(db, { viewer: leaderViewer }, [c.id, a.id, b.id])
    const ordered = (await listStaffRolesWithUsage(db))
      .filter((r) => r.name.startsWith('Sorrend'))
      .map((r) => r.name)
    expect(ordered).toEqual(['Sorrend C', 'Sorrend A', 'Sorrend B'])
    void c
  })
})
