'use client'

import { getOwnCardsAction } from '@/actions/card.action'
import { Card } from '@/db/generated/prisma/browser'
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
    refresh(): void
}

export const useCards = create<CardStore>((set) => ({
    cards: [],
    refresh: () => {
        getOwnCardsAction().then((cards) => {
            set({ cards })
        })
    },
}))
