'use client'

import { getOwnCardsAction } from '@/actions/card.action'
import { getChargesAction } from '@/actions/chargue.action'
import { Card, Charge } from '@/db/generated/prisma/browser'
import { create } from 'zustand'

interface CreateChargeDialogState {
    open: boolean
    toggle(value?: boolean): void
}
export const useCreateCardDialog = create<CreateChargeDialogState>((set) => ({
    open: false,
    toggle: (value) => {
        if (typeof value === 'boolean') {
            set({ open: value })
        } else {
            set((state) => ({ open: !state.open }))
        }
    },
}))

interface CardStore {
    cards: Omit<Card, 'created_at' | 'updated_at'>[]
    currentCardId?: string
    charges: Charge[]
    chargesCount: number
    refreshCard(): void
    refreshCharges(): Promise<void>
    setCurrentCard(id: string): void
}

export const useCards = create<CardStore>((set, get) => ({
    cards: [],
    charges: [],
    chargesCount: 0,
    setCurrentCard(card_id) {
        set({ currentCardId: card_id })
        getChargesAction({ card_id }).then(({ total, data }) => {
            set({
                charges: data,
                chargesCount: total,
            })
        })
    },
    refreshCharges: async () => {
        const card_id = get().currentCardId
        if (card_id) {
            getChargesAction({ card_id }).then(({ total, data }) => {
                set({
                    charges: data,
                    chargesCount: total,
                })
            })
        }
    },
    refreshCard: () => {
        getOwnCardsAction().then((cards) => {
            set({ cards })
        })
    },
}))
