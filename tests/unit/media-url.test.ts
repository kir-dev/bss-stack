import { describe, expect, it } from 'vitest'
import { mediaUrlWarning, mediaUrlWarnings } from '#/lib/media-url.ts'
import { youtubeUrlWarning } from '#/lib/youtube-url.ts'

const HOSTS = ['v.bsstudio.hu']

describe('média-URL kliensoldali figyelmeztetés', () => {
  it('az engedélyezett hostra nincs figyelmeztetés', () => {
    expect(
      mediaUrlWarning('MP4 URL', 'https://v.bsstudio.hu/a.mp4', HOSTS),
    ).toBeNull()
  })

  it('az üres mező nem hiba', () => {
    expect(mediaUrlWarning('MP4 URL', '   ', HOSTS)).toBeNull()
  })

  it('más hostot jelez', () => {
    const warning = mediaUrlWarning(
      'MP4 URL',
      'https://example.com/a.mp4',
      HOSTS,
    )
    expect(warning).toContain('example.com')
    expect(warning).toContain('v.bsstudio.hu')
  })

  it('a hasonló nevű hostot nem fogadja el', () => {
    expect(
      mediaUrlWarning('MP4 URL', 'https://v.bsstudio.hu.evil.com/a.mp4', HOSTS),
    ).not.toBeNull()
  })

  it('a http és a hibás URL is figyelmeztetést kap', () => {
    expect(
      mediaUrlWarning('MP4 URL', 'http://v.bsstudio.hu/a.mp4', HOSTS),
    ).toContain('https')
    expect(mediaUrlWarning('MP4 URL', 'nem-url', HOSTS)).toContain(
      'érvénytelen',
    )
  })

  it('üres engedélylistánál egy hostot sem fogad el', () => {
    expect(
      mediaUrlWarning('MP4 URL', 'https://v.bsstudio.hu/a.mp4', []),
    ).toContain('nem engedélyezett')
  })

  it('mindkét média mezőt ellenőrzi', () => {
    expect(
      mediaUrlWarnings(
        { videoUrl: 'https://example.com/a.mp4', thumbnailUrl: 'ez sem url' },
        HOSTS,
      ),
    ).toHaveLength(2)
    expect(
      mediaUrlWarnings(
        {
          videoUrl: 'https://v.bsstudio.hu/a.mp4',
          thumbnailUrl: 'https://v.bsstudio.hu/a.jpg',
        },
        HOSTS,
      ),
    ).toEqual([])
  })
})

describe('YouTube URL kliensoldali figyelmeztetés', () => {
  it('az elfogadott formákra nincs figyelmeztetés', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(youtubeUrlWarning(url)).toBeNull()
    }
  })

  it('az üres mező nem hiba', () => {
    expect(youtubeUrlWarning('  ')).toBeNull()
  })

  it('a nem YouTube vagy hibás URL-t jelzi', () => {
    expect(youtubeUrlWarning('https://vimeo.com/12345')).not.toBeNull()
    expect(youtubeUrlWarning('nem url')).not.toBeNull()
    expect(
      youtubeUrlWarning('https://youtube.com/playlist?list=abc'),
    ).not.toBeNull()
  })
})
