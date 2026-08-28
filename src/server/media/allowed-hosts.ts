import { DEFAULT_MEDIA_HOSTS } from '#/lib/media-url.ts'

export function allowedMediaHosts(): string[] {
  return [...DEFAULT_MEDIA_HOSTS]
}
