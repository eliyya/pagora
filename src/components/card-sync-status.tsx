'use client'

import { useState } from 'react'
import {
    CircleCheckIcon,
    CloudOffIcon,
    Clock3Icon,
    RefreshCwIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import { useShallow } from 'zustand/shallow'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useInfo } from '@/stores/info.store'
import type { StoredMutationConflict } from '@/lib/client-card-cache'

function mutationDescription(conflict: StoredMutationConflict) {
    const mutation = conflict.mutation
    if (mutation.type === 'charge.create') {
        return `Create “${mutation.charge.name}” for ${(mutation.charge.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
    }
    if (mutation.type === 'charge.update') {
        return `Update to “${mutation.name}” for ${(mutation.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
    }
    if (mutation.type === 'installment.create') {
        return `Create “${mutation.plan.name}” in ${mutation.plan.count} installments for ${(mutation.plan.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
    }
    if (mutation.type === 'installment.update') {
        return `Update installment plan “${mutation.plan.name}”`
    }
    return mutation.type === 'installment.delete'
        ? 'Delete this installment plan'
        : 'Delete this charge'
}

function conflictReason(conflict: StoredMutationConflict) {
    const result = conflict.result
    if (result.status === 'conflict') {
        return `The server now has “${result.serverCharge.name}” at ${(result.serverCharge.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`
    }
    if (result.status === 'gone') return 'The charge was deleted elsewhere.'
    if (result.status === 'rejected') return result.reason
    if (result.status === 'dependency-failed') {
        return 'A previous offline change for this charge could not be applied.'
    }
    return 'This change needs your attention.'
}

export function CardSyncStatus() {
    const {
        status,
        pending,
        conflicts,
        userId,
        cardId,
        cardAccess,
        syncCard,
        acceptServerConflict,
        retryConflict,
    } = useInfo(
        useShallow((state) => ({
            status: state.syncStatus,
            pending: state.pendingMutationCount,
            conflicts: state.syncConflicts,
            userId: state.activeUserId,
            cardId: state.activeCardId,
            cardAccess: state.cardAccess,
            syncCard: state.syncCard,
            acceptServerConflict: state.acceptServerConflict,
            retryConflict: state.retryConflict,
        })),
    )
    const [open, setOpen] = useState(false)
    const [resolving, setResolving] = useState<string | null>(null)
    const canWrite = cardAccess === 'owner' || cardAccess === 'write'

    let label = 'Synced'
    let Icon = CircleCheckIcon
    if (conflicts.length > 0) {
        label = `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}`
        Icon = TriangleAlertIcon
    } else if (status === 'offline') {
        label = pending > 0 ? `Offline · ${pending} pending` : 'Offline'
        Icon = CloudOffIcon
    } else if (status === 'syncing') {
        label = pending > 0 ? `Syncing · ${pending} pending` : 'Syncing'
        Icon = RefreshCwIcon
    } else if (pending > 0) {
        label = `${pending} pending`
        Icon = Clock3Icon
    } else if (status === 'unauthorized') {
        label = 'Session expired'
        Icon = TriangleAlertIcon
    } else if (status === 'unavailable') {
        label = 'Access removed'
        Icon = TriangleAlertIcon
    } else if (status === 'error') {
        label = 'Sync failed'
        Icon = TriangleAlertIcon
    }

    async function resolve(
        mutationId: string,
        action: 'server' | 'retry',
    ) {
        setResolving(mutationId)
        try {
            if (action === 'server') {
                await acceptServerConflict(mutationId)
            } else {
                await retryConflict(mutationId)
            }
        } finally {
            setResolving(null)
        }
    }

    return (
        <>
            <div className='flex items-center gap-1'>
                <Button
                    variant={conflicts.length > 0 ? 'destructive' : 'outline'}
                    size='sm'
                    onClick={() => {
                        if (conflicts.length > 0) setOpen(true)
                    }}
                    className='max-w-44'
                >
                    <Icon
                        className={
                            status === 'syncing' ? 'animate-spin' : undefined
                        }
                    />
                    <span className='hidden xl:inline'>{label}</span>
                    <span className='sr-only xl:hidden'>{label}</span>
                </Button>
                <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label='Retry synchronization'
                    disabled={!userId || !cardId || status === 'syncing'}
                    onClick={() => {
                        if (userId && cardId) void syncCard(cardId, userId)
                    }}
                >
                    <RefreshCwIcon />
                </Button>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className='max-h-[80vh] overflow-y-auto sm:max-w-lg'>
                    <DialogHeader>
                        <DialogTitle>Synchronization conflicts</DialogTitle>
                        <DialogDescription>
                            These offline changes collided with a newer server
                            version. Choose which version Pagora should keep.
                        </DialogDescription>
                    </DialogHeader>
                    <div className='flex flex-col gap-3'>
                        {conflicts.map((conflict) => {
                            const busy = resolving === conflict.mutationId
                            return (
                                <div
                                    key={conflict.mutationId}
                                    className='flex flex-col gap-3 rounded-lg border p-3'
                                >
                                    <div>
                                        <div className='font-medium'>
                                            {mutationDescription(conflict)}
                                        </div>
                                        <div className='mt-1 text-sm text-muted-foreground'>
                                            {conflictReason(conflict)}
                                        </div>
                                    </div>
                                    <div className='flex flex-wrap justify-end gap-2'>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            disabled={busy}
                                            onClick={() =>
                                                void resolve(
                                                    conflict.mutationId,
                                                    'server',
                                                )
                                            }
                                        >
                                            Use server version
                                        </Button>
                                        <Button
                                            size='sm'
                                            disabled={busy || !canWrite}
                                            onClick={() =>
                                                void resolve(
                                                    conflict.mutationId,
                                                    'retry',
                                                )
                                            }
                                        >
                                            {busy
                                                ? 'Saving…'
                                                : conflict.result.status ===
                                                    'gone'
                                                  ? 'Recreate my change'
                                                  : 'Retry my change'}
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant='outline' onClick={() => setOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
