'use server'

import { db } from '@/db/prisma'
import { getCurrentUserAction } from './users.actionl'
import { Charge } from '@/db/generated/prisma/client'

type DailySummary = { date: string; payments: number; charges: number }

function buildDailySummary(charges: Charge[]): DailySummary[] {
    const map = new Map<string, number>()
    for (const c of charges) {
        const date = c.created_at.toISOString().slice(0, 10)
        map.set(date, (map.get(date) ?? 0) + c.amount)
    }
    return Array.from(map, ([date, charges]) => ({
        date,
        payments: 0,
        charges,
    }))
}

export async function fetchInfoAction(card_id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return null
    }
    const cards = await db.card.findMany({
        where: { owner_id: user.id },
    })
    const card = cards.find((c) => c.id === card_id)
    let charges: Charge[] = []
    if (card) {
        charges = await db.charge.findMany({
            where: { card_id },
        })
    }
    return {
        user,
        card,
        cards,
        charges,
        summary: buildDailySummary(charges),
    }
}
