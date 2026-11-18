import {
  buildYoutubeNocookieEmbedUrl,
  youtubeImageUrl,
} from '#/lib/youtube-url.ts'

export const VIDEO_ENCODING_GROUPS = ['4a3_SD', '16a9_SD', '16a9_HD'] as const

export type VideoEncodingGroup = (typeof VIDEO_ENCODING_GROUPS)[number]

export const VIDEO_MEDIA_SOURCES = ['server', 'youtube'] as const

export type VideoMediaSourceKind = (typeof VIDEO_MEDIA_SOURCES)[number]

/** Size of YouTube's `hqdefault` image, which letterboxes 16:9 videos. */
export const YOUTUBE_KEYFRAME_SIZE = { width: 480, height: 360 } as const

export interface VideoMediaSource {
  mediaSource: VideoMediaSourceKind
  youtubeVideoId: string | null
  encodingGroup: VideoEncodingGroup | null
  hasHq: boolean
  hasLq: boolean
  baseFilename: string | null
}

export interface VideoAssetUrls {
  videoUrl: string | null
  hqUrl: string | null
  lqUrl: string | null
  thumbnailUrl: string | null
  keyframeUrl: string | null
  mobileUrl: string | null
  embedUrl: string | null
}

const NO_ASSETS: VideoAssetUrls = {
  videoUrl: null,
  hqUrl: null,
  lqUrl: null,
  thumbnailUrl: null,
  keyframeUrl: null,
  mobileUrl: null,
  embedUrl: null,
}

const STORAGE_DIRECTORIES: Record<VideoEncodingGroup, string> = {
  '4a3_SD': 'bss_vagott_web_4a3_SD',
  '16a9_SD': 'bss_vagott_web_16a9_SD',
  '16a9_HD': 'bss_vagott_web_16a9_HD',
}

function assetUrl(
  mediaHost: string,
  group: VideoEncodingGroup,
  directory: string,
  filename: string,
): string {
  const storageDirectory = STORAGE_DIRECTORIES[group]
  return `${mediaHost}/${storageDirectory}/${directory}/${encodeURIComponent(filename)}`
}

export function videoAssetUrls(
  source: VideoMediaSource,
  mediaHost: string,
): VideoAssetUrls {
  if (source.mediaSource === 'youtube') {
    return youtubeAssetUrls(source.youtubeVideoId)
  }

  const { encodingGroup, hasHq, hasLq } = source
  const baseFilename = source.baseFilename?.trim() ?? ''
  if (encodingGroup === null || baseFilename === '') {
    return NO_ASSETS
  }

  const lowQualityUrl = assetUrl(
    mediaHost,
    encodingGroup,
    'low_quality',
    `${baseFilename}_lq.mp4`,
  )
  const highQualitySuffix = encodingGroup === '16a9_HD' ? 'hq_HD' : 'hq_SD'
  const highQualityUrl = assetUrl(
    mediaHost,
    encodingGroup,
    'high_quality',
    `${baseFilename}_${highQualitySuffix}.mp4`,
  )

  return {
    videoUrl: hasHq ? highQualityUrl : hasLq ? lowQualityUrl : null,
    hqUrl: hasHq ? highQualityUrl : null,
    lqUrl: hasLq ? lowQualityUrl : null,
    thumbnailUrl: assetUrl(
      mediaHost,
      encodingGroup,
      'thumbnail',
      `${baseFilename}_tn.png`,
    ),
    keyframeUrl: assetUrl(
      mediaHost,
      encodingGroup,
      'keyframe',
      `${baseFilename}_lq.png`,
    ),
    mobileUrl: hasLq ? lowQualityUrl : null,
    embedUrl: null,
  }
}

function youtubeAssetUrls(videoId: string | null): VideoAssetUrls {
  if (videoId === null) {
    return NO_ASSETS
  }
  return {
    ...NO_ASSETS,
    thumbnailUrl: youtubeImageUrl(videoId, 'mqdefault'),
    keyframeUrl: youtubeImageUrl(videoId, 'hqdefault'),
    embedUrl: buildYoutubeNocookieEmbedUrl(videoId),
  }
}

export function videoUrl(
  source: VideoMediaSource,
  mediaHost: string,
): string | null {
  return videoAssetUrls(source, mediaHost).videoUrl
}

export function videoThumbnailUrl(
  source: VideoMediaSource,
  mediaHost: string,
): string | null {
  return videoAssetUrls(source, mediaHost).thumbnailUrl
}
