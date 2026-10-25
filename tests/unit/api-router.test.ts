import { describe, expect, it } from 'vitest'
import { handleApiRequest } from '#/server/api/router.ts'
import { trimTrailingSlashes } from '#/server/shared/trailing-slashes.ts'

describe('API útvonalválasztás', () => {
  it('a záró perjeleket figyelmen kívül hagyja', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/health/live///'),
    )
    expect(response.status).toBe(200)
  })

  it('a hosszú perjelsorozatot tartalmazó útvonalat elutasítja', async () => {
    const response = await handleApiRequest(
      new Request(`http://localhost/api/${'/'.repeat(100_000)}a`),
    )
    expect(response.status).toBe(404)
  })
})

describe('záró perjelek levágása', () => {
  it('csak a végén álló perjeleket vágja le', () => {
    expect(trimTrailingSlashes('/api/x///')).toBe('/api/x')
    expect(trimTrailingSlashes('https://idp.example/o/')).toBe(
      'https://idp.example/o',
    )
    expect(trimTrailingSlashes('///')).toBe('')
    expect(trimTrailingSlashes('/a//b')).toBe('/a//b')
  })

  // A quadratic implementation would take minutes here and hit the test timeout.
  it('a nem záró hosszú perjelsorozatot is kezeli', () => {
    const value = `/${'/'.repeat(1_000_000)}a`
    expect(trimTrailingSlashes(value)).toBe(value)
  })
})
