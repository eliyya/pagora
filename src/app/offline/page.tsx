import type { Metadata } from 'next'

import { OfflineDashboard } from '@/components/offline-dashboard'

export const metadata: Metadata = {
    title: 'Modo sin conexión',
    robots: { index: false, follow: false },
}

export default function OfflinePage() {
    return <OfflineDashboard />
}
