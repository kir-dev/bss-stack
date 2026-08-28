export function parseVideoStartTime(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }
  if (typeof value !== 'string') return undefined

  const timestamp = value.trim().toLowerCase()
  if (/^\d+(?:\.\d+)?$/.test(timestamp)) return Number(timestamp)

  const match = timestamp.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/)
  if (match === null || match[0] === '') return undefined

  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  return hours * 3600 + minutes * 60 + seconds
}
