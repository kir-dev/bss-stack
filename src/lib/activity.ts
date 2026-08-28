export interface ActivityRow {
  videoId: string
  slug: string
  title: string
  /** Calendar date (`YYYY-MM-DD` or null); sorting: descending, missing values last. */
  recordedAt: string | null
  year: number | null
  roles: string[]
}

export interface YearGroup {
  year: number
  groups: Array<{ roleName: string; videos: Array<ActivityRow> }>
}

export interface RoleGroup {
  roleName: string
  videos: Array<ActivityRow>
}

export function groupActivity(
  rows: Array<ActivityRow>,
  view: 'year' | 'role',
): { yearGroups: Array<YearGroup>; roleGroups: Array<RoleGroup> } {
  const rolesOf = (row: ActivityRow): string[] =>
    row.roles.length > 0 ? row.roles : ['Stábtag']

  if (view === 'role') {
    const byRole = new Map<string, RoleGroup>()
    for (const row of rows) {
      for (const roleName of rolesOf(row)) {
        let group = byRole.get(roleName)
        if (group === undefined) {
          group = { roleName, videos: [] }
          byRole.set(roleName, group)
        }
        group.videos.push(row)
      }
    }
    return { yearGroups: [], roleGroups: [...byRole.values()] }
  }

  const byYear = new Map<
    number,
    Map<string, { roleName: string; videos: Array<ActivityRow> }>
  >()
  for (const row of rows) {
    const year = row.year ?? 0
    let rolesMap = byYear.get(year)
    if (rolesMap === undefined) {
      rolesMap = new Map()
      byYear.set(year, rolesMap)
    }
    for (const roleName of rolesOf(row)) {
      let group = rolesMap.get(roleName)
      if (group === undefined) {
        group = { roleName, videos: [] }
        rolesMap.set(roleName, group)
      }
      group.videos.push(row)
    }
  }
  const yearGroups: Array<YearGroup> = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rolesMap]) => ({ year, groups: [...rolesMap.values()] }))
  return { yearGroups, roleGroups: [] }
}
