'use client'

import {
    ChevronRight,
    CreditCardIcon,
    PlusCircle,
    Share2Icon,
    UsersRoundIcon,
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
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'

export function NavMain() {
    const openDialog = useCreateCardDialog((s) => s.toggle)
    const { ownCards, sharedByMeCards, sharedWithMeCards } = useInfo(
        useShallow((s) => ({
            ownCards: s.ownCards,
            sharedByMeCards: s.sharedByMeCards,
            sharedWithMeCards: s.sharedWithMeCards,
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
                                {ownCards.map((card) => (
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
                <Collapsible defaultOpen={true} className='group/collapsible'>
                    <SidebarMenuItem>
                        <CollapsibleTrigger
                            render={
                                <SidebarMenuButton tooltip='Cards you shared.' />
                            }
                        >
                            <Share2Icon />
                            <span>Shared by You</span>
                            <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {sharedByMeCards.length === 0 && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton>
                                            <span className='text-muted-foreground'>
                                                No shared cards
                                            </span>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                                {sharedByMeCards.map((card) => (
                                    <SidebarMenuSubItem key={card.id}>
                                        <SidebarMenuSubButton
                                            render={
                                                <a
                                                    href={`/dashboard/card/${card.id}`}
                                                />
                                            }
                                        >
                                            <span>{card.name}</span>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                ))}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </Collapsible>
                <Collapsible defaultOpen={true} className='group/collapsible'>
                    <SidebarMenuItem>
                        <CollapsibleTrigger
                            render={
                                <SidebarMenuButton tooltip='Cards shared with you.' />
                            }
                        >
                            <UsersRoundIcon />
                            <span>Shared with You</span>
                            <ChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {sharedWithMeCards.length === 0 && (
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton>
                                            <span className='text-muted-foreground'>
                                                No shared cards
                                            </span>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                )}
                                {sharedWithMeCards.map((card) => (
                                    <SidebarMenuSubItem key={card.id}>
                                        <SidebarMenuSubButton
                                            render={
                                                <a
                                                    href={`/dashboard/card/${card.id}`}
                                                />
                                            }
                                        >
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
