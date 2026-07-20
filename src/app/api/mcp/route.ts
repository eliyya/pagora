import { db } from '@/db/prisma'
import {
    AgentAuthError,
    agentUnauthorizedResponse,
    assertAgentScope,
    getAgentTokenFromRequest,
    type AgentTokenRecord,
} from '@/lib/agent-tokens'
import {
    assertCardReadable,
    assertCardWritable,
    listCardsForUser,
} from '@/lib/card-access'
import { getMcpVersion } from '@/lib/mcp-version'

type JsonRpcId = string | number | null

interface JsonRpcRequest {
    jsonrpc?: '2.0'
    id?: JsonRpcId
    method?: string
    params?: unknown
}

interface ToolCallParams {
    name?: string
    arguments?: Record<string, unknown>
}

function jsonRpcResult(id: JsonRpcId, result: unknown) {
    return Response.json({
        jsonrpc: '2.0',
        id,
        result,
    })
}

function jsonRpcError(
    id: JsonRpcId,
    code: number,
    message: string,
    data?: unknown,
) {
    return Response.json({
        jsonrpc: '2.0',
        id,
        error: { code, message, data },
    })
}

function textContent(data: unknown) {
    return {
        content: [
            {
                type: 'text',
                text:
                    typeof data === 'string'
                        ? data
                        : JSON.stringify(data, null, 2),
            },
        ],
    }
}

function getString(args: Record<string, unknown>, key: string) {
    const value = args[key]
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${key} is required`)
    }
    return value.trim()
}

function getMoneyAmount(args: Record<string, unknown>, key: string) {
    const raw = args[key]
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${key} must be a positive number`)
    }
    const cents = Math.round(value * 100)
    if (Math.abs(value * 100 - cents) > 1e-6) {
        throw new Error(`${key} supports up to 2 decimal places`)
    }
    return cents
}

function serializeMoney(cents: number) {
    return cents / 100
}

async function listCards(token: AgentTokenRecord) {
    assertAgentScope(token, 'cards:read')
    const sections = await listCardsForUser(token.user_id)
    return textContent({
        cards: sections.all.map((card) => ({
            ...card,
            credit_limit: serializeMoney(card.credit_limit),
        })),
        own_cards: sections.own.map((card) => card.id),
        shared_with_me_cards: sections.sharedWithMe.map((card) => card.id),
    })
}

async function listCharges(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'charges:read')
    const cardId =
        typeof args.card_id === 'string' && args.card_id.trim().length > 0
            ? args.card_id.trim()
            : undefined

    if (cardId) {
        await assertCardReadable(cardId, token.user_id)
    }

    const readableCards = await listCardsForUser(token.user_id)
    const charges = await db.charge.findMany({
        where: {
            card_id: cardId,
            card: cardId
                ? undefined
                : { id: { in: readableCards.all.map((card) => card.id) } },
        },
        orderBy: { created_at: 'asc' },
    })

    return textContent({
        charges: charges.map((charge) => ({
            ...charge,
            amount: serializeMoney(charge.amount),
            paid: serializeMoney(charge.paid),
            pending: serializeMoney(charge.amount - charge.paid),
        })),
    })
}

async function createCharge(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'charges:write')
    const cardId = getString(args, 'card_id')
    const name = getString(args, 'name')
    const amount = getMoneyAmount(args, 'amount')

    await assertCardWritable(cardId, token.user_id)

    const charge = await db.charge.create({
        data: {
            card_id: cardId,
            name,
            amount,
        },
    })

    return textContent({
        charge: {
            ...charge,
            amount: serializeMoney(charge.amount),
            paid: serializeMoney(charge.paid),
            pending: serializeMoney(charge.amount - charge.paid),
        },
    })
}

