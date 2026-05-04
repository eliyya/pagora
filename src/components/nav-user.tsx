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
import { useUser } from '@/stores/user.store'
import {
    EllipsisVerticalIcon,
    CircleUserRoundIcon,
    CreditCardIcon,
    BellIcon,
    LogOutIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'

export function NavUser() {
    const { isMobile } = useSidebar()
    const user = useUser(
        useShallow((state) => ({
            name: state.username,
            email: state.email,
            avatar: state.avatar,
        })),
    )
    const fetch = useUser(useShallow((state) => state.fetch))

    useEffect(() => {
        fetch()
    }, [fetch])

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
                                src={user.avatar ?? '/avatars/shadcn.jpg'}
                                alt={user.name}
                            />
                            <AvatarFallback className='rounded-lg'>
                                CN
                            </AvatarFallback>
                        </Avatar>
                        <div className='grid flex-1 text-left text-sm leading-tight'>
                            <span className='truncate font-medium'>
                                {user.name}
                            </span>
                            <span className='truncate text-xs text-foreground/70'>
                                {user.email}
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
                                            src={user.avatar}
                                            alt={user.name}
                                        />
                                        <AvatarFallback className='rounded-lg'>
                                            CN
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className='grid flex-1 text-left text-sm leading-tight'>
                                        <span className='truncate font-medium'>
                                            {user.name}
                                        </span>
                                        <span className='truncate text-xs text-muted-foreground'>
                                            {user.email}
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
                        <DropdownMenuItem>
                            <LogOutIcon />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
