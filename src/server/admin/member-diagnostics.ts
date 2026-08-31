import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { memberCache, webhookClients, webhookDeliveries } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { formatAcademicSemester } from '#/server/members/member-fields.ts'
import { listWebhookClients } from '#/server/webhooks/clients.ts'
import type { WebhookClientRecord } from '#/server/webhooks/clients.ts'

export interface DiagnosticsProfile {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  membershipStatus: string
  isLeadership: boolean
  joinedSemester: string | null
  updatedAt: Date
  /** Archived: hidden from every public listing, credits preserved. */
  archivedAt: Date | null
}

export interface DiagnosticsDelivery {
  id: number
  clientId: string
  clientName: string
  deliveryId: string | null
  mode: string
  status: string
  operationCount: number
  createdCount: number
  updatedCount: number
  archivedCount: number
  restoredCount: number
  message: string | null
  receivedAt: Date
}

export interface MemberDiagnostics {
  profiles: DiagnosticsProfile[]
  clients: WebhookClientRecord[]
  deliveries: DiagnosticsDelivery[]
  summary: {
    total: number
    active: number
    archived: number
    activeClients: number
    lastDeliveryStatus: string | null
    lastDeliveryMessage: string | null
    lastDeliveryAt: Date | null
    /** Rejected pushes in the visible delivery window — the panel's alert band. */
    recentRejections: number
  }
}

const DELIVERY_WINDOW = 20

export async function getMemberDiagnostics(
  executor: Executor,
): Promise<MemberDiagnostics> {
  const [profileRows, clients, deliveryRows] = await Promise.all([
    executor
      .select()
      .from(memberCache)
      .orderBy(asc(memberCache.fullName), asc(memberCache.sub)),
    listWebhookClients(executor),
    executor
      .select({
        id: webhookDeliveries.id,
        clientId: webhookDeliveries.clientId,
        clientName: webhookClients.name,
        deliveryId: webhookDeliveries.deliveryId,
        mode: webhookDeliveries.mode,
        status: webhookDeliveries.status,
        operationCount: webhookDeliveries.operationCount,
        createdCount: webhookDeliveries.createdCount,
        updatedCount: webhookDeliveries.updatedCount,
        archivedCount: webhookDeliveries.archivedCount,
        restoredCount: webhookDeliveries.restoredCount,
        message: webhookDeliveries.message,
        receivedAt: webhookDeliveries.receivedAt,
      })
      .from(webhookDeliveries)
      .innerJoin(
        webhookClients,
        eq(webhookClients.id, webhookDeliveries.clientId),
      )
      .orderBy(desc(webhookDeliveries.receivedAt), desc(webhookDeliveries.id))
      .limit(DELIVERY_WINDOW),
  ])

  const deliveries: DiagnosticsDelivery[] = deliveryRows

  const archivedRows = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(memberCache)
    .where(isNotNull(memberCache.archivedAt))
  const archived = archivedRows.at(0)?.count ?? 0

  const last = deliveries.at(0)
  return {
    profiles: profileRows.map((profile) => ({
      sub: profile.sub,
      username: profile.username,
      fullName: profile.fullName,
      nickname: profile.nickname,
      membershipStatus: profile.membershipStatus,
      isLeadership: profile.isLeadership,
      joinedSemester: formatAcademicSemester(
        profile.joinedYear,
        profile.joinedSemester,
      ),
      updatedAt: profile.updatedAt,
      archivedAt: profile.archivedAt,
    })),
    clients,
    deliveries,
    summary: {
      total: profileRows.length,
      active: profileRows.length - archived,
      archived,
      activeClients: clients.filter((client) => client.revokedAt === null)
        .length,
      lastDeliveryStatus: last?.status ?? null,
      lastDeliveryMessage: last?.message ?? null,
      lastDeliveryAt: last?.receivedAt ?? null,
      recentRejections: deliveries.filter(
        (delivery) => delivery.status === 'rejected',
      ).length,
    },
  }
}
