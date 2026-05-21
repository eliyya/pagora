'use client'

import { fetchInfoAction } from '@/actions/info.action'
import { createChargue, paidChargeAction } from '@/actions/chargue.action'
import { Card, Charge, User } from '@/db/generated/prisma/browser'
import { create } from 'zustand'

type DailySummary = { date: string; payments: number; charges: number }

interface InfoStore {
    user: User | null
    card: Card | null
    cards: Card[]
    charges: Charge[]
    summary: DailySummary[]
    fetch(card_id: string): void
    createCharge(amount: number, name: string): Promise<void>
    paidCharge(id: string): Promise<void>
}

export const useInfo = create<InfoStore>((set, get) => ({
    user: null,
    card: null,
    cards: [],
    charges: [],
    summary: [],
    fetch: (card_id) => {
        fetchInfoAction(card_id).then((data) => {
            if (data === null) return
            set({
                user: data.user,
                card: data.card ?? null,
                cards: data.cards,
                charges: data.charges,
                summary: data.summary,
            })
        })
    },
    createCharge: async (amount, name) => {
        const card_id = get().card?.id
        if (!card_id) return
        const charge = await createChargue({ amount, name, card_id })
        const charges = [...get().charges, charge]
        const map = new Map<string, number>()
        for (const c of charges) {
            const date = c.created_at.toISOString().slice(0, 10)
            map.set(date, (map.get(date) ?? 0) + c.amount)
        }
        const summary = Array.from(map, ([date, total]) => ({
            date,
            payments: 0,
            charges: total,
        }))
        set({ charges, summary })
    },
    paidCharge: async (id) => {
        const res = await paidChargeAction(id)
        if (!res.data) return
        const paid = res.data
        const charges = get().charges.map((c) => (c.id === paid.id ? { ...c, paid: paid.paid } : c))
        set({ charges })
    },
}))
