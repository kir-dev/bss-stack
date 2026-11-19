import { describe, expect, it } from 'vitest'
import { youtubeAutoplayUrl } from '#/lib/youtube-url.ts'

const EMBED_URL = 'https://www.youtube-nocookie.com/embed/aBcDeFgHiJk'

describe('youtubeAutoplayUrl', () => {
  it('kezdőpont nélkül csak automatikus lejátszást kér', () => {
    expect(youtubeAutoplayUrl(EMBED_URL)).toBe(`${EMBED_URL}?autoplay=1`)
  })

  it('a kezdőpontot egész másodpercre lefelé kerekíti', () => {
    expect(youtubeAutoplayUrl(EMBED_URL, 75.8)).toBe(
      `${EMBED_URL}?autoplay=1&start=75`,
    )
  })

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'értelmetlen kezdőpont (%s) kimarad',
    (start) => {
      expect(youtubeAutoplayUrl(EMBED_URL, start)).toBe(
        `${EMBED_URL}?autoplay=1`,
      )
    },
  )
})
