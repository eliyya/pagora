import { getMcpVersion } from '@/lib/mcp-version'

export async function GET(request: Request) {
    return Response.json(getMcpVersion(request))
}
