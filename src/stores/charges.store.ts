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
    createDialogOpened: boolean
    togleCreateDialog(value?: boolean): void
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
    createDialogOpened: false,
    togleCreateDialog: (value) => {
        if (typeof value === 'boolean') {
            set({ createDialogOpened: value })
        } else {
            set((state) => ({ createDialogOpened: !state.createDialogOpened }))
        }
    },
}))
