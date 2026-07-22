'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'
import type { ChargeWithCategory } from '@/stores/info.store'

const TableContext = createContext<Table<ChargeWithCategory> | null>(null)

export function TableProvider({
    table,
    children,
}: {
    table: Table<ChargeWithCategory>
    children: ReactNode
}) {
    return (
        <TableContext.Provider value={table}>
            {children}
        </TableContext.Provider>
    )
}

export function useTableContext() {
    const table = useContext(TableContext)
    if (!table) throw new Error('useTableContext must be used within TableProvider')
    return table
}
