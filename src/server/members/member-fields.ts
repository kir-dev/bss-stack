import { MEMBERSHIP_STATUS_KEYS } from '#/server/config/oob-schema.ts'
import type { SemesterKey } from '#/server/config/oob-schema.ts'

/**
 * Hungarian academic semester notation: `2021/2022/1` is the autumn semester of
 * the 2021/2022 academic year, `2021/2022/2` the spring one. This is the only
 * format the API accepts; internally it is stored as a calendar year plus a
 * `spring | autumn` value, which is what the listings sort and group by.
 */
/**
 * The pattern string is canonical: `RegExp.prototype.source` re-escapes forward
 * slashes, and the escaped form would leak into the published OpenAPI schema.
 */
export const ACADEMIC_SEMESTER_PATTERN_SOURCE = '^(\\d{4})/(\\d{4})/([12])$'

export const ACADEMIC_SEMESTER_PATTERN = new RegExp(
  ACADEMIC_SEMESTER_PATTERN_SOURCE,
)

export const ACADEMIC_SEMESTER_EXAMPLE = '2021/2022/1'

const YEAR_MIN = 1950
const YEAR_MAX = 2200

export interface AcademicSemester {
  /** Calendar year the semester falls in (autumn → first year, spring → second). */
  year: number
  semester: SemesterKey
}

export class AcademicSemesterFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AcademicSemesterFormatError'
  }
}

/**
 * `2021/2022/1` → autumn 2021; `2021/2022/2` → spring 2022.
 * Throws with a Hungarian message describing exactly what is wrong.
 */
export function parseAcademicSemester(value: string): AcademicSemester {
  const match = ACADEMIC_SEMESTER_PATTERN.exec(value.trim())
  if (match === null) {
    throw new AcademicSemesterFormatError(
      `"${value}" nem érvényes félév. Várt formátum: ÉÉÉÉ/ÉÉÉÉ/1 vagy ÉÉÉÉ/ÉÉÉÉ/2 (pl. ${ACADEMIC_SEMESTER_EXAMPLE}).`,
    )
  }
  const startYear = Number(match[1])
  const endYear = Number(match[2])
  const index = Number(match[3])

  if (endYear !== startYear + 1) {
    throw new AcademicSemesterFormatError(
      `"${value}": a második évszámnak az elsőt követő évnek kell lennie (pl. ${startYear}/${startYear + 1}/${index}).`,
    )
  }
  if (startYear < YEAR_MIN || endYear > YEAR_MAX) {
    throw new AcademicSemesterFormatError(
      `"${value}": az évszámnak ${YEAR_MIN} és ${YEAR_MAX} közé kell esnie.`,
    )
  }

  return index === 1
    ? { year: startYear, semester: 'autumn' }
    : { year: endYear, semester: 'spring' }
}

/** The inverse of {@link parseAcademicSemester}; used for every display label. */
export function formatAcademicSemester(
  year: number | null,
  semester: SemesterKey | null,
): string | null {
  if (year === null || semester === null) {
    return null
  }
  return semester === 'autumn'
    ? `${year}/${year + 1}/1`
    : `${year - 1}/${year}/2`
}

export interface MemberFieldSpec {
  name: string
  type: 'string' | 'boolean'
  required: boolean
  /** Whether an explicit `null` is accepted (optional fields always are). */
  nullable: boolean
  maxLength?: number
  enumValues?: readonly string[]
  /** RegExp source, shared verbatim with the generated OpenAPI schema. */
  pattern?: string
  default?: boolean
  description: string
  example: string | boolean | null
}

/**
 * The single source of truth for the member payload: request validation and the
 * generated OpenAPI document are both derived from this table, so the published
 * contract cannot drift away from what the server actually enforces.
 *
 * `introduction` is deliberately absent: the column still exists and is shown on
 * the public profile, but the webhook does not carry it for now. An upsert
 * therefore leaves any stored bio untouched rather than clearing it.
 */
export const MEMBER_FIELD_SPECS: readonly MemberFieldSpec[] = [
  {
    name: 'sub',
    type: 'string',
    required: true,
    nullable: false,
    maxLength: 255,
    description:
      'The value of the Authentik OIDC `sub` claim. This is what ties the member to their login, to the credit lists and to editorial data.',
    example: '42',
  },
  {
    name: 'username',
    type: 'string',
    required: true,
    nullable: false,
    maxLength: 200,
    description:
      'Unique username; also the last path segment of the public profile URL.',
    example: 'gipsz.jakab',
  },
  {
    name: 'fullName',
    type: 'string',
    required: true,
    nullable: false,
    maxLength: 200,
    description: "The member's full name as shown on the public pages.",
    example: 'Gipsz Jakab',
  },
  {
    name: 'nickname',
    type: 'string',
    required: false,
    nullable: true,
    maxLength: 200,
    description: 'Nickname; shown in parentheses next to the name.',
    example: 'Pitypang',
  },
  {
    name: 'avatarUrl',
    type: 'string',
    required: false,
    nullable: true,
    maxLength: 2048,
    pattern: '^https?://',
    description: 'Profile picture URL (http or https).',
    example: null,
  },
  {
    name: 'membershipStatus',
    type: 'string',
    required: true,
    nullable: false,
    enumValues: MEMBERSHIP_STATUS_KEYS,
    description:
      'Membership status. It decides which public list the member appears on; it grants NO permissions.',
    example: 'MEMBER',
  },
  {
    name: 'isLeadership',
    type: 'boolean',
    required: false,
    nullable: false,
    default: false,
    description:
      'Only controls whether the member is shown in the public leadership block. Actual permissions come from Authentik group membership.',
    example: false,
  },
  {
    name: 'joinedSemester',
    type: 'string',
    required: false,
    nullable: true,
    pattern: ACADEMIC_SEMESTER_PATTERN_SOURCE,
    description:
      'The semester of joining, in `YYYY/YYYY/N` form: the second year is the one following the first, and `N` is 1 (autumn) or 2 (spring).',
    example: ACADEMIC_SEMESTER_EXAMPLE,
  },
]

/** Example member object used in the docs and the generated OpenAPI examples. */
export function exampleMember(): Record<string, string | boolean | null> {
  return Object.fromEntries(
    MEMBER_FIELD_SPECS.map((spec) => [spec.name, spec.example]),
  )
}
