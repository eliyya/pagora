'use client'

import { SerwistProvider } from '@serwist/turbopack/react'
import { useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
    OFFLINE_SESSION_READY_EVENT,
    readOfflineReadySession,
} from '@/lib/client-card-cache'

const READY_NOTICE_KEY = 'pagora:offline-ready-notice:v1'

function OfflineReadiness({ enabled }: { enabled: boolean }) {
    useEffect(() => {
        if (!enabled || !('serviceWorker' in navigator)) return

        let cancelled = false
        async function announceWhenReady() {
            await navigator.serviceWorker.ready
            if (cancelled || !(await readOfflineReadySession())) return
            try {
                await navigator.storage?.persist?.()
            } catch {
                // Persistence is best-effort; the browser owns this decision.
            }

            try {
                if (localStorage.getItem(READY_NOTICE_KEY) !== 'shown') {
                    localStorage.setItem(READY_NOTICE_KEY, 'shown')
                    toast.success('Pagora ya está disponible sin conexión.')
                }
            } catch {
                // Readiness does not depend on localStorage being available.
            }
        }

        const handleOfflineSessionReady = () => void announceWhenReady()
        window.addEventListener(
            OFFLINE_SESSION_READY_EVENT,
            handleOfflineSessionReady,
        )
        void announceWhenReady()

        return () => {
            cancelled = true
            window.removeEventListener(
                OFFLINE_SESSION_READY_EVENT,
                handleOfflineSessionReady,
            )
        }
    }, [enabled])

    return null
}

export function PwaProvider({ children }: { children: ReactNode }) {
    const enabled = process.env.NODE_ENV === 'production'

    return (
        <SerwistProvider
            swUrl='/serwist/sw.js'
            disable={!enabled}
            cacheOnNavigation={false}
            reloadOnOnline={false}
            options={{ scope: '/', updateViaCache: 'none', type: 'module' }}
        >
            <OfflineReadiness enabled={enabled} />
            {children}
        </SerwistProvider>
    )
}
