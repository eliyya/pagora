'use client'

import { create } from 'zustand'
import { Charge } from '@/db/generated/prisma/browser'

interface EditChargeDialogState {
    open: boolean
    charge: Charge | null
    toggle(value?: boolean): void
    setCharge(charge: Charge | null): void
}

export const useEditChargeDialogState = create<EditChargeDialogState>((set) => ({
    open: false,
    charge: null,
    toggle: (value) => {
        if (typeof value === 'boolean') {
            set({ open: value })
        } else {
            set((state) => ({ open: !state.open }))
        }
    },
    setCharge: (charge) => {
        set({ charge, open: !!charge })
    },
}))
