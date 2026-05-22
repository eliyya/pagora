'use server'

import { db } from '@/db/prisma'
import { getCurrentUserAction } from './users.action'
import { Charge } from '@/db/generated/prisma/client'

type DailySummary = { date: string; payments: number; charges: number }

async function buildDailySummary(charges: Charge[]): Promise<DailySummary[]> {
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
        summary: await buildDailySummary(charges),
    }
}
