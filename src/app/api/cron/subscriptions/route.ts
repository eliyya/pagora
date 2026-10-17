import { generateSubscriptionCharges } from '@/lib/subscription-charges'
import { runSubscriptionCron, validCronAuthorization } from '@/lib/subscription-cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        console.error('Subscription cron: CRON_SECRET is missing')
        return Response.json({ error: 'Cron is not configured' }, { status: 503, headers })
    }
    if (!validCronAuthorization(request.headers.get('authorization'), secret)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
    }
    try {
        const result = await runSubscriptionCron(generateSubscriptionCharges)
        console.info('Subscription cron finished', result)
        return Response.json(result, { status: result.complete ? 200 : 503, headers })
    } catch (error) {
        console.error('Subscription cron failed', error)
        return Response.json({ error: 'Subscription generation failed' }, { status: 500, headers })
    }
}

// Next otherwise implements HEAD by invoking GET, which would generate charges.
export async function HEAD() {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } })
}
