import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { handleApiRequest, API_PATH_PREFIXES } from '#/server/api/router.ts'
import { startBackgroundRunner } from '#/server/jobs/runner.ts'
import type { BackgroundRunnerHandle } from '#/server/jobs/runner.ts'

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

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (isApiPath(pathname)) {
      ensureBackgroundRunner()
      return handleApiRequest(request)
    }
    return ssrHandler(request)
  },
}
