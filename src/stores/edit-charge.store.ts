'use client'

import { create } from 'zustand'
import { Charge, ChargeCategory } from '@/db/generated/prisma/browser'

type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

interface EditChargeDialogState {
    open: boolean
    charge: ChargeWithCategory | null
    toggle(value?: boolean): void
    setCharge(charge: ChargeWithCategory | null): void
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
