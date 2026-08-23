import { createAuthRouteHandlers } from '#/server/api/auth-routes.ts'
import { apiNotFoundResponse } from '#/server/api/http.ts'
import { livenessResponse, readinessResponse } from '#/server/jobs/health.ts'

export const API_PATH_PREFIXES = ['/api/', '/health/']

const authHandlers = createAuthRouteHandlers()

export async function handleApiRequest(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'

  switch (pathname) {
    case '/api/auth/login':
      return authHandlers.login(request)
    case '/api/auth/callback':
      return authHandlers.callback(request)
    case '/api/auth/logout':
      return authHandlers.logout(request)
    case '/api/auth/me':
      return authHandlers.me(request)
    case '/health/live':
      return livenessResponse()
    case '/health/ready':
      return readinessResponse()
    default:
      return apiNotFoundResponse()
  }
}
