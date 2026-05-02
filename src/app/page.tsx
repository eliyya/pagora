import { DataTable } from '@/components/ui/data-table'
import { columns } from './columns'
import { Suspense } from 'react'

type Payment = {
    id: string
    amount: number
    status: 'pending' | 'processing' | 'success' | 'failed'
    email: string
}

export const payments: Payment[] = [
    {
        id: '728ed52f',
        amount: 100,
        status: 'pending',
        email: 'em@example.com',
    },
    {
        id: '489e1d42',
        amount: 125,
        status: 'processing',
        email: 'example@gmail.com',
    },
    // ...
]

export default function Home() {
    return (
        <div className='flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black'>
            <main className='flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start'>
                <Suspense>
                    <DataTable columns={columns} data={payments} />
                </Suspense>
            </main>
        </div>
    )
}
