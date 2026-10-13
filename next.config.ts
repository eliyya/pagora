import type { NextConfig } from 'next'
import { withSerwist } from '@serwist/turbopack'
import { randomUUID } from 'node:crypto'

const githubBuildId = [
    process.env.GITHUB_RUN_ID?.trim(),
    process.env.GITHUB_RUN_ATTEMPT?.trim(),
    process.env.GITHUB_SHA?.trim(),
]
    .filter(Boolean)
    .join('-')

const pwaBuildId =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    githubBuildId ||
    randomUUID()

const nextConfig: NextConfig = {
    deploymentId: process.env.NODE_ENV === 'development'
        ? 'pagora-dev-payment-type-1'
        : pwaBuildId,
    allowedDevOrigins: ['dev.eliyya.dev'],
    env: {
        PWA_BUILD_ID: pwaBuildId,
    },
    async headers() {
        return [
            {
                source: '/serwist/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: "default-src 'self'; script-src 'self'",
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                ],
            },
        ]
    },
}

export default process.env.NODE_ENV === 'development'
    ? nextConfig
    : withSerwist(nextConfig)
