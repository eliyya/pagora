'use client'

import { create } from 'zustand'

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
