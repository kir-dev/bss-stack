/** Magyar feliratok admin állapotokhoz és láthatóságokhoz (spec 4.1). */

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

export const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Nyilvános',
  schonherz: 'Schönherz',
  bss: 'BSS-tag',
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
 * Legördülő elemek a feliratokból, megjelenítési sorrendben. Így a szűrők és
 * a szerkesztő ugyanabból az egy forrásból kapják a magyar feliratokat.
 */
function toOptions(
  labels: Record<string, string>,
): Array<{ value: string; label: string }> {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

export const VIDEO_STATUS_OPTIONS = toOptions(VIDEO_STATUS_LABELS)
export const EVENT_STATUS_OPTIONS = toOptions(EVENT_STATUS_LABELS)
export const VISIBILITY_OPTIONS = toOptions(VISIBILITY_LABELS)
export const MEMBERSHIP_STATUS_OPTIONS = toOptions(MEMBERSHIP_STATUS_LABELS)

export function videoStatusLabel(status: string): string {
  return VIDEO_STATUS_LABELS[status] ?? status
}

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status] ?? status
}

export function visibilityLabel(visibility: string): string {
  return VISIBILITY_LABELS[visibility] ?? visibility
}
