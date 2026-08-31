import { eq, inArray, isNull } from 'drizzle-orm'
import { auditLog, memberCache } from '#/db/schema.ts'
import type {
  MembershipStatusKey,
  SemesterKey,
} from '#/server/config/oob-schema.ts'
import {
  AcademicSemesterFormatError,
  MEMBER_FIELD_SPECS,
  parseAcademicSemester,
} from './member-fields.ts'
import type { MemberFieldSpec } from './member-fields.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { isUniqueViolation } from '#/server/shared/pg-error.ts'
import { TextValidationError } from '#/server/shared/text.ts'

export type IngestMode = 'operations' | 'replace'

export interface MemberInput {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  membershipStatus: MembershipStatusKey
  isLeadership: boolean
  /** Internal form derived from the `ÉÉÉÉ/ÉÉÉÉ/N` payload field. */
  joinedYear: number | null
  joinedSemester: SemesterKey | null
}

export type MemberOperation =
  { op: 'upsert'; member: MemberInput } | { op: 'archive'; sub: string }

export interface MemberIngestPayload {
  mode: IngestMode
  operations: MemberOperation[]
}

export interface IngestResult {
  mode: IngestMode
  operationCount: number
  created: number
  updated: number
  archived: number
  restored: number
  unchanged: number
  /** Archives naming a member the app has never seen; not an error. */
  ignored: number
}

/** A payload that would break a database invariant (e.g. a duplicate username). */
export class MemberIngestConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberIngestConflictError'
  }
}

const COMPARED_FIELDS = [
  'username',
  'fullName',
  'nickname',
  'avatarUrl',
  'membershipStatus',
  'isLeadership',
  'joinedYear',
  'joinedSemester',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SUB_SPEC = MEMBER_FIELD_SPECS.find((spec) => spec.name === 'sub')!

function parseField(
  spec: MemberFieldSpec,
  source: Record<string, unknown>,
  path: string,
  problems: string[],
): string | boolean | null | undefined {
  const raw = source[spec.name]
  const fieldPath = `${path}.${spec.name}`

  if (raw === undefined || raw === null) {
    if (spec.required) {
      problems.push(`${fieldPath}: kötelező mező, hiányzik.`)
      return undefined
    }
    return spec.type === 'boolean' ? (spec.default ?? false) : null
  }

  if (spec.type === 'boolean') {
    if (typeof raw !== 'boolean') {
      problems.push(`${fieldPath}: logikai érték (true/false) lehet.`)
      return undefined
    }
    return raw
  }

  if (typeof raw !== 'string') {
    problems.push(
      spec.required
        ? `${fieldPath}: kötelező szövegmező.`
        : `${fieldPath}: szöveg vagy null lehet.`,
    )
    return undefined
  }

  const trimmed = raw.trim()
  if (trimmed === '') {
    if (spec.required) {
      problems.push(`${fieldPath}: kötelező szövegmező, hiányzik vagy üres.`)
      return undefined
    }
    return null
  }

  if (spec.enumValues !== undefined && !spec.enumValues.includes(trimmed)) {
    problems.push(
      `${fieldPath}: ismeretlen érték "${trimmed}". Engedélyezett: ${spec.enumValues.join(', ')}.`,
    )
    return undefined
  }

  if (spec.maxLength !== undefined && trimmed.length > spec.maxLength) {
    problems.push(
      `${fieldPath}: legfeljebb ${spec.maxLength} karakter lehet (jelenlegi hossz: ${trimmed.length}).`,
    )
    return undefined
  }

  if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(trimmed)) {
    problems.push(
      `${fieldPath}: érvénytelen formátum, az elvárt minta: ${spec.pattern}.`,
    )
    return undefined
  }

  return trimmed
}

