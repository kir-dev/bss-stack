import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { handleApiRequest, API_PATH_PREFIXES } from '#/server/api/router.ts'
import { startBackgroundRunner } from '#/server/jobs/runner.ts'
import type { BackgroundRunnerHandle } from '#/server/jobs/runner.ts'
import {
  COURSE_REDIRECT_TARGET,
  isCoursesPath,
} from '#/server/pages/courses-redirect.ts'
import { securityHeaders, robotsTxt } from '#/server/http/security-headers.ts'
import { getSitemapEntries, sitemapXml } from '#/server/pages/sitemap.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

const ssrHandler = createStartHandler(defaultStreamHandler)

// The background job runner starts only once. On error the application keeps
// running; the failure is logged and the next tick tries again.
let runnerHandle: BackgroundRunnerHandle | null = null

function ensureBackgroundRunner(): void {
  if (runnerHandle === null) {
    try {
      runnerHandle = startBackgroundRunner()
    } catch (error) {
      console.error('[jobs] A háttérfutató indítása nem sikerült:', error)
    }
  }
}

function isApiPath(pathname: string): boolean {
  return API_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// In development mode, Vite module and asset requests also pass through
// this handler. We must let them through to the Vite middleware: the
// TanStack Router treats route segments starting with `$` as parameters,
// so it would respond with a 307 to `/src/routes/videos/undefined` for
// `/src/routes/videos/$slug.tsx`. Because of this the route tree's module
// graph never loads, the client never hydrates, and no button works.
const DEV_ASSET_PREFIXES = ['/@', '/src/', '/node_modules/'] as const

function isDevAssetPath(pathname: string): boolean {
  return (
    import.meta.env.DEV &&
    DEV_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

/** Augmenting the SSR response (and everything else) with security headers. */
async function runWithSecurityHeaders(request: Request): Promise<Response> {
  const response = await ssrHandler(request)
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(securityHeaders())) {
    if (!headers.has(name)) {
      headers.set(name, value)
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    if (isDevAssetPath(pathname)) {
      // 404 → the request continues to the Vite dev middleware.
      return new Response(null, { status: 404 })
    }
    if (isApiPath(pathname)) {
      ensureBackgroundRunner()
      return handleApiRequest(request)
    }
    if (isCoursesPath(pathname)) {
      return new Response(null, {
        status: 302,
        headers: { location: COURSE_REDIRECT_TARGET },
      })
    }
    if (pathname === '/robots.txt') {
      return new Response(robotsTxt(url.origin), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    if (pathname === '/sitemap.xml') {
      const db = await getDefaultDb()
      const entries = await getSitemapEntries(db)
      return new Response(sitemapXml(entries, url.origin), {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      })
    }
    return runWithSecurityHeaders(request)
  },
}
