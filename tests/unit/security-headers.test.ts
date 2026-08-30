import { describe, expect, it } from 'vitest'
import {
  contentSecurityPolicy,
  robotsTxt,
  securityHeaders,
} from '#/server/http/security-headers.ts'
import { TEST_MEDIA_HOST } from '../helpers/oob-config.ts'

describe('BSS-035: biztonsági fejlécek és CSP', () => {
  it('a CSP engedi a média hostot és a YouTube nocookie framet', () => {
    const csp = contentSecurityPolicy(TEST_MEDIA_HOST)
    expect(csp).toContain("media-src 'self' https://v.bsstudio.hu")
    expect(csp).toContain('https://www.youtube-nocookie.com')
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

  it('a robots.txt tiltja az admin, api és keresés útvonalakat, és mutatja a sitemapet', () => {
    const robots = robotsTxt('http://localhost:3000')
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Disallow: /api')
    expect(robots).toContain('Disallow: /search')
    expect(robots).toContain('Sitemap: http://localhost:3000/sitemap.xml')
  })
})
