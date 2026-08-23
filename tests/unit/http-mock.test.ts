import { afterEach, describe, expect, it } from 'vitest'
import { installFetchMock } from '../helpers/http-mock.ts'

const cleanup: Array<() => void> = []

afterEach(() => {
  while (cleanup.length > 0) {
    cleanup.pop()!()
  }
})

describe('installFetchMock', () => {
  it('URL mintára válaszol determinisztikusan', async () => {
    const mock = installFetchMock([
      {
        method: 'HEAD',
        urlPattern: 'https://v.bsstudio.hu/media/',
        respond: () => ({
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      },
    ])
    cleanup.push(mock.restore)

    const response = await fetch('https://v.bsstudio.hu/media/video1.mp4', {
      method: 'HEAD',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/mp4')
  })

  it('átirányítást szimuláló válasz is beállítható', async () => {
    const mock = installFetchMock([
      {
        urlPattern: /example\.com\/redirect/,
        respond: () => ({
          status: 302,
          headers: { location: 'https://bsstudio.hu/' },
        }),
      },
    ])
    cleanup.push(mock.restore)

    const response = await fetch('https://example.com/redirect/video.mp4')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://bsstudio.hu/')
  })

  it('JSON választ ad oEmbed híváshoz', async () => {
    const mock = installFetchMock([
      {
        urlPattern: 'www.youtube.com/oEmbed',
        respond: () => ({
          status: 200,
          body: { title: 'Teszt live', author_name: 'BSS' },
        }),
      },
    ])
    cleanup.push(mock.restore)

    const response = await fetch(
      'https://www.youtube.com/oEmbed?url=https://www.youtube.com/watch?v=abc123&format=json',
    )
    const payload = (await response.json()) as { title: string }
    expect(payload.title).toBe('Teszt live')
  })

  it('mock nélküli útvonalnál konkrét hibát dob', async () => {
    const mock = installFetchMock([])
    cleanup.push(mock.restore)

    await expect(fetch('https://unknown.example.com/x')).rejects.toThrow(
      /Nincs mock a kéréshez/,
    )
  })

  it('a hívások naplózása és visszaállítás után az eredeti fetch él', async () => {
    const mock = installFetchMock([
      {
        urlPattern: 'authentik.local',
        respond: () => ({ status: 200, body: { ok: true } }),
      },
    ])

    await fetch('https://authentik.local/application/o/bss/')
    expect(mock.calls()).toHaveLength(1)
    expect(mock.calls()[0]?.method).toBe('GET')

    mock.reset()
    expect(mock.calls()).toHaveLength(0)

    mock.restore()
  })
})
