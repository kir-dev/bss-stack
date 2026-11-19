import { describe, expect, it } from 'vitest'
import { videoAssetUrls as buildVideoAssetUrls } from '#/lib/video-media.ts'
import { TEST_MEDIA_HOST } from '../helpers/oob-config.ts'
import type { VideoMediaSource } from '#/lib/video-media.ts'

function videoAssetUrls(source: VideoMediaSource) {
  return buildVideoAssetUrls(source, TEST_MEDIA_HOST)
}

describe('videoAssetUrls', () => {
  it.each([
    ['4a3_SD' as const, 'bss_vagott_web_4a3_SD', 'sample_hq_SD.mp4'],
    ['16a9_SD' as const, 'bss_vagott_web_16a9_SD', 'sample_hq_SD.mp4'],
    ['16a9_HD' as const, 'bss_vagott_web_16a9_HD', 'sample_hq_HD.mp4'],
  ])('derives the HQ assets for %s', (encodingGroup, directory, hqFile) => {
    const urls = videoAssetUrls({
      mediaSource: 'server',
      youtubeVideoId: null,
      encodingGroup,
      hasHq: true,
      hasLq: true,
      baseFilename: 'sample',
    })

    expect(urls).toEqual({
      videoUrl: `https://v.bsstudio.hu/${directory}/high_quality/${hqFile}`,
      hqUrl: `https://v.bsstudio.hu/${directory}/high_quality/${hqFile}`,
      lqUrl: `https://v.bsstudio.hu/${directory}/low_quality/sample_lq.mp4`,
      thumbnailUrl: `https://v.bsstudio.hu/${directory}/thumbnail/sample_tn.png`,
      keyframeUrl: `https://v.bsstudio.hu/${directory}/keyframe/sample_lq.png`,
      mobileUrl: `https://v.bsstudio.hu/${directory}/low_quality/sample_lq.mp4`,
      embedUrl: null,
    })
  })

  it('falls back to LQ playback when HQ is unavailable', () => {
    const urls = videoAssetUrls({
      mediaSource: 'server',
      youtubeVideoId: null,
      encodingGroup: '16a9_HD',
      hasHq: false,
      hasLq: true,
      baseFilename: 'sample',
    })

    expect(urls.videoUrl).toBe(urls.mobileUrl)
    expect(urls.videoUrl).toContain('/low_quality/sample_lq.mp4')
  })

  it('returns no assets until the group and base filename are present', () => {
    expect(
      videoAssetUrls({
        mediaSource: 'server',
        youtubeVideoId: null,
        encodingGroup: null,
        hasHq: true,
        hasLq: true,
        baseFilename: 'sample',
      }),
    ).toEqual({
      videoUrl: null,
      hqUrl: null,
      lqUrl: null,
      thumbnailUrl: null,
      keyframeUrl: null,
      mobileUrl: null,
      embedUrl: null,
    })
  })

  it('derives images but no playback URLs when neither quality exists', () => {
    const urls = videoAssetUrls({
      mediaSource: 'server',
      youtubeVideoId: null,
      encodingGroup: '4a3_SD',
      hasHq: false,
      hasLq: false,
      baseFilename: 'sample',
    })

    expect(urls.videoUrl).toBeNull()
    expect(urls.hqUrl).toBeNull()
    expect(urls.lqUrl).toBeNull()
    expect(urls.thumbnailUrl).toContain('/thumbnail/sample_tn.png')
    expect(urls.mobileUrl).toBeNull()
  })

  it('derives YouTube thumbnail, keyframe and embed URLs', () => {
    expect(
      videoAssetUrls({
        mediaSource: 'youtube',
        youtubeVideoId: 'aBcDeFgHiJk',
        encodingGroup: null,
        hasHq: false,
        hasLq: false,
        baseFilename: null,
      }),
    ).toEqual({
      videoUrl: null,
      hqUrl: null,
      lqUrl: null,
      mobileUrl: null,
      thumbnailUrl: 'https://i.ytimg.com/vi/aBcDeFgHiJk/mqdefault.jpg',
      keyframeUrl: 'https://i.ytimg.com/vi/aBcDeFgHiJk/hqdefault.jpg',
      embedUrl: 'https://www.youtube-nocookie.com/embed/aBcDeFgHiJk',
    })
  })

  it('returns no URLs for a YouTube video without an ID', () => {
    expect(
      videoAssetUrls({
        mediaSource: 'youtube',
        youtubeVideoId: null,
        encodingGroup: null,
        hasHq: false,
        hasLq: false,
        baseFilename: null,
      }),
    ).toEqual({
      videoUrl: null,
      hqUrl: null,
      lqUrl: null,
      thumbnailUrl: null,
      keyframeUrl: null,
      mobileUrl: null,
      embedUrl: null,
    })
  })
})
