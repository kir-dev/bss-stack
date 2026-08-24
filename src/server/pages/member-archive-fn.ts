import { createServerFn } from '@tanstack/react-start'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getMemberArchivePage } from './members.ts'
import type { ArchiveKind } from './members.ts'

export const loadArchiveMembersServer = createServerFn({ method: 'GET' })
  .validator((input: { kind: ArchiveKind; page?: number }) => input)
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getMemberArchivePage(db, data.kind, { page: data.page })
  })
