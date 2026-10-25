import { describe, expect, it, vi } from 'vitest'
import { resetCachedOobConfig } from '#/server/config/load.ts'
import {
  contentSecurityPolicy,
  robotsTxt,
  securityHeaders,
  withSecurityHeaders,
} from '#/server/http/security-headers.ts'
import { TEST_MEDIA_HOST } from '../helpers/oob-config.ts'

// A fresh module per test: it remembers a failed config load for the process.
async function freshWithSecurityHeaders(): Promise<typeof withSecurityHeaders> {
  vi.resetModules()
  return (await import('#/server/http/security-headers.ts')).withSecurityHeaders
}

describe('BSS-035: biztonsági fejlécek és CSP', () => {
  it('a CSP engedi a média hostot és a YouTube nocookie framet', () => {
    const csp = contentSecurityPolicy(TEST_MEDIA_HOST)
    expect(csp).toContain("media-src 'self' https://v.bsstudio.hu")
    expect(csp).toContain('https://www.youtube-nocookie.com')
    expect(csp).toMatch(/frame-src [^;]*https:\/\/www\.google\.com/)
    expect(csp).toMatch(/img-src [^;]*https:\/\/backstage\.bsstudio\.hu/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('minden alapbiztonsági header jelen van', () => {
    const headers = securityHeaders(TEST_MEDIA_HOST)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['content-security-policy']).toContain('default-src')
  })

  it('a válasz saját fejléceit megtartja, a hiányzó biztonsági fejléceket hozzáadja', async () => {
    const response = withSecurityHeaders(
      new Response('<urlset/>', {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'x-frame-options': 'SAMEORIGIN',
        },
      }),
      TEST_MEDIA_HOST,
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<urlset/>')
    expect(response.headers.get('content-type')).toBe(
      'application/xml; charset=utf-8',
    )
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    )
  })

  it('OOB config nélkül is hozzáadja a fejléceket, médiahost nélküli CSP-vel, és egyszer naplóz', async () => {
    vi.stubEnv('BSS_OOB_CONFIG', 'nem-letezik/config.json')
    resetCachedOobConfig()
    const withHeaders = await freshWithSecurityHeaders()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = withHeaders(new Response('User-agent: *'))
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('content-security-policy')).toContain(
        "media-src 'self'",
      )
      withHeaders(new Response('User-agent: *'))
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      error.mockRestore()
      vi.unstubAllEnvs()
      resetCachedOobConfig()
    }
  })

  it('a válasz saját CSP-jét megtartja, és ehhez nem tölti be az OOB configot', async () => {
    vi.stubEnv('BSS_OOB_CONFIG', 'nem-letezik/config.json')
    resetCachedOobConfig()
    const withHeaders = await freshWithSecurityHeaders()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = withHeaders(
        new Response('<urlset/>', {
          headers: { 'content-security-policy': "default-src 'none'" },
        }),
      )
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'",
      )
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
      vi.unstubAllEnvs()
      resetCachedOobConfig()
    }
  })

  it('a robots.txt tiltja az admin, api és keresés útvonalakat, és mutatja a sitemapet', () => {
    const robots = robotsTxt('http://localhost:3000')
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Disallow: /api')
    expect(robots).toContain('Disallow: /search')
    expect(robots).toContain('Sitemap: http://localhost:3000/sitemap.xml')
  })
})
