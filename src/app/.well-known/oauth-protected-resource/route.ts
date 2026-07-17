import { AGENT_SCOPES } from '@/lib/agent-tokens'

export async function GET(request: Request) {
    const origin = new URL(request.url).origin

    return Response.json({
        resource: `${origin}/api/mcp`,
        authorization_servers: [origin],
        bearer_methods_supported: ['header'],
        scopes_supported: AGENT_SCOPES,
        resource_documentation: `${origin}/api/mcp`,
    })
}
