import { createSerwistRoute } from '@serwist/turbopack'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type ClientReferenceManifest = {
    clientModules?: Record<string, { chunks?: unknown[] }>
    entryCSSFiles?: Record<string, Array<{ path?: unknown }>>
    entryJSFiles?: Record<string, unknown[]>
}

type BuildManifest = {
    polyfillFiles?: unknown[]
    rootMainFiles?: unknown[]
}

type FontManifest = {
    app?: Record<string, unknown[]>
}

function readJson<T>(relativePath: string) {
    return JSON.parse(
        readFileSync(
            join(
                /* turbopackIgnore: true */ process.cwd(),
                relativePath,
            ),
            'utf8',
        ),
    ) as T
}

function addNextAsset(assets: Set<string>, value: unknown) {
    if (typeof value !== 'string') return
    if (value.startsWith('/_next/static/')) {
        assets.add(value)
    } else if (value.startsWith('static/')) {
        assets.add(`/_next/${value}`)
    }
}

function readOfflineAssets() {
    const clientReferenceSource = readFileSync(
        join(
            /* turbopackIgnore: true */ process.cwd(),
            '.next/server/app/offline/page_client-reference-manifest.js',
        ),
        'utf8',
    )
    const assignmentMarker =
        'globalThis.__RSC_MANIFEST["/offline/page"] ='
    const assignmentStart = clientReferenceSource.indexOf(assignmentMarker)
    const jsonStart = clientReferenceSource.indexOf(
        '{',
        assignmentStart + assignmentMarker.length,
    )
    const jsonEnd = clientReferenceSource.lastIndexOf('};') + 1
    if (
        assignmentStart < 0 ||
        jsonStart < assignmentStart ||
        jsonEnd <= jsonStart
    ) {
        throw new Error('Could not read the offline client manifest')
    }

    const clientManifest = JSON.parse(
        clientReferenceSource.slice(jsonStart, jsonEnd),
    ) as ClientReferenceManifest
    const buildManifest = readJson<BuildManifest>(
        '.next/build-manifest.json',
    )
    const fontManifest = readJson<FontManifest>(
        '.next/server/app/offline/page/next-font-manifest.json',
    )
    const assets = new Set<string>()

    for (const clientModule of Object.values(
        clientManifest.clientModules ?? {},
    )) {
        for (const chunk of clientModule.chunks ?? []) {
            addNextAsset(assets, chunk)
        }
    }
    for (const files of Object.values(clientManifest.entryJSFiles ?? {})) {
        for (const file of files) addNextAsset(assets, file)
    }
    for (const files of Object.values(clientManifest.entryCSSFiles ?? {})) {
        for (const file of files) addNextAsset(assets, file.path)
    }
    for (const file of buildManifest.rootMainFiles ?? []) {
        addNextAsset(assets, file)
    }
    for (const file of buildManifest.polyfillFiles ?? []) {
        addNextAsset(assets, file)
    }
    for (const files of Object.values(fontManifest.app ?? {})) {
        for (const file of files) addNextAsset(assets, file)
    }

    if (assets.size === 0) {
        throw new Error('The offline shell has no discoverable Next.js assets')
    }
    return assets
}

const revision = process.env.PWA_BUILD_ID?.trim()

if (!revision) {
    throw new Error('PWA_BUILD_ID is required to version the offline shell')
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
    createSerwistRoute({
        additionalPrecacheEntries: [
            { url: '/offline', revision },
            { url: '/manifest.webmanifest', revision },
        ],
        globPatterns: [
            '.next/static/**/*.{js,css,woff,woff2}',
            'public/icon-192.png',
            'public/icon-512.png',
        ],
        manifestTransforms: [
            async (entries) => {
                const requiredAssets = readOfflineAssets()
                const manifest = entries.filter((entry) => {
                    if (!entry.url.startsWith('.next/static/')) return true
                    const publicUrl = `/_next/${entry.url.slice('.next/'.length)}`
                    return requiredAssets.has(publicUrl)
                })
                const includedAssets = new Set(
                    manifest
                        .filter((entry) =>
                            entry.url.startsWith('.next/static/'),
                        )
                        .map(
                            (entry) =>
                                `/_next/${entry.url.slice('.next/'.length)}`,
                        ),
                )
                const missingAssets = [...requiredAssets].filter(
                    (asset) => !includedAssets.has(asset),
                )
                if (missingAssets.length > 0) {
                    throw new Error(
                        `Offline shell assets are missing from the precache: ${missingAssets.join(', ')}`,
                    )
                }
                return { manifest, warnings: [] }
            },
        ],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        swSrc: 'src/app/sw.ts',
        useNativeEsbuild: true,
        esbuildOptions: {
            target: 'es2022',
            minify: true,
        },
    })