function parseMember(
  raw: unknown,
  path: string,
  problems: string[],
): MemberInput {
  if (!isRecord(raw)) {
    problems.push(`${path}: objektum kell legyen.`)
    raw = {}
  }
  const source = raw as Record<string, unknown>

  const values: Record<string, string | boolean | null | undefined> = {}
  for (const spec of MEMBER_FIELD_SPECS) {
    values[spec.name] = parseField(spec, source, path, problems)
  }

  // `ÉÉÉÉ/ÉÉÉÉ/N` → calendar year + spring/autumn. The pattern already matched,
  // so only the "second year follows the first" rule can still fail here.
  let joinedYear: number | null = null
  let joinedSemester: SemesterKey | null = null
  const rawSemester = values['joinedSemester']
  if (typeof rawSemester === 'string') {
    try {
      const parsed = parseAcademicSemester(rawSemester)
      joinedYear = parsed.year
      joinedSemester = parsed.semester
    } catch (error) {
      if (error instanceof AcademicSemesterFormatError) {
        problems.push(`${path}.joinedSemester: ${error.message}`)
      } else {
        throw error
      }
    }
  }

  return {
    sub: typeof values['sub'] === 'string' ? values['sub'] : '',
    username: typeof values['username'] === 'string' ? values['username'] : '',
    fullName: typeof values['fullName'] === 'string' ? values['fullName'] : '',
    nickname:
      typeof values['nickname'] === 'string' ? values['nickname'] : null,
    avatarUrl:
      typeof values['avatarUrl'] === 'string' ? values['avatarUrl'] : null,
    membershipStatus: (typeof values['membershipStatus'] === 'string'
      ? values['membershipStatus']
      : 'MEMBER') as MembershipStatusKey,
    isLeadership: values['isLeadership'] === true,
    joinedYear,
    joinedSemester,
  }
}

/**
 * Validates a webhook body into a normalized operation list.
 * Every problem in the payload is reported at once, so a client can fix a
 * whole batch in one pass instead of one field per round trip.
 */
export function parseMemberIngestPayload(raw: unknown): MemberIngestPayload {
  const problems: string[] = []
  if (!isRecord(raw)) {
    throw new TextValidationError(['A kéréstörzs JSON objektum kell legyen.'])
  }

  const rawMode = raw['mode'] ?? 'operations'
  if (rawMode !== 'operations' && rawMode !== 'replace') {
    throw new TextValidationError([
      `mode: csak "operations" vagy "replace" lehet, nem "${String(rawMode)}".`,
    ])
  }
  const mode: IngestMode = rawMode

  const operations: MemberOperation[] = []

  if (mode === 'replace') {
    const members = raw['members']
    if (!Array.isArray(members)) {
      throw new TextValidationError([
        'members: "replace" módban kötelező lista (a teljes tagnévsor).',
      ])
    }
    members.forEach((member, index) => {
      operations.push({
        op: 'upsert',
        member: parseMember(member, `members[${index}]`, problems),
      })
    })
  } else {
    const rawOperations = raw['operations']
    if (!Array.isArray(rawOperations)) {
      throw new TextValidationError([
        'operations: kötelező lista (legalább egy művelettel).',
      ])
    }
    if (rawOperations.length === 0) {
      throw new TextValidationError(['operations: a lista nem lehet üres.'])
    }
    rawOperations.forEach((entry, index) => {
      const path = `operations[${index}]`
      if (!isRecord(entry)) {
        problems.push(`${path}: objektum kell legyen.`)
        return
      }
      const op = entry['op']
      if (op === 'upsert') {
        operations.push({
          op: 'upsert',
          member: parseMember(entry['member'], `${path}.member`, problems),
        })
      } else if (op === 'archive') {
        const sub = parseField(SUB_SPEC, entry, path, problems)
        operations.push({
          op: 'archive',
          sub: typeof sub === 'string' ? sub : '',
        })
      } else {
        problems.push(
          `${path}.op: csak "upsert" vagy "archive" lehet, nem "${String(op)}".`,
        )
      }
    })
  }

  const seen = new Set<string>()
  for (const operation of operations) {
    const sub = operation.op === 'upsert' ? operation.member.sub : operation.sub
    if (sub === '') {
      continue
    }
    if (seen.has(sub)) {
      problems.push(
        `sub "${sub}": egy kérésen belül csak egyszer szerepelhet (az utolsó állapot nem egyértelmű).`,
      )
    }
    seen.add(sub)
  }

  if (problems.length > 0) {
    throw new TextValidationError(problems)
  }
  return { mode, operations }
}

function differs(
  existing: typeof memberCache.$inferSelect,
  input: MemberInput,
): boolean {
  return COMPARED_FIELDS.some(
    (field) => (existing[field] ?? null) !== (input[field] ?? null),
  )
}

