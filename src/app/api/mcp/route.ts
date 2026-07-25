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
import {
    beginCardChange,
    recordCardChanges,
} from '@/lib/card-changes'
import { createChargeSet } from '@/lib/charge-creation'
import {
    payCardAmount as applyCardPayment,
    payChargeFully,
} from '@/lib/charge-payments'
import {
    isAccountingCharge,
    isDateOnly,
    isValidInstallmentCount,
    type InstallmentPlanInput,
} from '@/lib/installments'
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
    if (!Number.isSafeInteger(cents) || cents > 2_147_483_647) {
        throw new Error(`${key} exceeds the supported amount`)
    }
    return cents
}

function serializeMoney(cents: number) {
    return cents / 100
}

function serializeCharge(charge: {
    amount: number
    paid: number
    category?: { id: string; name: string; monthly_budget: number } | null
}) {
    return {
        ...charge,
        amount: serializeMoney(charge.amount),
        paid: serializeMoney(charge.paid),
        pending: serializeMoney(charge.amount - charge.paid),
        category: charge.category
            ? {
                  ...charge.category,
                  monthly_budget: serializeMoney(charge.category.monthly_budget),
              }
            : null,
    }
}

function getInstallmentPlan(
    args: Record<string, unknown>,
): InstallmentPlanInput | undefined {
    const hasCount = args.installment_count !== undefined
    const hasDate = args.first_installment_date !== undefined
    if (!hasCount && !hasDate) return undefined
    if (!hasCount || !hasDate) {
        throw new Error(
            'installment_count and first_installment_date are required together',
        )
    }

    const count = Number(args.installment_count)
    const firstInstallmentDate = args.first_installment_date
    if (
        !isValidInstallmentCount(count) ||
        !isDateOnly(firstInstallmentDate)
    ) {
        throw new Error(
            'installment_count must be 2-60 and first_installment_date must use YYYY-MM-DD',
        )
    }
    return { count, firstInstallmentDate }
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
        include: { category: true },
        orderBy: [
            { scheduled_for: 'asc' },
            { created_at: 'asc' },
        ],
    })

    return textContent({
        charges: charges.map(serializeCharge),
    })
}

async function listCategories(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'charges:read')
    const cardId = getString(args, 'card_id')
    await assertCardReadable(cardId, token.user_id)

    const categories = await db.chargeCategory.findMany({
        where: { card_id: cardId },
        orderBy: { name: 'asc' },
    })

    return textContent({
        categories: categories.map((category) => ({
            ...category,
            monthly_budget: serializeMoney(category.monthly_budget),
        })),
    })
}

