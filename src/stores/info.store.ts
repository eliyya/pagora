'use client'

import { fetchInfoAction } from '@/actions/info.action'
import {
    createChargue,
    paidChargeAction,
    batchPayChargesAction,
    updateChargeAction,
    deleteChargeAction,
} from '@/actions/chargue.action'
import { getCardSectionsAction } from '@/actions/card.action'
import { Card, Charge, User } from '@/db/generated/prisma/browser'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type DailySummary = { date: string; payments: number; charges: number }
type CardAccessLevel = 'none' | 'read' | 'write' | 'owner'
type CardItem = Card & {
    access?: CardAccessLevel
    sharedBy?: {
        id: string
        username: string
        email: string
    }
}
type SharedByMeCard = Awaited<
    ReturnType<typeof getCardSectionsAction>
>['sharedByMe'][number]

interface InfoStore {
    user: User | null
    card: CardItem | null
    cards: CardItem[]
    ownCards: CardItem[]
    sharedWithMeCards: CardItem[]
    sharedByMeCards: SharedByMeCard[]
    cardAccess: CardAccessLevel
    cardVersion: string | null
    pendingInvitations: number
    charges: Charge[]
    summary: DailySummary[]
    pageSize: number
    fetch(card_id: string): Promise<void>
    refreshCards(): Promise<void>
    createCharge(amount: number, name: string): Promise<void>
    updateCharge(id: string, name: string, amount: number): Promise<void>
    deleteCharge(id: string): Promise<void>
    paidCharge(id: string): Promise<void>
    batchPayCharges(amount: number): Promise<void>
    setPageSize(size: number): void
}

export const useInfo = create<InfoStore>()(
    persist(
        (set, get) => ({
            user: null,
            card: null,
            cards: [],
            ownCards: [],
            sharedWithMeCards: [],
            sharedByMeCards: [],
            cardAccess: 'none',
            cardVersion: null,
            pendingInvitations: 0,
            charges: [],
            summary: [],
            pageSize: 10,
            fetch: async (card_id) => {
                const data = await fetchInfoAction(card_id)
                if (data === null) return
                set({
                    user: data.user,
                    card: data.card ?? null,
                    cards: data.cards,
                    ownCards: data.ownCards,
                    sharedWithMeCards: data.sharedWithMeCards,
                    cardAccess: data.cardAccess,
                    cardVersion: data.cardVersion,
                    pendingInvitations: data.pendingInvitations,
                    charges: data.charges,
                    summary: data.summary,
                })
                await get().refreshCards()
            },
            refreshCards: async () => {
                const sections = await getCardSectionsAction()
                set({
                    cards: [...sections.own, ...sections.sharedWithMe],
                    ownCards: sections.own,
                    sharedWithMeCards: sections.sharedWithMe,
                    sharedByMeCards: sections.sharedByMe,
                    pendingInvitations: sections.pendingInvitations,
                })
            },
            createCharge: async (amount, name) => {
                const access = get().cardAccess
                if (access !== 'owner' && access !== 'write') return
                const card_id = get().card?.id
                if (!card_id) return
                const charge = await createChargue({ amount, name, card_id })
                const charges = [charge, ...get().charges]
                const oldSummary = get().summary
                const map = new Map(oldSummary.map((s) => [s.date, { ...s }]))
                for (const c of charges) {
                    const date = c.created_at.toISOString().slice(0, 10)
                    const entry = map.get(date) ?? {
                        date,
                        payments: 0,
                        charges: 0,
                    }
                    entry.charges += c.amount / 100
                    map.set(date, entry)
                }
                const summary = Array.from(map.values()).sort((a, b) =>
                    a.date.localeCompare(b.date),
                )
                set({ charges, summary })
            },
            updateCharge: async (id, name, amount) => {
                const access = get().cardAccess
                if (access !== 'owner' && access !== 'write') return
                const res = await updateChargeAction(id, { name, amount })
                if (!res.data) return
                const updated = res.data
                const charges = get().charges.map((c) =>
                    c.id === updated.id ? updated : c,
                )
                set({ charges })
            },
            deleteCharge: async (id) => {
                const access = get().cardAccess
                if (access !== 'owner' && access !== 'write') return
                const res = await deleteChargeAction(id)
                if (!res.data) return
                const charges = get().charges.filter((c) => c.id !== id)
                const oldSummary = get().summary
                const deletedCharge = get().charges.find((c) => c.id === id)
                const map = new Map(oldSummary.map((s) => [s.date, { ...s }]))
                if (deletedCharge) {
                    const date = deletedCharge.created_at.toISOString().slice(0, 10)
                    const entry = map.get(date)
                    if (entry) {
                        entry.charges -= deletedCharge.amount / 100
                        if (entry.charges < 0) entry.charges = 0
                    }
                }
                const summary = Array.from(map.values()).sort((a, b) =>
                    a.date.localeCompare(b.date),
                )
                set({ charges, summary })
            },
            paidCharge: async (id) => {
                const access = get().cardAccess
                if (access !== 'owner' && access !== 'write') return
                const res = await paidChargeAction(id)
                if (!res.data) return
                const paid = res.data
                const paymentAmount = res.paymentAmount ?? 0
                const charges = get().charges.map((c) =>
                    c.id === paid.id ? { ...c, paid: paid.paid } : c,
                )
                const charge = charges.find((c) => c.id === id)
                const summary = get().summary.map((s) => ({ ...s }))
                if (charge && paymentAmount > 0) {
                    const date = charge.created_at.toISOString().slice(0, 10)
                    const existing = summary.find((s) => s.date === date)
                    if (existing) {
                        existing.payments += paymentAmount / 100
                    } else {
                        summary.push({
                            date,
                            payments: paymentAmount / 100,
                            charges: 0,
                        })
                    }
                    summary.sort((a, b) => a.date.localeCompare(b.date))
                }
                set({ charges, summary })
            },
            batchPayCharges: async (amount) => {
                const access = get().cardAccess
                if (access !== 'owner' && access !== 'write') return
                const card_id = get().card?.id
                if (!card_id || amount <= 0) return
                const res = await batchPayChargesAction(card_id, amount)
                if (!res.data) return
                const map = new Map(res.data.map((c) => [c.id, c]))
                const charges = get().charges.map((c) => map.get(c.id) ?? c)
                const summary = get().summary.map((s) => ({ ...s }))
                if (res.payments) {
                    for (const p of res.payments) {
                        const date = p.chargeDate.toISOString().slice(0, 10)
                        const existing = summary.find((s) => s.date === date)
                        if (existing) {
                            existing.payments += p.amount / 100
                        } else {
                            summary.push({
                                date,
                                payments: p.amount / 100,
                                charges: 0,
                            })
                        }
                    }
                    summary.sort((a, b) => a.date.localeCompare(b.date))
                }
                set({ charges, summary })
            },
            setPageSize: (size: number) => set({ pageSize: size }),
        }),
        {
            name: 'info-storage',
        },
    ),
)