function snapshot(member: MemberInput | typeof memberCache.$inferSelect) {
  const source = member as Record<string, unknown>
  return Object.fromEntries(
    COMPARED_FIELDS.map((field) => [field, source[field] ?? null]),
  )
}

export interface ApplyOptions {
  actor: string
  now: Date
}

/**
 * Applies a validated payload in a single transaction: either every operation
 * lands or none does, so a partially applied roster is never observable.
 */
export async function applyMemberIngest(
  executor: Executor,
  payload: MemberIngestPayload,
  options: ApplyOptions,
): Promise<IngestResult> {
  const { actor, now } = options
  const result: IngestResult = {
    mode: payload.mode,
    operationCount: payload.operations.length,
    created: 0,
    updated: 0,
    archived: 0,
    restored: 0,
    unchanged: 0,
    ignored: 0,
  }

  const audits: Array<typeof auditLog.$inferInsert> = []
  const addAudit = (
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): void => {
    audits.push({
      actor,
      entityType: 'member_cache',
      entityId,
      action,
      beforeValue: before,
      afterValue: after,
      occurredAt: now,
    })
  }

  const subs = payload.operations.map((operation) =>
    operation.op === 'upsert' ? operation.member.sub : operation.sub,
  )
  const existingRows =
    subs.length === 0
      ? []
      : await executor
          .select()
          .from(memberCache)
          .where(inArray(memberCache.sub, subs))
  const existingBySub = new Map(existingRows.map((row) => [row.sub, row]))

  for (const operation of payload.operations) {
    if (operation.op === 'archive') {
      const existing = existingBySub.get(operation.sub)
      if (existing === undefined) {
        result.ignored += 1
        continue
      }
      if (existing.archivedAt !== null) {
        result.unchanged += 1
        continue
      }
      await executor
        .update(memberCache)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(memberCache.sub, operation.sub))
      addAudit('archive', operation.sub, snapshot(existing), null)
      result.archived += 1
      continue
    }

    const member = operation.member
    const existing = existingBySub.get(member.sub)

    if (existing === undefined) {
      await executor.insert(memberCache).values({
        sub: member.sub,
        username: member.username,
        fullName: member.fullName,
        nickname: member.nickname,
        avatarUrl: member.avatarUrl,
        membershipStatus: member.membershipStatus,
        isLeadership: member.isLeadership,
        joinedYear: member.joinedYear,
        joinedSemester: member.joinedSemester,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      })
      addAudit('create', member.sub, null, snapshot(member))
      result.created += 1
      continue
    }

    const wasArchived = existing.archivedAt !== null
    const fieldsChanged = differs(existing, member)
    if (!wasArchived && !fieldsChanged) {
      result.unchanged += 1
      continue
    }

    await executor
      .update(memberCache)
      .set({
        username: member.username,
        fullName: member.fullName,
        nickname: member.nickname,
        avatarUrl: member.avatarUrl,
        membershipStatus: member.membershipStatus,
        isLeadership: member.isLeadership,
        joinedYear: member.joinedYear,
        joinedSemester: member.joinedSemester,
        updatedAt: now,
        archivedAt: null,
      })
      .where(eq(memberCache.sub, member.sub))
    addAudit(
      wasArchived ? 'restore' : 'update',
      member.sub,
      snapshot(existing),
      snapshot(member),
    )
    if (wasArchived) {
      result.restored += 1
    } else {
      result.updated += 1
    }
  }

  if (payload.mode === 'replace') {
    const keep = new Set(subs)
    const liveRows = await executor
      .select()
      .from(memberCache)
      .where(isNull(memberCache.archivedAt))
    for (const row of liveRows) {
      if (keep.has(row.sub)) {
        continue
      }
      await executor
        .update(memberCache)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(memberCache.sub, row.sub))
      addAudit('archive', row.sub, snapshot(row), null)
      result.archived += 1
    }
  }

  if (audits.length > 0) {
    await executor.insert(auditLog).values(audits)
  }
  return result
}

/** Maps a username collision to a caller-fixable 409 instead of a 500. */
export function toIngestConflict(error: unknown): unknown {
  if (isUniqueViolation(error, 'username')) {
    return new MemberIngestConflictError(
      'A megadott felhasználónevek egyike már egy másik taghoz tartozik. A tagnév egyedi kell legyen.',
    )
  }
  return error
}
