'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CopyIcon, KeyRoundIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'

const AGENT_SCOPES = [
    'cards:read',
    'charges:read',
    'charges:write',
    'payments:write',
] as const

type AgentScope = (typeof AGENT_SCOPES)[number]

interface AgentToken {
    id: string
    name: string
    scopes: AgentScope[]
    last_used_at: string | null
    expires_at: string | null
    revoked_at: string | null
    created_at: string
    updated_at: string
}

interface TokenResponse {
    data: AgentToken[]
}

interface CreateTokenResponse {
    data: AgentToken & { token: string }
}

function formatDate(value: string | null) {
    if (!value) return 'Never'
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

export function AgentTokensPanel() {
    const [tokens, setTokens] = useState<AgentToken[]>([])
    const [name, setName] = useState('OpenClaw')
    const [scopes, setScopes] = useState<AgentScope[]>([...AGENT_SCOPES])
    const [createdToken, setCreatedToken] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const activeTokens = useMemo(
        () => tokens.filter((token) => !token.revoked_at),
        [tokens],
    )

    async function loadTokens() {
        setError(null)
        const response = await fetch('/api/agent-tokens')
        if (!response.ok) {
            throw new Error('Could not load agent tokens')
        }
        const payload = (await response.json()) as TokenResponse
        setTokens(payload.data)
    }

    useEffect(() => {
        startTransition(async () => {
            try {
                await loadTokens()
            } catch (error) {
                setError(error instanceof Error ? error.message : `${error}`)
            }
        })
    }, [])

    function toggleScope(scope: AgentScope, checked: boolean) {
        setScopes((current) =>
            checked
                ? Array.from(new Set([...current, scope]))
                : current.filter((value) => value !== scope),
        )
    }

    function createToken() {
        startTransition(async () => {
            setError(null)
            setCreatedToken(null)
            try {
                const response = await fetch('/api/agent-tokens', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ name, scopes }),
                })
                if (!response.ok) {
                    throw new Error('Could not create agent token')
                }
                const payload = (await response.json()) as CreateTokenResponse
                setCreatedToken(payload.data.token)
                await loadTokens()
            } catch (error) {
                setError(error instanceof Error ? error.message : `${error}`)
            }
        })
    }

    function revokeToken(id: string) {
        startTransition(async () => {
            setError(null)
            try {
                const response = await fetch(`/api/agent-tokens/${id}`, {
                    method: 'DELETE',
                })
                if (!response.ok) {
                    throw new Error('Could not revoke agent token')
                }
                await loadTokens()
            } catch (error) {
                setError(error instanceof Error ? error.message : `${error}`)
            }
        })
    }

    return (
        <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs'>
                <div className='flex flex-col gap-1'>
                    <div className='flex items-center gap-2'>
                        <KeyRoundIcon className='size-4 text-muted-foreground' />
                        <h3 className='text-sm font-medium'>Agents</h3>
                    </div>
                    <p className='text-sm text-muted-foreground'>
                        Create bearer tokens for agents that connect to the
                        Pagora MCP endpoint.
                    </p>
                </div>

                <div className='grid gap-3 @3xl/main:grid-cols-[minmax(220px,320px)_1fr_auto]'>
                    <div className='grid gap-1.5'>
                        <Label htmlFor='agent-token-name'>Name</Label>
                        <Input
                            id='agent-token-name'
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder='OpenClaw'
                        />
                    </div>
                    <div className='grid gap-1.5'>
                        <Label>Scopes</Label>
                        <div className='flex flex-wrap gap-2'>
                            {AGENT_SCOPES.map((scope) => (
                                <label
                                    key={scope}
                                    className='inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm'
                                >
                                    <Checkbox
                                        checked={scopes.includes(scope)}
                                        onCheckedChange={(value) =>
                                            toggleScope(scope, value === true)
                                        }
                                    />
                                    <span>{scope}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className='flex items-end'>
                        <Button
                            onClick={createToken}
                            disabled={isPending || scopes.length === 0}
                            className='w-full @3xl/main:w-auto'
                        >
                            Create Token
                        </Button>
                    </div>
                </div>

                {createdToken ? (
                    <div className='grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-3'>
                        <Label htmlFor='created-agent-token'>
                            New token, copy it now
                        </Label>
                        <div className='flex gap-2'>
                            <Input
                                id='created-agent-token'
                                value={createdToken}
                                readOnly
                                className='font-mono text-xs'
                            />
                            <Button
                                variant='outline'
                                size='icon'
                                onClick={() =>
                                    navigator.clipboard.writeText(createdToken)
                                }
                            >
                                <CopyIcon />
                            </Button>
                        </div>
                    </div>
                ) : null}

                {error ? (
                    <div className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                        {error}
                    </div>
                ) : null}
            </div>

            <div className='rounded-lg border bg-card shadow-xs'>
                <div className='flex items-center justify-between gap-3 border-b px-4 py-3'>
                    <div>
                        <h3 className='text-sm font-medium'>Created tokens</h3>
                        <p className='text-xs text-muted-foreground'>
                            {activeTokens.length} active agent token
                            {activeTokens.length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={() =>
                            startTransition(async () => {
                                try {
                                    await loadTokens()
                                } catch (error) {
                                    setError(
                                        error instanceof Error
                                            ? error.message
                                            : `${error}`,
                                    )
                                }
                            })
                        }
                        disabled={isPending}
                    >
                        <RefreshCwIcon />
                        Refresh
                    </Button>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Scopes</TableHead>
                            <TableHead>Last Used</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className='w-12' />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tokens.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className='h-24 text-center text-muted-foreground'
                                >
                                    No agent tokens yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            tokens.map((token) => (
                                <TableRow key={token.id}>
                                    <TableCell>
                                        <div className='font-medium'>
                                            {token.name}
                                        </div>
                                        <div className='font-mono text-xs text-muted-foreground'>
                                            {token.id}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className='flex flex-wrap gap-1'>
                                            {token.scopes.map((scope) => (
                                                <Badge
                                                    key={scope}
                                                    variant='secondary'
                                                >
                                                    {scope}
                                                </Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {formatDate(token.last_used_at)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                token.revoked_at
                                                    ? 'outline'
                                                    : 'default'
                                            }
                                        >
                                            {token.revoked_at
                                                ? 'Revoked'
                                                : 'Active'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant='ghost'
                                            size='icon-sm'
                                            disabled={
                                                isPending || !!token.revoked_at
                                            }
                                            onClick={() =>
                                                revokeToken(token.id)
                                            }
                                        >
                                            <Trash2Icon />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
