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
import { useShallow } from 'zustand/shallow'

export function NavUser() {
    const { isMobile } = useSidebar()
    const { user } = useInfo(
        useShallow((state) => ({
            user: state.user,
        })),
    )

    const displayName = user?.username ?? 'User'
    const displayEmail = user?.email ?? ''
    const initials = displayName.charAt(0).toUpperCase()

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
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
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => window.location.href = '/api/auth/logout'}>
                            <LogOutIcon />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
