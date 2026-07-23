import { db } from '@/db/prisma'
import type {
    Card,
    CardPermission,
    Prisma,
} from '@/db/generated/prisma/client'

export type CardAccessLevel = 'none' | 'read' | 'write' | 'owner'

export type CardWithAccess = Card & {
    access: CardAccessLevel
    sharedBy?: {
        id: string
        username: string
        email: string
    }
}

export function canReadCard(access: CardAccessLevel) {
    return access === 'read' || access === 'write' || access === 'owner'
}

export function canWriteCard(access: CardAccessLevel) {
    return access === 'write' || access === 'owner'
}

export function normalizeCardPermission(permission: unknown): CardPermission {
    return permission === 'write' ? 'write' : 'read'
}

type CardAccessClient = Pick<Prisma.TransactionClient, 'card'>

export async function getCardAccess(
    cardId: string,
    userId: string,
    client: CardAccessClient = db,
) {
    const card = await client.card.findFirst({
        where: { id: cardId },
        include: {
            owner: {
                select: {
                    id: true,
                    username: true,
                    email: true,
                },
            },
            members: {
                where: { user_id: userId },
                take: 1,
            },
        },
    })

    if (!card) return null

    const access: CardAccessLevel =
        card.owner_id === userId
            ? 'owner'
            : card.members[0]?.permission === 'write'
              ? 'write'
              : card.members[0]?.permission === 'read'
                ? 'read'
                : 'none'

    return { card, access }
}

export async function assertCardReadable(cardId: string, userId: string) {
    const result = await getCardAccess(cardId, userId)
    if (!result || !canReadCard(result.access)) {
        throw new Error('card not found')
    }
    return result
}

export async function assertCardWritable(cardId: string, userId: string) {
    const result = await getCardAccess(cardId, userId)
    if (!result || !canWriteCard(result.access)) {
        throw new Error('card not found')
    }
    return result
}

export async function assertCardOwner(cardId: string, userId: string) {
    const result = await getCardAccess(cardId, userId)
    if (!result || result.access !== 'owner') {
        throw new Error('card not found')
    }
    return result
}

export async function listCardsForUser(userId: string) {
    const [ownCards, sharedMemberships] = await Promise.all([
        db.card.findMany({
            where: { owner_id: userId },
            orderBy: { name: 'asc' },
        }),
        db.cardMember.findMany({
            where: { user_id: userId },
            include: {
                card: {
                    include: {
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                            },
                        },
                    },
                },
            },
            orderBy: { card: { name: 'asc' } },
        }),
    ])

    const own = ownCards.map((card) => ({
        ...card,
        access: 'owner' as const,
    }))
    const sharedWithMe = sharedMemberships.map((membership) => ({
        ...membership.card,
        access: membership.permission,
        sharedBy: membership.card.owner,
    }))

    return {
        own,
        sharedWithMe,
        all: [...own, ...sharedWithMe],
    }
}
