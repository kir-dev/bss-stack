import { Eye, EyeOff, Lock } from 'lucide-react'
import { visibilityLabel } from '#/lib/admin-labels.ts'

export function VideoVisibility({ visibility }: { visibility: string }) {
  const label = visibilityLabel(visibility)
  const Icon =
    visibility === 'public' ? Eye : visibility === 'schonherz' ? EyeOff : Lock

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
