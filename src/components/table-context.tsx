'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'
import type { Charge } from '@/db/generated/prisma/browser'

const TableContext = createContext<Table<Charge> | null>(null)

export function TableProvider({
    table,
    children,
}: {
    table: Table<Charge>
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
