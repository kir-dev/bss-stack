import { getCachedOobConfig } from '#/server/config/load.ts'
import {
  videoAssetUrls as buildVideoAssetUrls,
  videoThumbnailUrl as buildVideoThumbnailUrl,
  videoUrl as buildVideoUrl,
} from '#/lib/video-media.ts'
import type { VideoAssetUrls, VideoMediaSource } from '#/lib/video-media.ts'

export function videoAssetUrls(source: VideoMediaSource): VideoAssetUrls {
  return buildVideoAssetUrls(source, getCachedOobConfig().media.host)
}

export function videoUrl(source: VideoMediaSource): string | null {
  return buildVideoUrl(source, getCachedOobConfig().media.host)
}

export function videoThumbnailUrl(source: VideoMediaSource): string | null {
  return buildVideoThumbnailUrl(source, getCachedOobConfig().media.host)
}
