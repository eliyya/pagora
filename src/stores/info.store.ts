'use client'

import { fetchInfoAction } from '@/actions/info.action'
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
}

export const useInfo = create<InfoStore>((set) => ({
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
}))
