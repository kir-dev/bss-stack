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

// Háttérfeladatok (induláskori + óránkénti szinkron) egyszer indulnak.
// Hiba esetén az alkalmazás tovább fut; a hiba a futások táblájába kerül.
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

// Fejlesztői módban a Vite modul- és eszközkérései is ezen a handleren
// futnak keresztül. Ezeket át kell engednünk a Vite middleware-nek: a
// TanStack Router ugyanis a `$`-kal kezdődő útvonalszegmenseket paraméternek
// nézi, ezért a `/src/routes/videos/$slug.tsx`-re 307-tel válaszolna a
// `/src/routes/videos/undefined` címre. Emiatt a route-fa modulgráfja nem
// töltődik be, a kliens sosem hidratál, és egyetlen gomb sem működik.
const DEV_ASSET_PREFIXES = ['/@', '/src/', '/node_modules/'] as const

function isDevAssetPath(pathname: string): boolean {
  return (
    import.meta.env.DEV &&
    DEV_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

/** SSR-válasz (és minden más) biztonsági fejlécekkel való kiegészítése. */
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
      // 404 → a kérés továbbmegy a Vite dev middleware-hez.
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
