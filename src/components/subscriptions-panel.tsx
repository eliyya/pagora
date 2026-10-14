'use client'

import { useEffect, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { listSubscriptionsAction, manageSubscriptionAction } from '@/actions/subscription.action'
import { useInfo } from '@/stores/info.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CurrencyInput, formatCents } from './currency-input'
import type { ManageSubscriptionInput } from '@/schemas/subscription'

type Subscription = NonNullable<Awaited<ReturnType<typeof listSubscriptionsAction>>['data']>[number]
const statusLabels = { active: 'Activa', paused: 'Pausada', canceled: 'Cancelada' }
const formatDate = (value: string) => Temporal.PlainDate.from(value).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export function SubscriptionsPanel() {
    const cardId = useInfo((s) => s.activeCardId)
    return cardId ? <CardSubscriptions key={cardId} cardId={cardId} /> : null
}

function CardSubscriptions({ cardId }: { cardId: string }) {
    const access = useInfo((s) => s.cardAccess)
    const syncCursor = useInfo((s) => s.syncCursor)
    const canWrite = access === 'owner' || access === 'write'
    const [rows, setRows] = useState<Subscription[] | null>(null)
    const [error, setError] = useState('')
    const [refresh, setRefresh] = useState(0)
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState<Subscription | null>(null)
    const [canceling, setCanceling] = useState<Subscription | null>(null)
    const [name, setName] = useState('')
    const [amount, setAmount] = useState(0)
    const [categoryName, setCategoryName] = useState('')
    const [actionError, setActionError] = useState('')

    useEffect(() => {
        let ignore = false
        listSubscriptionsAction(cardId).then((result) => {
            if (ignore) return
            if (result.data) { setRows(result.data); setError('') }
            else setError(result.error ?? 'No se pudieron cargar las suscripciones.')
        }).catch(() => {
            if (!ignore) setError('No se pudieron cargar las suscripciones. Revisa tu conexión.')
        })
        return () => { ignore = true }
    }, [cardId, syncCursor, refresh])

    async function manage(input: ManageSubscriptionInput) {
        if (busy) return
        setBusy(true)
        setActionError('')
        try {
            const result = await manageSubscriptionAction(input)
            if (result.error) { setActionError(result.error); return }
            setEditing(null)
            setCanceling(null)
            const updated = await listSubscriptionsAction(cardId)
            if (updated.data) { setRows(updated.data); setError('') }
            else setError(updated.error ?? 'Actualiza la lista para ver los cambios.')
            const { activeUserId, syncCard } = useInfo.getState()
            if (activeUserId) void syncCard(cardId, activeUserId).catch(() => {})
        } catch {
            setActionError('No se pudo completar la operación. Actualiza la lista antes de reintentar.')
        } finally { setBusy(false) }
    }

    return (
        <section className='flex flex-col gap-4'>
            <div className='flex items-start justify-between gap-3'>
                <div>
                    <h2 className='text-lg font-semibold'>Suscripciones</h2>
                    <p className='text-sm text-muted-foreground'>Administra los cargos mensuales de esta tarjeta.</p>
                </div>
                <Button variant='outline' size='sm' disabled={busy} onClick={() => setRefresh((v) => v + 1)}>Actualizar</Button>
            </div>
            {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
            {actionError && !editing && !canceling && <p role='alert' className='text-sm text-destructive'>{actionError}</p>}
            {!rows && !error && <p role='status' className='text-sm text-muted-foreground'>Cargando suscripciones…</p>}
            {rows?.length === 0 && <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                No hay suscripciones. Usa «Create Charge» y selecciona «Suscripción» para agregar una.
            </div>}
            {rows?.map((item) => <article key={item.id} className='flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <h3 className='break-words font-medium'>{item.name}</h3>
                        <span className='rounded-full bg-muted px-2 py-1 text-xs'>{statusLabels[item.status]}</span>
                    </div>
                    <p className='text-sm font-medium'>${formatCents(item.amount)} / mes</p>
                    <p className='text-sm text-muted-foreground'>{item.categoryName || 'Sin categoría'}</p>
                    <p className='text-sm text-muted-foreground'>{item.status === 'active' ? `Próximo cargo: ${formatDate(item.nextDueOn)}` : item.status === 'paused' ? 'Sin cargos nuevos mientras esté pausada' : 'Sin nuevos cargos'}</p>
                    <p className='text-xs text-muted-foreground'>Desde {formatDate(item.startsOn)} · {item.timeZone}</p>
                </div>
                {canWrite && item.status !== 'canceled' && <div className='flex flex-wrap gap-2'>
                    <Button size='sm' variant='outline' disabled={busy} onClick={() => {
                        setEditing(item); setName(item.name); setAmount(item.amount); setCategoryName(item.categoryName); setActionError('')
                    }}>Editar</Button>
                    <Button size='sm' variant='outline' disabled={busy} onClick={() => void manage({
                        operation: item.status === 'active' ? 'pause' : 'resume', cardId, id: item.id, revision: item.revision,
                    })}>{item.status === 'active' ? 'Pausar' : 'Reanudar'}</Button>
                    <Button size='sm' variant='outline' disabled={busy} onClick={() => { setCanceling(item); setActionError('') }}>Cancelar</Button>
                </div>}
            </article>)}
            <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busy) setEditing(null) }}>
                <DialogContent className='sm:max-w-sm'>
                    <DialogHeader><DialogTitle>Editar suscripción</DialogTitle><DialogDescription>Los cambios se aplican a los cargos que se generen después. El historial se conserva.</DialogDescription></DialogHeader>
                    <form className='flex flex-col gap-4' onSubmit={(event) => {
                        event.preventDefault()
                        if (editing) void manage({ operation: 'edit', cardId, id: editing.id, revision: editing.revision, name, amount, categoryName })
                    }}>
                        <div className='space-y-2'><Label htmlFor='subscription-edit-name'>Nombre</Label><Input id='subscription-edit-name' required maxLength={500} disabled={busy} value={name} onChange={(e) => setName(e.target.value)} /></div>
                        <div className='space-y-2'><Label htmlFor='subscription-edit-amount'>Importe mensual</Label><CurrencyInput id='subscription-edit-amount' disabled={busy} valueCents={amount} onValueCentsChange={setAmount} /></div>
                        <div className='space-y-2'><Label htmlFor='subscription-edit-category'>Categoría</Label><Input id='subscription-edit-category' maxLength={60} disabled={busy} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /></div>
                        {actionError && <p role='alert' className='text-sm text-destructive'>{actionError}</p>}
                        <Button disabled={busy} type='submit'>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog open={!!canceling} onOpenChange={(open) => { if (!open && !busy) setCanceling(null) }}>
                <DialogContent className='sm:max-w-sm'>
                    <DialogHeader><DialogTitle>Cancelar suscripción</DialogTitle><DialogDescription>Se dejarán de generar cargos para «{canceling?.name}». Los cargos existentes se conservan. Esta cancelación es definitiva.</DialogDescription></DialogHeader>
                    {actionError && <p role='alert' className='text-sm text-destructive'>{actionError}</p>}
                    <div className='flex justify-end gap-2'>
                        <Button variant='outline' disabled={busy} onClick={() => setCanceling(null)}>Volver</Button>
                        <Button variant='destructive' disabled={busy} onClick={() => { if (canceling) void manage({ operation: 'cancel', cardId, id: canceling.id, revision: canceling.revision }) }}>{busy ? 'Cancelando…' : 'Cancelar suscripción'}</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    )
}
