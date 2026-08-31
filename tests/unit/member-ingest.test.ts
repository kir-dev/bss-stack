import { describe, expect, it } from 'vitest'
import { parseMemberIngestPayload } from '#/server/members/ingest.ts'

const statuses = [
  'MEMBER_CANDIDATE_CANDIDATE',
  'MEMBER_CANDIDATE',
  'MEMBER',
  'ACTIVE_ALUMNI',
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

  it('a korábbi kisbetűs értékeket elutasítja', () => {
    expect(() => parseMemberIngestPayload(payload('studio_member'))).toThrow(
      /membershipStatus/,
    )
  })
})
