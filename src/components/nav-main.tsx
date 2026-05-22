'use client'

import { ChevronRight, CreditCardIcon, PlusCircle } from 'lucide-react'
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
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'

export function NavMain() {
    const openDialog = useCreateCardDialog((s) => s.toggle)
    const { cards } = useInfo(
        useShallow((s) => ({
            cards: s.cards,
        })),
    )

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
                </SidebarMenuItem>
                <Collapsible defaultOpen={true} className='group/collapsible'>
                    <SidebarMenuItem>
                        <CollapsibleTrigger
                            render={
                                <SidebarMenuButton tooltip='Your cards added.' />
                            }
                        >
                            <CreditCardIcon />
                            <span>Own Cards</span>
                            <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {cards.map((card) => (
                                    <SidebarMenuSubItem key={card.id}>
                                        <SidebarMenuSubButton
                                            render={
                                                <a
                                                    href={`/dashboard/card/${card.id}`}
                                                />
                                            }
                                        >
                                            {/* {card.icon && <card.icon />} */}
                                            <span>{card.name}</span>
                                        </SidebarMenuSubButton>
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
