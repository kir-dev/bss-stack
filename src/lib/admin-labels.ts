import { Eye, EyeOff, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const VIDEO_STATUS_LABELS: Record<string, string> = {
  draft: 'Piszkozat',
  published: 'Publikált',
  archived: 'Archivált',
  trash: 'Lomtár',
}

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Piszkozat',
  published: 'Publikált',
  archived: 'Archivált',
}

export const VISIBILITY_LABELS: Record<string, [LucideIcon, string]> = {
  public: [Eye, 'Nyilvános'],
  schonherz: [EyeOff, 'Schönherz'],
  bss: [Lock, 'BSS-tagok'],
}

export const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  studio_member: 'Stúdiós',
  studio_candidate: 'Stúdiósjelölt',
  studio_applicant: 'Stúdiósjelölt-jelölt',
  senior_active: 'Aktív öregtag',
  senior_archived: 'Archivált öregtag',
  contributor: 'Dolgozott még velünk',
}

/**
 * Dropdown items built from the labels, in display order. This way the filters
 * and the editor get the Hungarian labels from the same single source.
 */
function toOptions(
  labels: Record<string, string>,
): Array<{ value: string; label: string }> {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

export const VIDEO_STATUS_OPTIONS = toOptions(VIDEO_STATUS_LABELS)
export const EVENT_STATUS_OPTIONS = toOptions(EVENT_STATUS_LABELS)
export const VISIBILITY_OPTIONS = Object.entries(VISIBILITY_LABELS).map(
  ([value, [icon, label]]) => ({ value, label, icon }),
)
export const MEMBERSHIP_STATUS_OPTIONS = toOptions(MEMBERSHIP_STATUS_LABELS)

export function videoStatusLabel(status: string): string {
  return VIDEO_STATUS_LABELS[status] ?? status
}

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status] ?? status
}

export function visibilityLabel(visibility: string): string {
  return VISIBILITY_LABELS[visibility][1]
}

export function visibilityIcon(visibility: string): LucideIcon {
  return VISIBILITY_LABELS[visibility][0]
}
