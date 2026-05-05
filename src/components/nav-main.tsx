'use client'

import {
    ChevronRight,
    MailIcon,
    PlusCircle,
    type LucideIcon,
} from 'lucide-react'

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { useCreateCardDialog } from '@/stores/card.store'

export function NavMain({
    items,
}: {
    items: {
        title: string
        url: string
        icon?: LucideIcon
        isActive?: boolean
        items?: {
            title: string
            url: string
        }[]
    }[]
}) {
    const openDialog = useCreateCardDialog((s) => s.toggle)
    return (
        <SidebarGroup>
            <SidebarGroupLabel>Cards</SidebarGroupLabel>
            <SidebarMenu>
                <SidebarMenuItem className='flex items-center gap-2'>
                    <SidebarMenuButton
                        onClick={() => openDialog(true)}
                        tooltip='Add a Credit Card'
                        className='min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground'
                    >
                        <PlusCircle />
                        <span>Register Card</span>
                    </SidebarMenuButton>
                    {/* <Button
                        size='icon'
                        className='size-8 group-data-[collapsible=icon]:opacity-0'
                        variant='outline'
                    >
                        <MailIcon />
                        <span className='sr-only'>Inbox</span>
                    </Button> */}
                </SidebarMenuItem>
                <Collapsible defaultOpen={true} className='group/collapsible'>
                    <SidebarMenuItem>
                        <CollapsibleTrigger
                            render={
                                <SidebarMenuButton tooltip='Your cards added.'>
                                    {/* {icon && <item.icon />} */}
                                    <span>Master Card</span>
                                    <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                                </SidebarMenuButton>
                            }
                        ></CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {items.map((subItem) => (
                                    <SidebarMenuSubItem key={subItem.title}>
                                        <SidebarMenuSubButton
                                            render={
                                                <a href={subItem.url}>
                                                    {subItem.icon && (
                                                        <subItem.icon />
                                                    )}
                                                    <span>{subItem.title}</span>
                                                </a>
                                            }
                                        ></SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                ))}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </Collapsible>
            </SidebarMenu>
        </SidebarGroup>
    )
}
