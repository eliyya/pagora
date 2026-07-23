import 'server-only'

import type { Prisma } from '@/db/generated/prisma/client'

export type CardChangeEntity = 'charge' | 'category' | 'payment'
export type CardChangeOperation = 'upsert' | 'delete'

export interface CardChangeInput {
    entity: CardChangeEntity
    entityId: string
    operation: CardChangeOperation
}

export async function beginCardChange(
    cardId: string,
    client: Prisma.TransactionClient,
) {
    const card = await client.card.update({
        where: { id: cardId },
        data: {
            sync_version: { increment: 1 },
        },
        select: { sync_version: true },
    })

    return card.sync_version
}

export async function recordCardChanges(
    cardId: string,
    version: number,
    changes: CardChangeInput[],
    client: Prisma.TransactionClient,
) {
    if (changes.length === 0) return null

    const latestChanges = new Map<string, CardChangeInput>()
    for (const change of changes) {
        latestChanges.set(`${change.entity}:${change.entityId}`, change)
    }

    await client.cardChange.createMany({
        data: Array.from(latestChanges.values(), (change) => ({
            card_id: cardId,
            version,
            entity: change.entity,
            entity_id: change.entityId,
            operation: change.operation,
        })),
    })

    return version
}
