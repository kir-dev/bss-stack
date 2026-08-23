import { describe, expect, it } from 'vitest'
import { installFetchMock } from '../helpers/http-mock.ts'
import type { FetchMock } from '../helpers/http-mock.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import {
  checkMediaUrlShape,
  isAllowedMediaHost,
  validateMediaForPublish,
} from '#/server/media/validator.ts'
import {
  buildYoutubeNocookieEmbedUrl,
  normalizeYoutubeVideoId,
  validateYoutubeVideo,
} from '#/server/media/youtube.ts'

const config = validateOobConfig(buildRawOobConfig())

const VIDEO_URL = 'https://v.bsstudio.hu/media/video.mp4'

describe('BSS-011: médiahost engedélylista', () => {
  it('csak a konfigurált host https URL-ei engedélyezettek', () => {
    expect(isAllowedMediaHost(VIDEO_URL, config.media)).toBe(true)
    expect(
      isAllowedMediaHost('http://v.bsstudio.hu/media/video.mp4', config.media),
    ).toBe(false)
    expect(
      isAllowedMediaHost('https://evil.example.com/video.mp4', config.media),
    ).toBe(false)
    // a bsstudio.hu főoldal (más host) nem media:
    expect(isAllowedMediaHost('https://bsstudio.hu/', config.media)).toBe(false)
  })

  it('URL formaellenőrzés: érvénytelen és nem engedélyezett URL hibás', () => {
    expect(checkMediaUrlShape('nem-url', 'video', config.media).ok).toBe(false)
    const wrong = checkMediaUrlShape(
      'https://bsstudio.hu/fooldal',
      'video',
      config.media,
    )
    expect(wrong.ok).toBe(false)
    expect(wrong.problems[0]).toContain('v.bsstudio.hu')
    const ok = checkMediaUrlShape(VIDEO_URL, 'video', config.media)
    expect(ok).toEqual({ ok: true, problems: [] })
  })
})

describe('BSS-011: publikálási médiaellenőrzés (HEAD + Range tartalék)', () => {
  let mock: FetchMock

  function mockHead(status: number, contentType: string | null): void {
    mock = installFetchMock([
      {
        method: 'HEAD',
        urlPattern: /v\.bsstudio\.hu/,
        respond: () => {
          const headers: Record<string, string> =
            contentType === null ? {} : { 'content-type': contentType }
          return { status, headers }
        },
      },
    ])
  }

  it('HEAD 200 + video/mp4 elfogadott', async () => {
    mockHead(200, 'video/mp4')
    const result = await validateMediaForPublish({
      url: VIDEO_URL,
      kind: 'video',
      mediaConfig: config.media,
    })
    expect(result.ok).toBe(true)
    mock.restore()
  })

  it('MP4 helyett kép és thumbnail helyett HTML nem publikálható', async () => {
    mockHead(200, 'image/jpeg')
    const imageAsVideo = await validateMediaForPublish({
      url: VIDEO_URL,
      kind: 'video',
      mediaConfig: config.media,
    })
    expect(imageAsVideo.ok).toBe(false)
    expect(imageAsVideo.problems[0]).toContain('Videó helyett')
    mock.restore()

    mockHead(200, 'text/html')
    const htmlAsThumb = await validateMediaForPublish({
      url: 'https://v.bsstudio.hu/media/thumb.jpg',
      kind: 'thumbnail',
      mediaConfig: config.media,
    })
    expect(htmlAsThumb.ok).toBe(false)
    expect(htmlAsThumb.problems[0]).toContain('Kép helyett')
    mock.restore()
  })

  it('a v.bsstudio.hu főoldalra mutató hiányzó média nem fogadható el', async () => {
    mockHead(200, 'text/html')
    const homepage = await validateMediaForPublish({
      url: 'https://v.bsstudio.hu/',
      kind: 'video',
      mediaConfig: config.media,
    })
    expect(homepage.ok).toBe(false)
    expect(homepage.problems[0]).toContain('Videó helyett text/html')
    mock.restore()
  })

  it('átirányítás és 4xx/5xx nem fogadható el', async () => {
    for (const status of [301, 302, 404, 500]) {
      mockHead(status, 'video/mp4')
      const result = await validateMediaForPublish({
        url: VIDEO_URL,
        kind: 'video',
        mediaConfig: config.media,
      })
      expect(result.ok).toBe(false)
      mock.restore()
    }
  })

  it('405 esetén egybájtos Range GET fut tartalékként és nem tölti le a fájlt', async () => {
    let rangeHeaderSeen: string | null = null
    const bodyRead = false
    mock = installFetchMock([
      {
        method: 'HEAD',
        urlPattern: /v\.bsstudio\.hu/,
        respond: () => ({ status: 405 }),
      },
      {
        method: 'GET',
        urlPattern: /v\.bsstudio\.hu/,
        respond: (request) => {
          rangeHeaderSeen = request.headers.get('range')
          return {
            status: 206,
            headers: { 'content-type': 'video/mp4' },
            body: Buffer.from([0x00]),
          }
        },
      },
    ])

    const result = await validateMediaForPublish({
      url: VIDEO_URL,
      kind: 'video',
      mediaConfig: config.media,
    })
    void bodyRead
    expect(result.ok).toBe(true)
    expect(rangeHeaderSeen).toBe('bytes=0-0')

    const calls = mock.calls()
    expect(calls.some((call) => call.method === 'GET')).toBe(true)
    mock.restore()
  })

  it('501 esetén is működik a Range GET tartalék; rossz típust ott is elutasít', async () => {
    mock = installFetchMock([
      { method: 'HEAD', urlPattern: /thumb/, respond: () => ({ status: 501 }) },
      {
        method: 'GET',
        urlPattern: /thumb/,
        respond: () => ({
          status: 206,
          headers: { 'content-type': 'text/html' },
        }),
      },
    ])
    const bad = await validateMediaForPublish({
      url: 'https://v.bsstudio.hu/media/thumb.jpg',
      kind: 'thumbnail',
      mediaConfig: config.media,
    })
    expect(bad.ok).toBe(false)
    expect(bad.problems[0]).toContain('Kép helyett')
    mock.restore()

    mock = installFetchMock([
      { method: 'HEAD', urlPattern: /video/, respond: () => ({ status: 501 }) },
      {
        method: 'GET',
        urlPattern: /video/,
        respond: () => ({
          status: 206,
          headers: { 'content-type': 'video/mp4' },
        }),
      },
    ])
    const good = await validateMediaForPublish({
      url: VIDEO_URL,
      kind: 'video',
      mediaConfig: config.media,
    })
    expect(good.ok).toBe(true)
    mock.restore()
  })

  it('időtúllépés magyar hibát ad', async () => {
    mock = installFetchMock([
      {
        method: 'HEAD',
        urlPattern: /v\.bsstudio\.hu/,
        respond: () => new Promise<{ status: number }>(() => undefined),
      },
    ])
    const result = await validateMediaForPublish({
      url: VIDEO_URL,
      kind: 'video',
      mediaConfig: config.media,
      totalTimeoutMs: 30,
    })
    expect(result.ok).toBe(false)
    expect(result.problems[0]).toContain('időtúllépés')
    mock.restore()
  })

  it('piszkozatban a hibás URL menthető: a formaellenőrzés nem hálózati hívás', () => {
    const mock2 = installFetchMock([])
    const draftCheck = checkMediaUrlShape(
      'https://v.bsstudio.hu/meg-nem-letezo.mp4',
      'video',
      config.media,
    )
    expect(draftCheck.ok).toBe(true)
    expect(mock2.calls()).toHaveLength(0)
    mock2.restore()
  })
})

