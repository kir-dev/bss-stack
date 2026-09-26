import { describe, expect, it } from 'vitest'
import { parseMemberIngestPayload } from '#/server/members/ingest.ts'

const statuses = [
  'MEMBER_CANDIDATE_CANDIDATE',
  'MEMBER_CANDIDATE',
  'MEMBER',
  'ALUMNI',
] as const

function payload(membershipStatus: string) {
  return {
    operations: [
      {
        op: 'upsert',
        member: {
          sub: 'sub-1',
          username: 'tag',
          fullName: 'Teszt Tag',
          membershipStatus,
        },
      },
    ],
  }
}

describe('membership webhook tagsági státusz', () => {
  it.each(statuses)('%s elfogadott', (status) => {
    const parsed = parseMemberIngestPayload(payload(status))
    const operation = parsed.operations[0]
    expect(operation.op).toBe('upsert')
    if (operation.op === 'upsert') {
      expect(operation.member.membershipStatus).toBe(status)
    }
  })

  it('a megszűnt ACTIVE_ALUMNI értéket elutasítja', () => {
    expect(() => parseMemberIngestPayload(payload('ACTIVE_ALUMNI'))).toThrow(
      /membershipStatus/,
    )
  })

  it('a korábbi kisbetűs értékeket elutasítja', () => {
    expect(() => parseMemberIngestPayload(payload('studio_member'))).toThrow(
      /membershipStatus/,
    )
  })
})

function rolePayload(leadershipRole: unknown) {
  return {
    operations: [
      {
        op: 'upsert',
        member: {
          sub: 'sub-1',
          username: 'tag',
          fullName: 'Teszt Tag',
          membershipStatus: 'MEMBER',
          leadershipRole,
        },
      },
    ],
  }
}

function parsedRole(leadershipRole: unknown): string | null {
  const operation = parseMemberIngestPayload(rolePayload(leadershipRole))
    .operations[0]
  if (operation.op !== 'upsert') {
    throw new Error('upsert műveletet vártunk')
  }
  return operation.member.leadershipRole
}

describe('membership webhook vezetőségi pozíció', () => {
  it('szabad szöveges pozíciót fogad el', () => {
    expect(parsedRole('Stúdióvezető-helyettes')).toBe('Stúdióvezető-helyettes')
  })

  it('levágja a felesleges szóközöket', () => {
    expect(parsedRole('  IT felelős  ')).toBe('IT felelős')
  })

  it('elhagyva, null vagy üres szöveg esetén nincs pozíció', () => {
    expect(parsedRole(undefined)).toBeNull()
    expect(parsedRole(null)).toBeNull()
    expect(parsedRole('   ')).toBeNull()
  })

  it('a 200 karakternél hosszabb pozíciót elutasítja', () => {
    expect(() => parsedRole('x'.repeat(201))).toThrow(/legfeljebb 200/)
  })

  it('nem szöveges értéket elutasít', () => {
    expect(() => parsedRole(true)).toThrow(/leadershipRole/)
    expect(() => parsedRole(['PR felelős'])).toThrow(/leadershipRole/)
  })
})