async function createCategory(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'charges:write')
    const cardId = getString(args, 'card_id')
    const name = getString(args, 'name')
    const monthlyBudget =
        args.monthly_budget === undefined
            ? 0
            : getMoneyAmount(args, 'monthly_budget')

    await assertCardWritable(cardId, token.user_id)

    const category = await db.$transaction(async (tx) => {
        const syncVersion = await beginCardChange(cardId, tx)
        const result = await tx.chargeCategory.upsert({
            where: {
                card_id_name: {
                    card_id: cardId,
                    name,
                },
            },
            update: {
                monthly_budget: monthlyBudget,
            },
            create: {
                card_id: cardId,
                name,
                monthly_budget: monthlyBudget,
            },
        })
        await recordCardChanges(
            cardId,
            syncVersion,
            [
                {
                    entity: 'category',
                    entityId: result.id,
                    operation: 'upsert',
                },
            ],
            tx,
        )
        return result
    })

    return textContent({
        category: {
            ...category,
            monthly_budget: serializeMoney(category.monthly_budget),
        },
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
    const categoryName =
        typeof args.category === 'string' && args.category.trim().length > 0
            ? args.category.trim()
            : undefined
    const installment = getInstallmentPlan(args)

    await assertCardWritable(cardId, token.user_id)

    const created = await db.$transaction(async (tx) => {
        const syncVersion = await beginCardChange(cardId, tx)
        const result = await createChargeSet(
            tx,
            {
                cardId,
                name,
                amount,
                categoryName,
                installment,
            },
            syncVersion,
        )
        await recordCardChanges(
            cardId,
            syncVersion,
            [
                ...(result.category
                    ? [
                          {
                              entity: 'category' as const,
                              entityId: result.category.id,
                              operation: 'upsert' as const,
                          },
                      ]
                    : []),
                ...result.charges.map((charge) => ({
                    entity: 'charge' as const,
                    entityId: charge.id,
                    operation: 'upsert' as const,
                })),
            ],
            tx,
        )
        return result.charges
    })

    return textContent({
        charge: serializeCharge(created[0]),
        installments: created.slice(1).map(serializeCharge),
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

    const result = await payChargeFully(charge.card_id, chargeId)
    if (result.status === 'not-found') {
        throw new Error('charge not found')
    }
    if (result.status === 'installment-parent') {
        throw new Error(
            'installment parent is a summary; pay an installment instead',
        )
    }

    return textContent({
        charge: serializeCharge(result.charge),
        related_charges: result.updatedCharges
            .filter((updated) => updated.id !== result.charge.id)
            .map(serializeCharge),
        payment_amount: serializeMoney(result.paymentAmount),
    })
}

async function payCardAmount(
    token: AgentTokenRecord,
    args: Record<string, unknown>,
) {
    assertAgentScope(token, 'payments:write')
    const cardId = getString(args, 'card_id')
    const requestedAmount = getMoneyAmount(args, 'amount')
    const idempotencyKey = getString(args, 'idempotency_key')
    if (idempotencyKey.length > 400) {
        throw new Error('idempotency_key is too long')
    }
    const asOfDate = getString(args, 'as_of_date')
    if (!isDateOnly(asOfDate)) {
        throw new Error('as_of_date must use YYYY-MM-DD')
    }

    await assertCardWritable(cardId, token.user_id)

    const result = await applyCardPayment(cardId, requestedAmount, {
        asOfDate,
        idempotency: {
            requestId: `mcp:${idempotencyKey}`,
            userId: token.user_id,
        },
    })
    if (result.status === 'not-found') {
        throw new Error('card not found')
    }
    if (result.status === 'idempotency-conflict') {
        throw new Error('payment request conflict')
    }

    return textContent({
        payments: result.payments.map((payment) => ({
            charge_id: payment.chargeId,
            charge_name: payment.chargeName,
            amount: serializeMoney(payment.amount),
            scheduled_for: payment.scheduledFor,
        })),
        unapplied_amount: serializeMoney(result.remaining),
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
        include: { category: true },
        orderBy: [
            { scheduled_for: 'asc' },
            { created_at: 'asc' },
        ],
    })

    const accountingCharges = charges.filter(isAccountingCharge)
    const total = accountingCharges.reduce(
        (sum, charge) => sum + charge.amount,
        0,
    )
    const paid = accountingCharges.reduce(
        (sum, charge) => sum + charge.paid,
        0,
    )
    const pendingCharges = accountingCharges.filter(
        (charge) => charge.amount > charge.paid,
    )
    const categories = await db.chargeCategory.findMany({
        where: { card_id: cardId },
        orderBy: { name: 'asc' },
    })
    const byCategory = categories.map((category) => {
        const categoryCharges = accountingCharges.filter(
            (charge) => charge.category_id === category.id,
        )
        const spent = categoryCharges.reduce(
            (sum, charge) => sum + charge.amount,
            0,
        )
        return {
            id: category.id,
            name: category.name,
            monthly_budget: serializeMoney(category.monthly_budget),
            spent: serializeMoney(spent),
            remaining:
                category.monthly_budget > 0
                    ? serializeMoney(category.monthly_budget - spent)
                    : null,
        }
    })

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
            category: charge.category?.name ?? null,
            amount: serializeMoney(charge.amount),
            paid: serializeMoney(charge.paid),
            pending: serializeMoney(charge.amount - charge.paid),
            scheduled_for: charge.scheduled_for,
            created_at: charge.created_at,
        })),
        categories: byCategory,
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
        name: 'list_categories',
        description: 'List charge categories and monthly budgets for a card.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
            },
            required: ['card_id'],
            additionalProperties: false,
        },
    },
    {
        name: 'create_category',
        description:
            'Create or update a charge category with an optional monthly budget. Amount is expressed in pesos.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                name: { type: 'string' },
                monthly_budget: { type: 'number' },
            },
            required: ['card_id', 'name'],
            additionalProperties: false,
        },
    },
    {
        name: 'create_charge',
        description:
            'Create a charge on a card. Amount is expressed in pesos. To create an installment plan, provide installment_count and first_installment_date together.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                name: { type: 'string' },
                amount: { type: 'number' },
                category: { type: 'string' },
                installment_count: {
                    type: 'integer',
                    minimum: 2,
                    maximum: 60,
                },
                first_installment_date: {
                    type: 'string',
                    format: 'date',
                },
            },
            required: ['card_id', 'name', 'amount'],
            additionalProperties: false,
        },
    },
    {
        name: 'pay_charge',
        description:
            'Mark one regular charge or installment as fully paid. Installment-plan summary charges are not directly payable.',
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
            'Apply a payment amount to due pending charges in scheduled-date order. Future installments are not prepaid. Reuse the same idempotency_key when retrying the same payment.',
        inputSchema: {
            type: 'object',
            properties: {
                card_id: { type: 'string' },
                amount: { type: 'number' },
                idempotency_key: {
                    type: 'string',
                    description:
                        'A unique client-generated key. Reuse it only when retrying this exact payment.',
                },
                as_of_date: {
                    type: 'string',
                    format: 'date',
                    description:
                        'Local YYYY-MM-DD cutoff for due charges. Reuse it with the idempotency key.',
                },
            },
            required: [
                'card_id',
                'amount',
                'idempotency_key',
                'as_of_date',
            ],
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
        case 'list_categories':
            return await listCategories(token, args)
        case 'create_category':
            return await createCategory(token, args)
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
