import { and, asc, eq } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import {
  events,
  memberCache,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
} from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { visibleVideoCondition } from '#/server/videos/visibility.ts'
import { getRelatedVideos } from '#/server/videos/related.ts'
import { videoAssetUrls } from '#/lib/video-media.ts'

export interface VideoDetailStaffEntry {
  roleId: string
  roleName: string
  displayOrder: number
  members: Array<{ sub: string; username: string; fullName: string }>
}

export interface RelatedVideoItem {
  id: string
  slug: string
  title: string
  thumbnailUrl: string | null
}

export interface VideoDetail {
  id: string
  slug: string
  title: string
  description: string | null
  guests: string | null
  songs: string | null
  videoUrl: string | null
  hqUrl: string | null
  lqUrl: string | null
  thumbnailUrl: string | null
  recordedAt: string | null
  publishedAt: Date | null
  event: {
    slug: string
    title: string
    startDate: string | null
    endDate: string | null
  } | null
  tags: Array<{ name: string }>
  staff: Array<VideoDetailStaffEntry>
  relatedVideos: Array<RelatedVideoItem>
}

export async function getVideoDetail(
  executor: Executor,
  viewer: Viewer,
  slug: string,
): Promise<VideoDetail | null> {
  const rows = await executor
    .select()
    .from(videos)
    .where(
      and(
        eq(videos.slug, slug),
        eq(videos.status, 'published'),
        visibleVideoCondition(viewer),
      ),
    )
    .limit(1)
  const video = rows.at(0)
  if (video === undefined) {
    return null
  }

  const [eventRow, tagRows, staffRows, related] = await Promise.all([
    video.eventId === null
      ? Promise.resolve(null)
      : executor
          .select({
            slug: events.slug,
            title: events.title,
            startDate: events.startDate,
            endDate: events.endDate,
          })
          .from(events)
          .where(
            and(eq(events.id, video.eventId), eq(events.status, 'published')),
          )
          .limit(1),
    executor
      .select({ name: tags.name })
      .from(videoTags)
      .innerJoin(tags, eq(tags.id, videoTags.tagId))
      .where(eq(videoTags.videoId, video.id))
      .orderBy(asc(tags.name)),
    executor
      .select({
        roleId: staffRoles.id,
        roleName: staffRoles.name,
        displayOrder: staffRoles.displayOrder,
        sub: memberCache.sub,
        username: memberCache.username,
        fullName: memberCache.fullName,
      })
      .from(videoStaff)
      .innerJoin(staffRoles, eq(staffRoles.id, videoStaff.roleId))
      .innerJoin(memberCache, eq(memberCache.sub, videoStaff.memberSub))
      .where(eq(videoStaff.videoId, video.id))
      .orderBy(
        asc(staffRoles.displayOrder),
        asc(staffRoles.name),
        asc(memberCache.fullName),
      ),
    getRelatedVideos(executor, viewer, video.id),
  ])

  const staffByRole = new Map<string, VideoDetailStaffEntry>()
  for (const row of staffRows) {
    let entry = staffByRole.get(row.roleId)
    if (entry === undefined) {
      entry = {
        roleId: row.roleId,
        roleName: row.roleName,
        displayOrder: row.displayOrder,
        members: [],
      }
      staffByRole.set(row.roleId, entry)
    }
    entry.members.push({
      sub: row.sub,
      username: row.username,
      fullName: row.fullName,
    })
  }

  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    description: video.description,
    guests: video.guests,
    songs: video.songs,
    ...videoAssetUrls(video),
    recordedAt: video.recordedAt,
    publishedAt: video.publishedAt,
    event: eventRow?.at(0) ?? null,
    tags: tagRows,
    staff: [...staffByRole.values()],
    relatedVideos: related.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      thumbnailUrl: videoAssetUrls(item).thumbnailUrl,
    })),
  }
}
