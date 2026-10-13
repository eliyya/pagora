'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SortingState, ColumnVisibilityState, Updater } from '@tanstack/react-table'

interface TableSettings {
    pageSize: number
    sorting: SortingState
    columnVisibility: ColumnVisibilityState
    setPageSize: (size: number) => void
    setSorting: (updater: Updater<SortingState>) => void
    setColumnVisibility: (updater: Updater<ColumnVisibilityState>) => void
}

export const useTableSettings = create<TableSettings>()(persist((set) => ({
    pageSize: 20,
    sorting: [],
    columnVisibility: {},
    setPageSize: (pageSize) => set({ pageSize }),
    setSorting: (updater) => set((state) => ({ sorting: typeof updater === 'function' ? updater(state.sorting) : updater })),
    setColumnVisibility: (updater) => set((state) => ({ columnVisibility: typeof updater === 'function' ? updater(state.columnVisibility) : updater })),
}), {
    name: 'pagora-table-settings',
    skipHydration: true,
    partialize: ({ pageSize, sorting, columnVisibility }) => ({ pageSize, sorting, columnVisibility }),
}))