async function payCharge(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'payments:write')
    const chargeId = getString(args, 'charge_id')

    const charge = await db.charge.findFirst({ where: { id: chargeId } })
    if (!charge) throw new Error('charge not found')
    await assertCardWritable(charge.card_id, token.user_id)

    const paymentAmount = charge.amount - charge.paid
    if (paymentAmount <= 0) {
        return textContent({ charge_id: chargeId, payment_amount: 0 })
    }

    const updated = await db.$transaction(async (tx) => {
        const paid = await tx.charge.update({
            where: { id: chargeId },
            data: { paid: charge.amount },
        })
        await tx.paymentLog.create({
            data: {
                charge_id: chargeId,
                amount: paymentAmount,
                status: 'success',
            },
        })
        return paid
    })

    return textContent({
        charge: {
            ...updated,
            amount: serializeMoney(updated.amount),
            paid: serializeMoney(updated.paid),
            pending: serializeMoney(updated.amount - updated.paid),
        },
        payment_amount: serializeMoney(paymentAmount),
    })
}

async function payCardAmount(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'payments:write')
    const cardId = getString(args, 'card_id')
    let remaining = getMoneyAmount(args, 'amount')

    await assertCardWritable(cardId, token.user_id)

    const payments = await db.$transaction(async (tx) => {
        const charges = await tx.charge.findMany({
            where: { card_id: cardId },
            orderBy: { created_at: 'asc' },
        })
        const applied: Array<{
            charge_id: string
            charge_name: string
            amount: number
        }> = []

        for (const charge of charges) {
            if (remaining <= 0) break
            const owed = charge.amount - charge.paid
            if (owed <= 0) continue

            const amount = Math.min(owed, remaining)
            remaining -= amount

            await tx.charge.update({
                where: { id: charge.id },
                data: { paid: charge.paid + amount },
            })
            await tx.paymentLog.create({
                data: {
                    charge_id: charge.id,
                    amount,
                    status: 'success',
                },
            })

            applied.push({
                charge_id: charge.id,
                charge_name: charge.name,
                amount: serializeMoney(amount),
            })
        }

        return applied
    })

    return textContent({
        payments,
        unapplied_amount: serializeMoney(remaining),
    })
}

async function summarizeCard(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'charges:read')
    const cardId = getString(args, 'card_id')

    const { card } = await assertCardReadable(cardId, token.user_id)

    const charges = await db.charge.findMany({
        where: { card_id: cardId },
        orderBy: { created_at: 'asc' },
    })

    const total = charges.reduce((sum, charge) => sum + charge.amount, 0)
    const paid = charges.reduce((sum, charge) => sum + charge.paid, 0)
    const pendingCharges = charges.filter(
        (charge) => charge.amount > charge.paid,
    )

    return textContent({
        card: {
            id: card.id,
            name: card.name,
            bank: card.bank,
            last4: card.last4,
        },
        totals: {
            total: serializeMoney(total),
            paid: serializeMoney(paid),
            pending: serializeMoney(total - paid),
            payment_rate:
                total > 0 ? Number(((paid / total) * 100).toFixed(2)) : 0,
        },
        pending_charges: pendingCharges.map((charge) => ({
            id: charge.id,
            name: charge.name,
            amount: serializeMoney(charge.amount),
            paid: serializeMoney(charge.paid),
            pending: serializeMoney(charge.amount - charge.paid),
            created_at: charge.created_at,
        })),
    })
}

function getMcpVersionTool(request?: Request) {
    return textContent(getMcpVersion(request))
}

