export const VIDEO_ENCODING_GROUPS = ['4a3_SD', '16a9_SD', '16a9_HD'] as const

export type VideoEncodingGroup = (typeof VIDEO_ENCODING_GROUPS)[number]

export interface VideoMediaSource {
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
}

export const VIDEO_MEDIA_ORIGIN = 'https://v.bsstudio.hu'

const STORAGE_DIRECTORIES: Record<VideoEncodingGroup, string> = {
  '4a3_SD': 'bss_vagott_web_4a3_SD',
  '16a9_SD': 'bss_vagott_web_16a9_SD',
  '16a9_HD': 'bss_vagott_web_16a9_HD',
}

function assetUrl(
  group: VideoEncodingGroup,
  directory: string,
  filename: string,
): string {
  const storageDirectory = STORAGE_DIRECTORIES[group]
  return `${VIDEO_MEDIA_ORIGIN}/${storageDirectory}/${directory}/${encodeURIComponent(filename)}`
}

export function videoAssetUrls(source: VideoMediaSource): VideoAssetUrls {
  const { encodingGroup, hasHq, hasLq } = source
  const baseFilename = source.baseFilename?.trim() ?? ''
  if (encodingGroup === null || baseFilename === '') {
    return {
      videoUrl: null,
      hqUrl: null,
      lqUrl: null,
      thumbnailUrl: null,
      keyframeUrl: null,
      mobileUrl: null,
    }
  }

  const lowQualityUrl = assetUrl(
    encodingGroup,
    'low_quality',
    `${baseFilename}_lq.mp4`,
  )
  const highQualitySuffix = encodingGroup === '16a9_HD' ? 'hq_HD' : 'hq_SD'
  const highQualityUrl = assetUrl(
    encodingGroup,
    'high_quality',
    `${baseFilename}_${highQualitySuffix}.mp4`,
  )

  return {
    videoUrl: hasHq ? highQualityUrl : hasLq ? lowQualityUrl : null,
    hqUrl: hasHq ? highQualityUrl : null,
    lqUrl: hasLq ? lowQualityUrl : null,
    thumbnailUrl: assetUrl(
      encodingGroup,
      'thumbnail',
      `${baseFilename}_tn.png`,
    ),
    keyframeUrl: assetUrl(encodingGroup, 'keyframe', `${baseFilename}_lq.png`),
    mobileUrl: hasLq ? lowQualityUrl : null,
  }
}

export function videoUrl(source: VideoMediaSource): string | null {
  return videoAssetUrls(source).videoUrl
}

export function videoThumbnailUrl(source: VideoMediaSource): string | null {
  return videoAssetUrls(source).thumbnailUrl
}
