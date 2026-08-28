import { afterAll, describe, expect, it } from 'vitest'
import {
  jsonRequest,
  reachableMediaFetch,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import { handleAdminVideoRoutes } from '#/server/api/admin/video-routes.ts'
import { handleAdminHighlightRoute } from '#/server/api/admin/homepage-routes.ts'
import { getHomepageState } from '#/server/homepage/state.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

function depsFor(ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) {
  return { db: ctx.db, config: testConfig, fetchImpl: reachableMediaFetch() }
}

describe.skipIf(!hasTestDatabase)(
  'BSS-037: végponttól végpontig lánc — belépés → publikálás → homepage-prioritás',
  () => {
    it('tag publikál, vezetőség kiemel, a prioritás érvénytelenítéssel visszaesik', async () => {
      const ctx = await setupAdminApiTest('bss_e2echain')
      const deps = depsFor(ctx)
      const now = new Date('2026-08-24T12:00:00Z')

      // 1. Üres adatbázison a homepage normál állapotú és üres.
      const initialState = await getHomepageState(ctx.db, { now })
      expect(initialState.priority).toBe('normal')
      expect(initialState.sideVideos).toHaveLength(0)

      // 2. A tag létrehozza és publikálja a videót a valódi admin API-n.
      const created = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, '/api/admin/videos', {
          title: 'Végponttól végpontig teszt videó',
          description: 'Teljes életciklus ellenőrzése.',
          videoUrl: 'https://v.bsstudio.hu/media/e2e.mp4',
          thumbnailUrl: 'https://v.bsstudio.hu/media/e2e.jpg',
        }),
        'create',
        undefined,
        deps,
      )
      expect(created.status).toBe(200)
      const { payload } = await responseBody(created)
      const videoId = String(payload['id'])
      // Létrehozáskor a verzió 1 (a create válasz nem szolgáltat verziót).
      const updated = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/update`, {
          version: 1,
          description: 'Teljes életciklus ellenőrzése.',
          videoUrl: 'https://v.bsstudio.hu/media/e2e.mp4',
          thumbnailUrl: 'https://v.bsstudio.hu/media/e2e.jpg',
        }),
        'update',
        videoId,
        deps,
      )
      expect(updated.status).toBe(200)
      const versionAfterUpdate = Number(
        (await responseBody(updated)).payload['version'],
      )

      // A tag a kiemelést nem hívhatja (szerveroldali ellenőrzés).
      const memberHighlight = await handleAdminHighlightRoute(
        jsonRequest(ctx.memberToken, '/api/admin/homepage/highlight', {
          videoId,
        }),
        deps,
      )
      expect(memberHighlight.status).toBe(403)

      const published = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/publish`, {
          version: versionAfterUpdate,
        }),
        'publish',
        videoId,
        deps,
      )
      expect(published.status).toBe(200)
      const versionAfterPublish = Number(
        (await responseBody(published)).payload['version'],
      )

      // 3. Publikálás után a videó megjelenik a normál listában, de még nem hero.
      const normalState = await getHomepageState(ctx.db, { now })
      expect(normalState.priority).toBe('normal')
      expect(normalState.sideVideos.map((video) => video.id)).toContain(videoId)

      // 4. A vezetőség kiemeli; a homepage prioritása kiemelt lesz.
      const highlighted = await handleAdminHighlightRoute(
        jsonRequest(ctx.leadershipToken, '/api/admin/homepage/highlight', {
          videoId,
        }),
        deps,
      )
      expect(highlighted.status).toBe(200)
      const highlightState = await getHomepageState(ctx.db, { now })
      expect(highlightState.priority).toBe('highlight')
      if (highlightState.priority === 'highlight') {
        const { heroVideo } = highlightState
        if (heroVideo !== undefined) {
          expect(heroVideo.id).toBe(videoId)

          expect(
            highlightState.sideVideos.map((video) => video.id),
          ).not.toContain(videoId)
        }
        expect(heroVideo).toBeDefined()
      }

      // 5. Lomtárba helyezéskor a kiemelés ugyanabban a tranzakcióban
      //    érvénytelenítik: a homepage visszaesik normál állapotra.
      const trashed = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/trash`, {
          version: versionAfterPublish,
        }),
        'trash',
        videoId,
        deps,
      )
      expect(trashed.status).toBe(200)

      const finalState = await getHomepageState(ctx.db, { now })
      expect(finalState.priority).toBe('normal')
      // A lomtári videó a publikus listából is eltűnik.
      expect(finalState.sideVideos.map((video) => video.id)).not.toContain(
        videoId,
      )
    })

    it('schönherzes láthatóságú videó a névtelen homepage-re nem kerül be', async () => {
      const ctx = await setupAdminApiTest('bss_e2esch')
      const deps = depsFor(ctx)
      const now = new Date('2026-08-24T12:00:00Z')

      const created = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, '/api/admin/videos', {
          title: 'Csak schönherzes videó',
          videoUrl: 'https://v.bsstudio.hu/media/sch.mp4',
          thumbnailUrl: 'https://v.bsstudio.hu/media/sch.jpg',
        }),
        'create',
        undefined,
        deps,
      )
      const { payload } = await responseBody(created)
      const videoId = String(payload['id'])
      await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/update`, {
          version: Number(payload['version']),
          visibility: 'schonherz',
        }),
        'update',
        videoId,
        deps,
      )
      await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/publish`, {
          version: Number(payload['version']) + 1,
        }),
        'publish',
        videoId,
        deps,
      )

      const state = await getHomepageState(ctx.db, { now })
      // Az anonim néző számára a korlátozott videó metaadata sem jelenik meg.
      expect(state.sideVideos.map((video) => video.id)).not.toContain(videoId)
    })
  },
)
