/// <reference lib="esnext" />
/// <reference lib="webworker" />

import type {
    PrecacheEntry,
    RuntimeCaching,
    SerwistGlobalConfig,
} from 'serwist'
import {
    CacheFirst,
    CacheableResponsePlugin,
    ExpirationPlugin,
    NetworkOnly,
    Serwist,
} from 'serwist'

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

declare const self: ServiceWorkerGlobalScope

const networkOnly = new NetworkOnly({ networkTimeoutSeconds: 8 })

const runtimeCaching: RuntimeCaching[] = [
    {
        matcher: ({ request, sameOrigin, url }) =>
            sameOrigin &&
            request.mode !== 'navigate' &&
            (url.pathname.startsWith('/api/') ||
                url.pathname.startsWith('/auth/') ||
                request.headers.has('Next-Action') ||
                request.headers.get('RSC') === '1' ||
                request.headers.get('Next-Router-Prefetch') === '1' ||
                url.searchParams.has('_rsc')),
        handler: networkOnly,
    },
    {
        matcher: ({ request, sameOrigin, url }) =>
            sameOrigin &&
            request.mode === 'navigate' &&
            (url.pathname === '/offline' ||
                url.pathname === '/dashboard' ||
                url.pathname.startsWith('/dashboard/card/')),
        handler: networkOnly,
    },
    {
        matcher: ({ sameOrigin, url }) =>
            sameOrigin && url.pathname.startsWith('/_next/static/'),
        handler: new CacheFirst({
            cacheName: 'pagora-next-static',
            plugins: [
                new CacheableResponsePlugin({ statuses: [200] }),
                new ExpirationPlugin({
                    maxEntries: 160,
                    maxAgeSeconds: 365 * 24 * 60 * 60,
                    maxAgeFrom: 'last-used',
                }),
            ],
        }),
    },
]

const serwist = new Serwist({
    cacheId: 'pagora',
    precacheEntries: self.__SW_MANIFEST,
    precacheOptions: { cleanupOutdatedCaches: true },
    skipWaiting: false,
    clientsClaim: true,
    navigationPreload: true,
    disableDevLogs: true,
    runtimeCaching,
    fallbacks: {
        entries: [
            {
                url: '/offline',
                matcher: ({ request }) => {
                    const url = new URL(request.url)
                    return (
                        url.origin === self.location.origin &&
                        request.mode === 'navigate' &&
                        (url.pathname === '/offline' ||
                            url.pathname === '/dashboard' ||
                            url.pathname.startsWith('/dashboard/card/'))
                    )
                },
            },
        ],
    },
})

serwist.addEventListeners()
