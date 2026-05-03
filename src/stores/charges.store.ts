'use client'

import { getChargesAction } from '@/actions/chargue.action'
import { Charge } from '@/db/generated/prisma/browser'
import { create } from 'zustand'

interface ChargeState {
    total: number
    data: Charge[]
    setData(data: Charge[]): void
    setTotal(total: number): void
    refresh(): void
}
export const chargueStore = create<ChargeState>((set) => ({
    total: 0,
    data: [],
    setData: (data) => set({ data }),
    setTotal: (total) => set({ total }),
    refresh: () => {
        getChargesAction().then(({ total, data }) => {
            set({ total, data })
        })
    },
}))

interface CreateChargeDialogState {
    open: boolean
    toggle(value?: boolean): void
}
export const useCreateDialogState = create<CreateChargeDialogState>((set) => ({
    open: false,
    toggle: (value) => {
        if (typeof value === 'boolean') {
            set({ open: value })
        } else {
            set((state) => ({ open: !state.open }))
        }
    },
}))
