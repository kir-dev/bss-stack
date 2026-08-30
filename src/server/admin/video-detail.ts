import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import {
  events,
  memberCache,
  relatedVideos,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
} from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { videoAssetUrls } from '#/server/media/video-media.ts'
import type { VideoEncodingGroup } from '#/lib/video-media.ts'

export interface AdminVideoDetail {
  id: string
  slug: string
  title: string
  description: string | null
  guests: string | null
  songs: string | null
  encodingGroup: VideoEncodingGroup | null
  hasHq: boolean
  hasLq: boolean
  baseFilename: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  visibility: string
  status: string
  eventId: string | null
  eventTitle: string | null
  recordedAt: string | null
  publishedAt: Date | null
  viewCount: number
  version: number
  updatedAt: Date
  updatedByName: string | null
  tagIds: string[]
  staffAssignments: Array<{ roleId: string; memberSub: string }>
  relatedVideoIds: string[]
}

export async function getAdminVideoDetail(
  executor: Executor,
  videoId: string,
): Promise<AdminVideoDetail | null> {
  const rows = await executor
    .select({
      id: videos.id,
      slug: videos.slug,
      title: videos.title,
      description: videos.description,
      guests: videos.guests,
      songs: videos.songs,
      encodingGroup: videos.encodingGroup,
      hasHq: videos.hasHq,
      hasLq: videos.hasLq,
      baseFilename: videos.baseFilename,
      visibility: videos.visibility,
      status: videos.status,
      eventId: videos.eventId,
      eventTitle: events.title,
      recordedAt: videos.recordedAt,
      publishedAt: videos.publishedAt,
      viewCount: videos.viewCount,
      version: videos.version,
      updatedAt: videos.updatedAt,
      updatedByName: memberCache.fullName,
    })
    .from(videos)
    .leftJoin(events, eq(events.id, videos.eventId))
    .leftJoin(memberCache, eq(memberCache.sub, videos.updatedBy))
    .where(eq(videos.id, videoId))
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    return null
  }

  const [tagRows, staffRows, relatedRows] = await Promise.all([
    executor
      .select({ tagId: videoTags.tagId })
      .from(videoTags)
      .where(eq(videoTags.videoId, videoId)),
    executor
      .select({ roleId: videoStaff.roleId, memberSub: videoStaff.memberSub })
      .from(videoStaff)
      .where(eq(videoStaff.videoId, videoId)),
    executor
      .select({ relatedVideoId: relatedVideos.relatedVideoId })
      .from(relatedVideos)
      .where(eq(relatedVideos.videoId, videoId))
      .orderBy(asc(relatedVideos.position)),
  ])

  return {
    ...row,
    ...videoAssetUrls(row),
    tagIds: tagRows.map((item) => item.tagId),
    staffAssignments: staffRows.map((item) => ({
      roleId: item.roleId,
      memberSub: item.memberSub,
    })),
    relatedVideoIds: relatedRows.map((item) => item.relatedVideoId),
  }
}

export interface AdminVideoEditorOptions {
  /** Events in any status (can also be assigned to drafts). */
  events: Array<{ id: string; title: string }>
  tags: Array<{ id: string; name: string }>
  staffRoles: Array<{ id: string; name: string }>
  members: Array<{ sub: string; fullName: string }>

  candidateRelated: Array<{ id: string; title: string }>
}

export async function getAdminVideoEditorOptions(
  executor: Executor,
  excludeVideoId?: string,
): Promise<AdminVideoEditorOptions> {
  const [eventRows, tagRows, roleRows, memberRows, relatedCandidates] =
    await Promise.all([
      executor
        .select({ id: events.id, title: events.title })
        .from(events)
        .orderBy(asc(events.title)),
      executor
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .orderBy(asc(tags.name)),
      executor
        .select({ id: staffRoles.id, name: staffRoles.name })
        .from(staffRoles)
        .orderBy(asc(staffRoles.displayOrder), asc(staffRoles.name)),
      executor
        .select({ sub: memberCache.sub, fullName: memberCache.fullName })
        .from(memberCache)
        .where(isNull(memberCache.deletedAt))
        .orderBy(asc(memberCache.fullName))
        .limit(2000),
      executor
        .select({ id: videos.id, title: videos.title })
        .from(videos)
        .where(
          excludeVideoId === undefined
            ? eq(videos.status, 'published')
            : and(
                eq(videos.status, 'published'),
                ne(videos.id, excludeVideoId),
              ),
        )
        .orderBy(desc(sql`${videos.publishedAt}`))
        .limit(1000),
    ])
  return {
    events: eventRows,
    tags: tagRows,
    staffRoles: roleRows,
    members: memberRows,
    candidateRelated: relatedCandidates,
  }
}

/** Resolve tag and staff names for displaying in the editor. */
export async function resolveAdminVideoNames(
  executor: Executor,
  ids: { tagIds: string[]; roleIds: string[]; memberSubs: string[] },
): Promise<{
  tagNames: Map<string, string>
  roleNames: Map<string, string>
  memberNames: Map<string, string>
}> {
  const [tagRows, roleRows, memberRows] = await Promise.all([
    ids.tagIds.length > 0
      ? executor
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(inArray(tags.id, ids.tagIds))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    ids.roleIds.length > 0
      ? executor
          .select({ id: staffRoles.id, name: staffRoles.name })
          .from(staffRoles)
          .where(inArray(staffRoles.id, ids.roleIds))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    ids.memberSubs.length > 0
      ? executor
          .select({ sub: memberCache.sub, fullName: memberCache.fullName })
          .from(memberCache)
          .where(inArray(memberCache.sub, ids.memberSubs))
      : Promise.resolve([] as Array<{ sub: string; fullName: string }>),
  ])
  return {
    tagNames: new Map(tagRows.map((row) => [row.id, row.name])),
    roleNames: new Map(roleRows.map((row) => [row.id, row.name])),
    memberNames: new Map(memberRows.map((row) => [row.sub, row.fullName])),
  }
}
