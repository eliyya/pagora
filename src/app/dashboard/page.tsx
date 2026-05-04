import { Suspense } from 'react'
import { ChargesTable } from '../chargues-table'

export default function page() {
    return (
        <Suspense>
            <ChargesTable />
        </Suspense>
    )
}