describe('BSS-011: YouTube URL normalizálás', () => {
  it('minden elfogadott formából ugyanaz az azonosító jön ki', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
      'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(normalizeYoutubeVideoId(url)).toBe('dQw4w9WgXcQ')
    }
  })

  it('idegen vagy érvénytelen URL nullát ad', () => {
    expect(normalizeYoutubeVideoId('https://vimeo.com/12345')).toBeNull()
    expect(
      normalizeYoutubeVideoId('https://youtube.com/playlist?list=abc'),
    ).toBeNull()
    expect(normalizeYoutubeVideoId('https://youtube.com/watch?v=')).toBeNull()
    expect(normalizeYoutubeVideoId('nem url')).toBeNull()
  })

  it('nocookie embed URL készíthető az azonosítóból', () => {
    expect(buildYoutubeNocookieEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
  })
})

describe('BSS-011: YouTube oEmbed ellenőrzés', () => {
  it('200-as oEmbed válasz elfogadott', async () => {
    const mock = installFetchMock([
      {
        urlPattern: /oEmbed/,
        respond: (request) => {
          expect(request.url.toString().includes('dQw4w9WgXcQ')).toBe(true)
          return {
            status: 200,
            body: { title: 'Teszt élő adás', author_name: 'BSS' },
          }
        },
      },
    ])
    const result = await validateYoutubeVideo(
      'https://youtu.be/dQw4w9WgXcQ',
      config.youtube,
    )
    expect(result.ok).toBe(true)
    expect(result.videoId).toBe('dQw4w9WgXcQ')
    mock.restore()
  })

  it('privát (403) és törölt (404) videó magyar hibát kap', async () => {
    for (const [status, expected] of [
      [403, 'privát'],
      [404, 'oEmbed ellenőrzésen'],
    ] as const) {
      const mock = installFetchMock([
        { urlPattern: /oEmbed/, respond: () => ({ status }) },
      ])
      const result = await validateYoutubeVideo(
        'https://youtu.be/dQw4w9WgXcQ',
        config.youtube,
      )
      expect(result.ok).toBe(false)
      expect(result.problems[0]).toContain(expected)
      mock.restore()
    }
  })

  it('normalizálhatatlan URL hálózati hívás nélkül hibás', async () => {
    const mock = installFetchMock([])
    const result = await validateYoutubeVideo(
      'https://twitch.tv/x',
      config.youtube,
    )
    expect(result.ok).toBe(false)
    expect(result.videoId).toBeNull()
    expect(mock.calls()).toHaveLength(0)
    mock.restore()
  })
})