const tools = [
    {
        name: 'get_mcp_version',
        description:
            'Return Pagora MCP version and deployment metadata for rollout checks.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'list_cards',
        description: 'List the authenticated user credit cards in Pagora.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'list_charges',
        description:
            'List charges for one card, or all charges when card_id is omitted.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: {
                    type: 'string',
                    description: 'Optional Pagora card id.',
                },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'create_charge',
        description: 'Create a charge on a card. Amount is expressed in pesos.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                name: { type: 'string' },
                amount: { type: 'number' },
            },
            required: ['card_id', 'name', 'amount'],
            additionalProperties: false,
        },
    },
    {
        name: 'pay_charge',
        description: 'Mark one charge as fully paid.',
        inputSchema: {
            type: 'object',
            properties: {
                charge_id: { type: 'string' },
            },
            required: ['charge_id'],
            additionalProperties: false,
        },
    },
    {
        name: 'pay_card_amount',
        description:
            'Apply a payment amount to pending charges in oldest-first order.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                amount: { type: 'number' },
            },
            required: ['card_id', 'amount'],
            additionalProperties: false,
        },
    },
    {
        name: 'summarize_card',
        description: 'Summarize total, paid, pending and pending charges.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
            },
            required: ['card_id'],
            additionalProperties: false,
        },
    },
]

async function callTool(
    token: AgentTokenRecord,
    name: string,
    args: Record<string, unknown>,
    request?: Request,
) {
    switch (name) {
        case 'get_mcp_version':
            return getMcpVersionTool(request)
        case 'list_cards':
            return await listCards(token)
        case 'list_charges':
            return await listCharges(token, args)
        case 'create_charge':
            return await createCharge(token, args)
        case 'pay_charge':
            return await payCharge(token, args)
        case 'pay_card_amount':
            return await payCardAmount(token, args)
        case 'summarize_card':
            return await summarizeCard(token, args)
        default:
            throw new Error(`Unknown tool: ${name}`)
    }
}

async function handleRpc(
    rpcRequest: JsonRpcRequest,
    token: AgentTokenRecord,
    httpRequest: Request,
) {
    const id = rpcRequest.id ?? null

    if (!rpcRequest.method) {
        return jsonRpcError(id, -32600, 'Invalid JSON-RPC request')
    }

    if (rpcRequest.method.startsWith('notifications/')) {
        return new Response(null, { status: 202 })
    }

    switch (rpcRequest.method) {
        case 'initialize':
            return jsonRpcResult(id, {
                protocolVersion: '2025-11-25',
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: 'pagora',
                    version: getMcpVersion(httpRequest).mcp_version,
                },
            })
        case 'tools/list':
            return jsonRpcResult(id, { tools })
        case 'tools/call': {
            const params = rpcRequest.params as ToolCallParams
            if (!params?.name) {
                return jsonRpcError(id, -32602, 'Tool name is required')
            }
            const args = params.arguments ?? {}
            const result = await callTool(token, params.name, args, httpRequest)
            return jsonRpcResult(id, result)
        }
        default:
            return jsonRpcError(
                id,
                -32601,
                `Method not found: ${rpcRequest.method}`,
            )
    }
}

export async function GET(request: Request) {
    return Response.json({
        ...getMcpVersion(request),
        transport: 'streamable-http',
        endpoint: new URL('/api/mcp', request.url).toString(),
        version_endpoint: new URL('/api/mcp/version', request.url).toString(),
        authorization: 'Authorization: Bearer <pagora_agent_token>',
        token_management: {
            list: new URL('/api/agent-tokens', request.url).toString(),
            create: new URL('/api/agent-tokens', request.url).toString(),
            revoke: new URL('/api/agent-tokens/{token_id}', request.url).toString(),
        },
    })
}

export async function POST(request: Request) {
    let token: AgentTokenRecord
    try {
        token = await getAgentTokenFromRequest(request)
    } catch (error) {
        if (error instanceof AgentAuthError) {
            return agentUnauthorizedResponse(error, request)
        }
        throw error
    }

    const payload = (await request.json().catch(() => null)) as JsonRpcRequest
    if (!payload || Array.isArray(payload)) {
        return jsonRpcError(null, -32700, 'Expected a single JSON-RPC object')
    }

    try {
        return await handleRpc(payload, token, request)
    } catch (error) {
        if (error instanceof AgentAuthError) {
            return agentUnauthorizedResponse(error, request)
        }
        return jsonRpcError(
            payload.id ?? null,
            -32000,
            error instanceof Error ? error.message : 'Tool call failed',
        )
    }
}
