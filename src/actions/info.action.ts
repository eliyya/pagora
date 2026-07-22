'use server'

import { db } from '@/db/prisma'
import { getCurrentUserAction } from './users.action'
import { Charge, ChargeCategory } from '@/db/generated/prisma/client'
import { getCardAccess, listCardsForUser } from '@/lib/card-access'

type DailySummary = { date: string; payments: number; charges: number }
type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

async function buildDailySummary(charges: ChargeWithCategory[]): Promise<DailySummary[]> {
    const map = new Map<string, { payments: number; charges: number }>()

    for (const c of charges) {
        const date = c.created_at.toISOString().slice(0, 10)
        const entry = map.get(date) ?? { payments: 0, charges: 0 }
        entry.charges += c.amount / 100
        map.set(date, entry)
    }

    if (charges.length > 0) {
        const chargeIds = charges.map(c => c.id)
        const paymentLogs = await db.paymentLog.findMany({
            where: {
                charge_id: { in: chargeIds },
                status: 'success',
            },
        })
        for (const pl of paymentLogs) {
            const date = pl.created_at.toISOString().slice(0, 10)
            const entry = map.get(date) ?? { payments: 0, charges: 0 }
            entry.payments += pl.amount / 100
            map.set(date, entry)
        }
    }

    return Array.from(map, ([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchInfoAction(card_id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return null
    }
    const cardSections = await listCardsForUser(user.id)
    const accessResult = await getCardAccess(card_id, user.id)
    const card =
        accessResult && accessResult.access !== 'none'
            ? cardSections.all.find((item) => item.id === card_id)
            : undefined
    let charges: ChargeWithCategory[] = []
    let categories: Awaited<ReturnType<typeof db.chargeCategory.findMany>> = []
    if (card) {
        charges = await db.charge.findMany({
            where: { card_id },
            include: { category: true },
            orderBy: { created_at: 'desc' },
        })
        categories = await db.chargeCategory.findMany({
            where: { card_id },
            orderBy: { name: 'asc' },
        })
    }
    return {
        user,
        card,
        cards: cardSections.all,
        ownCards: cardSections.own,
        sharedWithMeCards: cardSections.sharedWithMe,
        cardAccess: accessResult?.access ?? 'none',
        cardVersion: card?.updated_at.toISOString() ?? null,
        charges,
        categories,
        summary: await buildDailySummary(charges),
        pendingInvitations: await db.cardInvitation.count({
            where: { invitee_id: user.id, status: 'pending' },
        }),
    }
}

export async function getCardVersionAction(card_id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return null
    }

    const accessResult = await getCardAccess(card_id, user.id)
    if (!accessResult || accessResult.access === 'none') {
        return null
    }

    return accessResult.card.updated_at.toISOString()
}
