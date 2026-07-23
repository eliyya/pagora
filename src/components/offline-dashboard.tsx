'use client'

import { useEffect, useState } from 'react'
import {
    CloudOffIcon,
    CreditCardIcon,
    LoaderCircleIcon,
    LockKeyholeIcon,
    RefreshCwIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChargesTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'
import {
    clearUserOfflineView,
    hasCompleteCardSnapshot,
    readCardCache,
    readOfflineSession,
    type StoredOfflineCard,
    type StoredOfflineSession,
} from '@/lib/client-card-cache'
import { useInfo } from '@/stores/info.store'

type OfflineView =
    | { status: 'loading' }
    | {
          status: 'unavailable'
          session: StoredOfflineSession | null
          availableCards: StoredOfflineCard[]
          requestedCardId: string | null
      }
    | {
          status: 'ready'
          session: StoredOfflineSession
          card: StoredOfflineCard
          availableCards: StoredOfflineCard[]
      }

function cardIdFromLocation() {
    const match = window.location.pathname.match(
        /^\/dashboard\/card\/([^/]+)\/?$/,
    )
    if (!match) return null
    try {
        return decodeURIComponent(match[1])
    } catch {
        return null
    }
}

async function availableOfflineCards(session: StoredOfflineSession) {
    const cached = await Promise.all(
        session.cards.map(async (card) =>
            hasCompleteCardSnapshot(
                await readCardCache(session.userId, card.id),
            )
                ? card
                : null,
        ),
    )
    return cached.filter((card): card is StoredOfflineCard => card !== null)
}

export function OfflineDashboard() {
    const [view, setView] = useState<OfflineView>({ status: 'loading' })
    const [clearingLocalCopy, setClearingLocalCopy] = useState(false)

    async function clearLocalCopy(userId: string) {
        const confirmed = window.confirm(
            'Se borrarán de este dispositivo los cargos y datos visibles guardados. Los cambios pendientes de sincronizar se conservarán.',
        )
        if (!confirmed) return

        setClearingLocalCopy(true)
        try {
            await clearUserOfflineView(userId)
            window.location.replace('/offline')
        } catch {
            setClearingLocalCopy(false)
            toast.error('No se pudo ocultar la copia local.')
        }
    }

    useEffect(() => {
        let cancelled = false

        async function hydrate() {
            const session = await readOfflineSession()
            if (cancelled) return
            if (!session) {
                setView({
                    status: 'unavailable',
                    session: null,
                    availableCards: [],
                    requestedCardId: cardIdFromLocation(),
                })
                return
            }

            const availableCards = await availableOfflineCards(session)
            if (cancelled) return
            const requestedCardId = cardIdFromLocation()
            const card = requestedCardId
                ? availableCards.find((item) => item.id === requestedCardId)
                : (availableCards.find(
                      (item) => item.id === session.activeCardId,
                  ) ?? availableCards[0])

            if (
                !card ||
                !useInfo
                    .getState()
                    .hydrateOfflineSession(session, card.id)
            ) {
                setView({
                    status: 'unavailable',
                    session,
                    availableCards,
                    requestedCardId,
                })
                return
            }

            setView({ status: 'ready', session, card, availableCards })
        }

        void hydrate()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let checking = false

        async function returnOnline() {
            if (checking) return
            checking = true
            try {
                const response = await fetch('/api/mcp/version', {
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                })
                if (!response.ok) return

                const target =
                    view.status === 'ready'
                        ? `/dashboard/card/${encodeURIComponent(view.card.id)}`
                        : '/dashboard'
                if (window.location.pathname === target) {
                    window.location.reload()
                } else {
                    window.location.replace(target)
                }
            } catch {
                // navigator.onLine can be true behind a captive or dead network.
            } finally {
                checking = false
            }
        }

        const handleOnline = () => void returnOnline()
        window.addEventListener('online', handleOnline)
        if (navigator.onLine) void returnOnline()

        return () => window.removeEventListener('online', handleOnline)
    }, [view])

    if (view.status === 'loading') {
        return (
            <OfflineMessage
                icon={<LoaderCircleIcon className='size-6 animate-spin' />}
                title='Abriendo tu copia local…'
                description='Pagora está leyendo los datos guardados en este dispositivo.'
            />
        )
    }

    if (view.status === 'unavailable') {
        const requestedUnavailable = Boolean(view.requestedCardId)
        return (
            <OfflineMessage
                icon={<CloudOffIcon className='size-6' />}
                title={
                    requestedUnavailable
                        ? 'Esta tarjeta no está disponible sin conexión'
                        : 'Todavía no hay datos disponibles sin conexión'
                }
                description='Conéctate, inicia sesión y abre una tarjeta una vez para guardar su copia local.'
            >
                {view.availableCards.length > 0 && (
                    <div className='mt-5 flex flex-col gap-2 text-left'>
                        <p className='text-sm font-medium'>Tarjetas disponibles:</p>
                        {view.availableCards.map((card) => (
                            <Button
                                key={card.id}
                                variant='outline'
                                render={
                                    <a href={`/dashboard/card/${card.id}`} />
                                }
                            >
                                <CreditCardIcon />
                                {card.name}
                            </Button>
                        ))}
                    </div>
                )}
                {view.session && (
                    <Button
                        className='mt-3'
                        variant='ghost'
                        disabled={clearingLocalCopy}
                        onClick={() =>
                            void clearLocalCopy(view.session!.userId)
                        }
                    >
                        <LockKeyholeIcon />
                        Ocultar copia local
                    </Button>
                )}
            </OfflineMessage>
        )
    }

    return (
        <main className='min-h-screen bg-background'>
            <header className='sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6'>
                <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                        <CreditCardIcon className='size-5 text-primary' />
                        <h1 className='truncate font-semibold'>
                            {view.card.name}
                        </h1>
                    </div>
                    <p className='truncate text-xs text-muted-foreground'>
                        {view.session.user.username} · copia local
                    </p>
                </div>
                <div className='flex items-center gap-2'>
                    <Button
                        size='sm'
                        variant='ghost'
                        disabled={clearingLocalCopy}
                        title='Borrar los datos visibles guardados en este dispositivo'
                        onClick={() =>
                            void clearLocalCopy(view.session.userId)
                        }
                    >
                        <LockKeyholeIcon />
                        <span className='hidden sm:inline'>Ocultar copia</span>
                    </Button>
                    {view.availableCards.length > 1 && (
                        <select
                            aria-label='Cambiar tarjeta offline'
                            value={view.card.id}
                            onChange={(event) => {
                                window.location.href = `/dashboard/card/${event.target.value}`
                            }}
                            className='h-8 max-w-40 rounded-md border bg-background px-2 text-sm'
                        >
                            {view.availableCards.map((card) => (
                                <option key={card.id} value={card.id}>
                                    {card.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <Badge variant='outline' className='gap-1.5'>
                        <CloudOffIcon className='size-3.5' />
                        Sin conexión
                    </Badge>
                </div>
            </header>
            <div className='@container/main flex flex-col gap-4 py-4 md:gap-6 md:py-6'>
                <SectionCards />
                <ChargesTable
                    cardId={view.card.id}
                    userId={view.session.userId}
                />
            </div>
        </main>
    )
}

function OfflineMessage({
    icon,
    title,
    description,
    children,
}: {
    icon: React.ReactNode
    title: string
    description: string
    children?: React.ReactNode
}) {
    return (
        <main className='grid min-h-screen place-items-center bg-background p-6'>
            <section className='w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm'>
                <div className='mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground'>
                    {icon}
                </div>
                <h1 className='text-xl font-semibold'>{title}</h1>
                <p className='mt-2 text-sm text-muted-foreground'>
                    {description}
                </p>
                {children}
                <Button
                    className='mt-5'
                    variant='outline'
                    onClick={() => window.location.reload()}
                >
                    <RefreshCwIcon />
                    Reintentar
                </Button>
            </section>
        </main>
    )
}
