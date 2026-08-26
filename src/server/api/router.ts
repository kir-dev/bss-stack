import { createAuthRouteHandlers } from '#/server/api/auth-routes.ts'
import { apiNotFoundResponse } from '#/server/api/http.ts'
import { livenessResponse, readinessResponse } from '#/server/jobs/health.ts'
import { handleVideoView } from '#/server/api/view-routes.ts'
import { handleSearch } from '#/server/api/search-routes.ts'
import { handleAdminVideoRoutes } from '#/server/api/admin/video-routes.ts'
import { handleAdminEventRoutes } from '#/server/api/admin/event-routes.ts'
import {
  handleAdminStaffRoleRoutes,
  handleAdminTagRoutes,
} from '#/server/api/admin/catalog-routes.ts'
import {
  handleAdminAboutRoute,
  handleAdminHighlightRoute,
  handleAdminLiveRoutes,
} from '#/server/api/admin/homepage-routes.ts'
import { handleAdminMemberSyncRoute } from '#/server/api/admin/member-routes.ts'

export const API_PATH_PREFIXES = ['/api/', '/health/']

const authHandlers = createAuthRouteHandlers()

const VIDEO_VIEW_PATTERN = /^\/api\/videos\/([0-9a-f-]+)\/view$/

const ADMIN_VIDEO_ACTION_PATTERN =
  /^\/api\/admin\/videos\/([0-9a-f-]+)\/(update|publish|archive|trash|restore|tags|staff|related)$/

const ADMIN_EVENT_ACTION_PATTERN =
  /^\/api\/admin\/events\/([0-9a-f-]+)\/(update|publish|archive|delete_permanent)$/

const LIVE_ACTION_PATTERN =
  /^\/api\/admin\/live\/([0-9a-f-]+)\/(reschedule|start_now|end_now|delete)$/

export async function handleApiRequest(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'

  const viewMatch = VIDEO_VIEW_PATTERN.exec(pathname)
  if (viewMatch !== null) {
    return handleVideoView(request, viewMatch[1])
  }

  if (pathname === '/api/admin/videos') {
    return handleAdminVideoRoutes(request, 'create', undefined)
  }
  const adminVideoMatch = ADMIN_VIDEO_ACTION_PATTERN.exec(pathname)
  if (adminVideoMatch !== null) {
    return handleAdminVideoRoutes(
      request,
      adminVideoMatch[2],
      adminVideoMatch[1],
    )
  }

  if (pathname === '/api/admin/events') {
    return handleAdminEventRoutes(request, 'create', undefined)
  }
  const adminEventMatch = ADMIN_EVENT_ACTION_PATTERN.exec(pathname)
  if (adminEventMatch !== null) {
    return handleAdminEventRoutes(
      request,
      adminEventMatch[2],
      adminEventMatch[1],
    )
  }

  if (pathname === '/api/admin/tags/similar') {
    return handleAdminTagRoutes(request, 'similar', undefined)
  }
  const adminTagMatch =
    /^\/api\/admin\/tags(?:\/([0-9a-f-]+)\/(rename|merge|delete))?$/.exec(
      pathname,
    )
  if (adminTagMatch !== null) {
    return handleAdminTagRoutes(request, adminTagMatch[2], adminTagMatch[1])
  }

  if (pathname === '/api/admin/staff-roles') {
    return handleAdminStaffRoleRoutes(request, 'create', undefined)
  }
  if (pathname === '/api/admin/staff-roles/reorder') {
    return handleAdminStaffRoleRoutes(request, 'reorder', undefined)
  }
  const staffRoleMatch =
    /^\/api\/admin\/staff-roles\/([0-9a-f-]+)\/(rename|merge|delete|reorder)$/.exec(
      pathname,
    )
  if (staffRoleMatch !== null) {
    return handleAdminStaffRoleRoutes(
      request,
      staffRoleMatch[2],
      staffRoleMatch[1],
    )
  }

  if (pathname === '/api/admin/highlight') {
    return handleAdminHighlightRoute(request)
  }
  if (pathname === '/api/admin/about') {
    return handleAdminAboutRoute(request)
  }
  if (pathname === '/api/admin/live') {
    return handleAdminLiveRoutes(request, undefined, undefined)
  }
  if (pathname === '/api/admin/members/sync') {
    return handleAdminMemberSyncRoute(request)
  }
  const liveMatch = LIVE_ACTION_PATTERN.exec(pathname)
  if (liveMatch !== null) {
    return handleAdminLiveRoutes(request, liveMatch[1], liveMatch[2])
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
