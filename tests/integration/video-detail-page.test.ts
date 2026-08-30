import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { getVideoDetail } from '#/server/pages/video-detail.ts'
import { handleVideoView } from '#/server/api/view-routes.ts'
import { VIEW_SESSION_COOKIE_NAME } from '#/server/views/counter.ts'
import {
  formatCalendarDateHu,
  formatDateHu,
  formatEventIntervalHu,
} from '#/lib/format-date.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import {
  events,
  memberCache,
  relatedVideos,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
  viewSessions,
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
const anonymous = anonymousViewer()

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_videodetail')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert> & { slug: string },
): Promise<typeof videos.$inferSelect> {
  const rows = await db
    .insert(videos)
    .values({
      title: overrides.slug,
      status: 'published',
      visibility: 'public',
      publishedAt: new Date('2026-06-01T10:00:00.000Z'),
      encodingGroup: '16a9_HD',
      hasHq: true,
      hasLq: true,
      baseFilename: 'detail-video',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

function viewRequest(
  videoId: string,
  options: { token?: string; origin?: string; method?: string } = {},
): Request {
  const headers = new Headers({ origin: options.origin ?? 'http://localhost' })
  if (options.token !== undefined) {
    headers.set('cookie', `${VIEW_SESSION_COOKIE_NAME}=${options.token}`)
  }
  return new Request(`http://localhost/api/videos/${videoId}/view`, {
    method: options.method ?? 'POST',
    headers,
  })
}

describe.skipIf(!hasTestDatabase)('BSS-021: videórészlet', () => {
  it('piszkozat, archivált és nem látható videó null (404)', async () => {
    const db = await setupDb()
    await seedVideo(db, { slug: 'piszkozat', status: 'draft' })
    await seedVideo(db, { slug: 'bss-only', visibility: 'bss' })
    expect(await getVideoDetail(db, anonymous, 'piszkozat')).toBeNull()
    expect(await getVideoDetail(db, anonymous, 'nincs-ilyen')).toBeNull()
    expect(await getVideoDetail(db, anonymous, 'bss-only')).toBeNull()
  })

  it('blokkok és stáb pozíciónként, címke és esemény adatokkal', async () => {
    const db = await setupDb()
    await db.insert(events).values({
      slug: 'bstv-adas',
      title: 'BSTV Adás',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      status: 'published',
    })
    const eventRows = await db.select().from(events).limit(1)
    const event = eventRows.at(0)
    if (event === undefined) throw new Error('seed failed')
    const tagRows = await db
      .insert(tags)
      .values([
        { name: 'Interjú', normalizedName: 'interju' },
        { name: 'BSTV', normalizedName: 'bstv' },
      ])
      .returning()
    const roleRows = await db
      .insert(staffRoles)
      .values([
        { name: 'Rendező', normalizedName: 'rendezo', displayOrder: 2 },
        { name: 'Operatőr', normalizedName: 'operator', displayOrder: 1 },
      ])
      .returning()
    const rendezo = roleRows.at(0)
    const operator = roleRows.at(1)
    if (rendezo === undefined || operator === undefined) throw new Error('x')
    await db.insert(memberCache).values([
      {
        sub: 'sub-a',
        username: 'tag-a',
        fullName: 'Anna Tag',
        membershipStatus: 'studio_member',
      },
      {
        sub: 'sub-b',
        username: 'tag-b',
        fullName: 'Bence Tag',
        membershipStatus: 'studio_member',
      },
    ])
    const video = await seedVideo(db, {
      slug: 'adas-1',
      description: 'Leírás\ntöbb sorban',
      guests: 'Vendég Elek',
      songs: 'Előadó - Dal',
      eventId: event.id,
    })
    await db
      .insert(videoTags)
      .values(tagRows.map((tag) => ({ videoId: video.id, tagId: tag.id })))
    await db.insert(videoStaff).values([
      { videoId: video.id, roleId: rendezo.id, memberSub: 'sub-b' },
      { videoId: video.id, roleId: operator.id, memberSub: 'sub-a' },
      { videoId: video.id, roleId: operator.id, memberSub: 'sub-b' },
    ])

    const detail = await getVideoDetail(db, anonymous, 'adas-1')
    expect(detail).not.toBeNull()
    if (detail === null) throw new Error('unreachable')
    expect(detail.event).toMatchObject({
      slug: 'bstv-adas',
      title: 'BSTV Adás',
    })
    expect(detail.tags.map((tag) => tag.name)).toEqual(['BSTV', 'Interjú'])
    expect(detail.staff.map((entry) => entry.roleName)).toEqual([
      'Operatőr',
      'Rendező',
    ])
    const operators = detail.staff.find(
      (entry) => entry.roleName === 'Operatőr',
    )
    expect(operators?.members.map((member) => member.fullName)).toEqual([
      'Anna Tag',
      'Bence Tag',
    ])
    expect(detail.description).toContain('\n')
  })

  it('kapcsolódó videók néző szerint szűrve jelennek meg', async () => {
    const db = await setupDb()
    const main = await seedVideo(db, { slug: 'fo-video' })
    await seedVideo(db, { slug: 'lathato-kapcs' })
    await seedVideo(db, { slug: 'rejtett-kapcs', visibility: 'bss' })
    const relatedRows = await db.select().from(videos)
    const bySlug = new Map(relatedRows.map((row) => [row.slug, row]))
    const visible = bySlug.get('lathato-kapcs')
    const hidden = bySlug.get('rejtett-kapcs')
    if (visible === undefined || hidden === undefined) throw new Error('seed')
    await db.insert(relatedVideos).values([
      { videoId: main.id, relatedVideoId: hidden.id, position: 1 },
      { videoId: main.id, relatedVideoId: visible.id, position: 2 },
    ])
    const detail = await getVideoDetail(db, anonymous, 'fo-video')
    expect(detail?.relatedVideos.map((item) => item.slug)).toEqual([
      'lathato-kapcs',
    ])
  })
})

describe.skipIf(!hasTestDatabase)(
  'BSS-021: megtekintésszámláló végpont',
  () => {
    it('első play számol, ugyanaz a session másodszor nem; cookie-t kap', async () => {
      const db = await setupDb()
      await db.insert(memberCache).values({
        sub: 'sub-x',
        username: 'tag-x',
        fullName: 'X Tag',
        membershipStatus: 'studio_member',
      })
      const video = await seedVideo(db, { slug: 'szamlalt-video' })

      const first = await handleVideoView(viewRequest(video.id), video.id, {
        db,
      })
      expect(first.status).toBe(200)
      expect(await first.json()).toEqual({ counted: true })
      const setCookie = first.headers.get('set-cookie')
      expect(setCookie).toContain(VIEW_SESSION_COOKIE_NAME)

      const countedRows = await db
        .select()
        .from(videos)
        .where(eq(videos.id, video.id))
      expect(countedRows.at(0)?.viewCount).toBe(1)

      const token = /=(.+?);/.exec(setCookie ?? '')?.[1] ?? ''
      const second = await handleVideoView(
        viewRequest(video.id, { token }),
        video.id,
        { db },
      )
      expect(second.status).toBe(200)
      expect(await second.json()).toEqual({ counted: false })
      expect(second.headers.get('set-cookie')).toBeNull()
      const afterRows = await db
        .select()
        .from(videos)
        .where(eq(videos.id, video.id))
      expect(afterRows.at(0)?.viewCount).toBe(1)

      // A view_sessions sor rögzítésre került.
      const sessions = await db.select().from(viewSessions)
      expect(sessions).toHaveLength(1)
    })

    it('nem látható vagy ismeretlen videó 404, metaadat nélkül', async () => {
      const db = await setupDb()
      const secret = await seedVideo(db, {
        slug: 'titkos',
        visibility: 'bss',
        title: 'Titkos cím',
      })
      const response = await handleVideoView(
        viewRequest(secret.id),
        secret.id,
        {
          db,
        },
      )
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('Titkos cím')

      const missing = await handleVideoView(
        viewRequest('00000000-0000-4000-8000-000000000001'),
        '00000000-0000-4000-8000-000000000001',
        { db },
      )
      expect(missing.status).toBe(404)

      const badRequest = await handleVideoView(
        viewRequest('nem-uuid'),
        'nem-uuid',
        { db },
      )
      expect(badRequest.status).toBe(400)
    })

    it('idegen origin 403, GET metódus 405', async () => {
      const db = await setupDb()
      const video = await seedVideo(db, { slug: 'origin-video' })
      const crossOrigin = await handleVideoView(
        viewRequest(video.id, { origin: 'https://rossz.example' }),
        video.id,
        { db },
      )
      expect(crossOrigin.status).toBe(403)

      const getRequest_ = await handleVideoView(
        viewRequest(video.id, { method: 'GET' }),
        video.id,
        { db },
      )
      expect(getRequest_.status).toBe(405)
    })
  },
)

describe.skipIf(!hasTestDatabase)('BSS-021: magyar dátumformátum', () => {
  it('publikus dátum és eseményintervallum formátum', () => {
    expect(formatDateHu(new Date('2026-06-06T14:32:00Z'))).toBe(
      '2026. június 6.',
    )
    expect(formatCalendarDateHu('2026-06-06')).toBe('2026. június 6.')
    expect(formatEventIntervalHu('2026-06-06', null)).toBe('2026. június 6.')
    expect(formatEventIntervalHu('2026-06-06', '2026-06-08')).toBe(
      '2026. június 6-8.',
    )
    expect(formatEventIntervalHu('2026-06-30', '2026-07-02')).toBe(
      '2026. június 30. – 2026. július 2.',
    )
  })
})
