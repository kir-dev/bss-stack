import { createAuthRouteHandlers } from '#/server/api/auth-routes.ts'
import { apiNotFoundResponse } from '#/server/api/http.ts'
import { livenessResponse, readinessResponse } from '#/server/jobs/health.ts'
import { handleVideoView } from '#/server/api/view-routes.ts'
import { handleSearch } from '#/server/api/search-routes.ts'

export const API_PATH_PREFIXES = ['/api/', '/health/']

const authHandlers = createAuthRouteHandlers()

const VIDEO_VIEW_PATTERN = /^\/api\/videos\/([0-9a-f-]+)\/view$/

export async function handleApiRequest(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'

  const viewMatch = VIDEO_VIEW_PATTERN.exec(pathname)
  if (viewMatch !== null) {
    return handleVideoView(request, viewMatch[1])
  }

  switch (pathname) {
    case '/api/auth/login':
      return authHandlers.login(request)
    case '/api/auth/callback':
      return authHandlers.callback(request)
    case '/api/auth/logout':
      return authHandlers.logout(request)
    case '/api/auth/me':
      return authHandlers.me(request)
    case '/api/search':
      return handleSearch(request)
    case '/health/live':
      return livenessResponse()
    case '/health/ready':
      return readinessResponse()
    default:
      return apiNotFoundResponse()
  }
}
