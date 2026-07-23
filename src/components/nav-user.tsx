'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    listPendingCardInvitationsAction,
    respondToCardInvitationAction,
} from '@/actions/card.action'
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar'
import { useInfo } from '@/stores/info.store'
import {
    EllipsisVerticalIcon,
    CircleUserRoundIcon,
    CreditCardIcon,
    BellIcon,
    LogOutIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { clearUserOfflineView } from '@/lib/client-card-cache'
import { toast } from 'sonner'

type PendingInvitation = Awaited<
    ReturnType<typeof listPendingCardInvitationsAction>
>[number]

export function NavUser() {
    const { isMobile } = useSidebar()
    const { user, activeUserId, pendingInvitations, refreshCards } = useInfo(
        useShallow((state) => ({
            user: state.user,
            activeUserId: state.activeUserId,
            pendingInvitations: state.pendingInvitations,
            refreshCards: state.refreshCards,
        })),
    )
    const [invitations, setInvitations] = useState<PendingInvitation[]>([])
    const [loadingInvitationId, setLoadingInvitationId] = useState<string | null>(
        null,
    )
    const [open, setOpen] = useState(false)

    const displayName = user?.username ?? 'User'
    const displayEmail = user?.email ?? ''
    const initials = displayName.charAt(0).toUpperCase()

    async function refreshInvitations() {
        setInvitations(await listPendingCardInvitationsAction())
    }

    function handleOpenChange(nextOpen: boolean) {
        setOpen(nextOpen)
        if (nextOpen) {
            refreshInvitations()
        }
    }

    async function respond(invitationId: string, response: 'accept' | 'decline') {
        setLoadingInvitationId(invitationId)
        await respondToCardInvitationAction(invitationId, response)
        await Promise.all([refreshInvitations(), refreshCards()])
        setLoadingInvitationId(null)
    }

    async function logout() {
        if (navigator.onLine === false) {
            toast.error('Conéctate para cerrar sesión de forma segura.')
            return
        }
        const userId = user?.id ?? activeUserId
        if (userId) {
            await clearUserOfflineView(userId).catch(() => undefined)
        }
        if (userId && typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('pagora-auth')
            channel.postMessage({ type: 'logout', userId })
            channel.close()
        }
        window.location.href = '/api/auth/logout'
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu open={open} onOpenChange={handleOpenChange}>
                    <DropdownMenuTrigger
                        render={
                            <SidebarMenuButton
                                size='lg'
                                className='aria-expanded:bg-muted'
                            />
                        }
                    >
                        <Avatar className='size-8 rounded-lg grayscale'>
                            <AvatarImage
                                src='/avatars/shadcn.jpg'
                                alt={displayName}
                            />
                            <AvatarFallback className='rounded-lg'>
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <div className='grid flex-1 text-left text-sm leading-tight'>
                            <span className='truncate font-medium'>
                                {displayName}
                            </span>
                            <span className='truncate text-xs text-foreground/70'>
                                {displayEmail}
                            </span>
                        </div>
                        <EllipsisVerticalIcon className='ml-auto size-4' />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className='min-w-56'
                        side={isMobile ? 'bottom' : 'right'}
                        align='end'
                        sideOffset={4}
                    >
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className='p-0 font-normal'>
                                <div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
                                    <Avatar className='size-8'>
                                        <AvatarImage
                                            src='/avatars/shadcn.jpg'
                                            alt={displayName}
                                        />
                                        <AvatarFallback className='rounded-lg'>
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className='grid flex-1 text-left text-sm leading-tight'>
                                        <span className='truncate font-medium'>
                                            {displayName}
                                        </span>
                                        <span className='truncate text-xs text-muted-foreground'>
                                            {displayEmail}
                                        </span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <CircleUserRoundIcon />
                                Account
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <CreditCardIcon />
                                Billing
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <BellIcon />
                                Notifications
                                {pendingInvitations > 0 && (
                                    <Badge className='ml-auto'>
                                        {pendingInvitations}
                                    </Badge>
                                )}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuLabel>Card invitations</DropdownMenuLabel>
                            {invitations.length === 0 && (
                                <DropdownMenuItem disabled>
                                    No pending invitations
                                </DropdownMenuItem>
                            )}
                            {invitations.map((invitation) => (
                                <DropdownMenuItem
                                    key={invitation.id}
                                    onSelect={(event) => event.preventDefault()}
                                    className='flex-col items-stretch gap-2'
                                >
                                    <div className='min-w-0 text-sm'>
                                        <div className='truncate font-medium'>
                                            {invitation.card.name}
                                        </div>
                                        <div className='truncate text-xs text-muted-foreground'>
                                            From {invitation.inviter.username} - {invitation.permission}
                                        </div>
                                    </div>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            className='h-7 flex-1'
                                            disabled={
                                                loadingInvitationId ===
                                                invitation.id
                                            }
                                            onClick={() =>
                                                respond(invitation.id, 'accept')
                                            }
                                        >
                                            Accept
                                        </Button>
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            className='h-7 flex-1'
                                            disabled={
                                                loadingInvitationId ===
                                                invitation.id
                                            }
                                            onClick={() =>
                                                respond(invitation.id, 'decline')
                                            }
                                        >
                                            Decline
                                        </Button>
                                    </div>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout}>
                            <LogOutIcon />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
