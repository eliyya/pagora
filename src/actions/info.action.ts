'use server'

import { db } from '@/db/prisma'
import { getCurrentUserAction } from './users.action'
import { getCardAccess, listCardsForUser } from '@/lib/card-access'

export async function fetchInfoAction(card_id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return null
    }
    const [cardSections, accessResult, sharedByMe, pendingInvitations] =
        await Promise.all([
            listCardsForUser(user.id),
            getCardAccess(card_id, user.id),
            db.card.findMany({
                where: {
                    owner_id: user.id,
                    OR: [
                        { members: { some: {} } },
                        { invitations: { some: { status: 'pending' } } },
                    ],
                },
                include: {
                    members: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    username: true,
                                    email: true,
                                },
                            },
                        },
                        orderBy: { created_at: 'asc' },
                    },
                    invitations: {
                        where: { status: 'pending' },
                        include: {
                            invitee: {
                                select: {
                                    id: true,
                                    username: true,
                                    email: true,
                                },
                            },
                        },
                        orderBy: { created_at: 'desc' },
                    },
                },
                orderBy: { name: 'asc' },
            }),
            db.cardInvitation.count({
                where: { invitee_id: user.id, status: 'pending' },
            }),
        ])
    const card =
        accessResult && accessResult.access !== 'none'
            ? cardSections.all.find((item) => item.id === card_id)
            : undefined
    return {
        user,
        card,
        cards: cardSections.all,
        ownCards: cardSections.own,
        sharedWithMeCards: cardSections.sharedWithMe,
        sharedByMeCards: sharedByMe,
        cardAccess: accessResult?.access ?? 'none',
        pendingInvitations,
    }
}
