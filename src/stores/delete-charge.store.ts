'use client'

import { create } from 'zustand'

interface DeleteChargeDialogState {
    open: boolean
    chargeId: string | null
    toggle(value?: boolean): void
    setChargeId(chargeId: string | null): void
}

export const useDeleteChargeDialogState = create<DeleteChargeDialogState>(
    (set) => ({
        open: false,
        chargeId: null,
        toggle: (value) => {
            if (typeof value === 'boolean') {
                set({ open: value })
            } else {
                set((state) => ({ open: !state.open }))
            }
        },
        setChargeId: (chargeId) => {
            set({ chargeId, open: !!chargeId })
        },
    }),
)
