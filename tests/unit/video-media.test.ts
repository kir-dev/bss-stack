import { describe, expect, it } from 'vitest'
import { videoAssetUrls } from '#/lib/video-media.ts'

describe('videoAssetUrls', () => {
  it.each([
    ['4a3_SD' as const, 'bss_vagott_web_4a3_SD', 'sample_hq_SD.mp4'],
    ['16a9_SD' as const, 'bss_vagott_web_16a9_SD', 'sample_hq_SD.mp4'],
    ['16a9_HD' as const, 'bss_vagott_web_16a9_HD', 'sample_hq_HD.mp4'],
  ])('derives the HQ assets for %s', (encodingGroup, directory, hqFile) => {
    const urls = videoAssetUrls({
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
    })
  })

  it('falls back to LQ playback when HQ is unavailable', () => {
    const urls = videoAssetUrls({
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
    })
  })

  it('derives images but no playback URLs when neither quality exists', () => {
    const urls = videoAssetUrls({
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
})
