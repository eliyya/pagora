import packageJson from '../../package.json'

export function getMcpVersion(request?: Request) {
    const origin = request ? new URL(request.url).origin : undefined
    const vercelUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : undefined

    return {
        name: 'pagora',
        mcp_version: packageJson.version,
        protocol_version: '2025-11-25',
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'local',
        git: {
            commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
            commit_ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
            commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
        },
        deployment: {
            id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
            url: vercelUrl ?? origin ?? null,
        },
    }
}
