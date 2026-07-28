'use client'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs'
import {
    Columns3Icon,
    ChevronDownIcon,
    PlusIcon,
    DollarSignIcon,
    Share2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { ChartAreaInteractive } from './chart-area-interactive'
import { ChargesDataTable } from './charges-data-table'
import { AgentTokensPanel } from './agent-tokens-panel'
import { PayChargesDialog } from './pay-charges-dialog'
import { useTableContext } from './table-context'
import { useInfo } from '@/stores/info.store'
import { ShareCardDialog } from './share-card-dialog'
import { BudgetCategoriesPanel } from './budget-categories-panel'
import { CardSyncStatus } from './card-sync-status'
import type { BillingPeriodOption } from './data-table'

export function DashboardTabs({
    openCreateDialog,
    periodMode,
    selectedPeriod,
    billingPeriods,
    onPeriodModeChange,
    onSelectedPeriodChange,
}: {
    openCreateDialog: (open: boolean) => void
    periodMode: 'month' | 'all'
    selectedPeriod: string
    billingPeriods: BillingPeriodOption[]
    onPeriodModeChange: (mode: 'month' | 'all') => void
    onSelectedPeriodChange: (period: string) => void
}) {
    const table = useTableContext()
    const [payOpen, setPayOpen] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [tab, setTab] = useState('charges')
    const cardAccess = useInfo((s) => s.cardAccess)
    const pendingMutationCount = useInfo((s) => s.pendingMutationCount)
    const conflictCount = useInfo((s) => s.syncConflicts.length)
    const syncStatus = useInfo((s) => s.syncStatus)
    const canWrite = cardAccess === 'owner' || cardAccess === 'write'
    const onlineServicesAvailable =
        syncStatus !== 'offline' &&
        syncStatus !== 'error' &&
        syncStatus !== 'unauthorized' &&
        syncStatus !== 'unavailable'
    const canShare = cardAccess === 'owner' && onlineServicesAvailable
    const canPay =
        canWrite &&
        pendingMutationCount === 0 &&
        conflictCount === 0 &&
        syncStatus !== 'offline' &&
        syncStatus !== 'error' &&
        syncStatus !== 'unauthorized'

    return (
        <div>
            <Tabs
                value={tab}
                onValueChange={(value) => {
                    if (value !== null) setTab(value)
                }}
                className='w-full flex-col justify-start gap-6'
            >
                <div className='flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6'>
                    <Label htmlFor='view-selector' className='sr-only'>
                        View
                    </Label>
                    <Select
                        value={tab}
                        onValueChange={(value) => {
                            if (value !== null) setTab(value)
                        }}
                        items={[
                            { label: 'Charges', value: 'charges' },
                            { label: 'Budgets', value: 'budgets' },
                            { label: 'Graph', value: 'graph' },
                            { label: 'Agents', value: 'agents' },
                        ]}
                    >
                        <SelectTrigger
                            className='flex w-fit @4xl/main:hidden'
                            size='sm'
                            id='view-selector'
                        >
                            <SelectValue placeholder='Select a view' />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value='charges'>Charges</SelectItem>
                                <SelectItem value='budgets'>Budgets</SelectItem>
                                <SelectItem value='graph'>Graph</SelectItem>
                                <SelectItem
                                    value='agents'
                                    disabled={!onlineServicesAvailable}
                                >
                                    Agents
                                </SelectItem>
                                <SelectItem value='focus-documents'>
                                    Focus Documents
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder='Filter charges...'
                        value={
                            (table
                                .getColumn('name')
                                ?.getFilterValue() as string) ?? ''
                        }
                        onChange={(event) =>
                            table
                                .getColumn('name')
                                ?.setFilterValue(event.target.value)
                        }
                        className='max-w-sm'
                    />
                    <Label htmlFor='period-selector' className='sr-only'>
                        Billing period
                    </Label>
                    <Select
                        value={periodMode === 'all' ? 'all' : selectedPeriod}
                        onValueChange={(value) => {
                            if (!value) return
                            if (value === 'all') {
                                onPeriodModeChange('all')
                                return
                            }
                            onSelectedPeriodChange(value)
                            onPeriodModeChange('month')
                        }}
                        items={[
                            { label: 'Corrido', value: 'all' },
                            ...billingPeriods,
                        ]}
                    >
                        <SelectTrigger
                            className='min-w-48'
                            size='sm'
                            id='period-selector'
                        >
                            <SelectValue placeholder='Periodo' />
                        </SelectTrigger>
                        <SelectContent align='end'>
                            <SelectGroup>
                                <SelectItem value='all'>Corrido</SelectItem>
                                {billingPeriods.map((period) => (
                                    <SelectItem
                                        key={period.value}
                                        value={period.value}
                                    >
                                        {period.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <TabsList className='hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex'>
                        <TabsTrigger value='charges'>Charges</TabsTrigger>
                        <TabsTrigger value='budgets'>Budgets</TabsTrigger>
                        <TabsTrigger value='graph'>Graph</TabsTrigger>
                        <TabsTrigger
                            value='agents'
                            disabled={!onlineServicesAvailable}
                        >
                            Agents
                        </TabsTrigger>
                        <TabsTrigger value='focus-documents'>
                            Focus Documents
                        </TabsTrigger>
                    </TabsList>
                    <div className='flex items-center gap-2'>
                        <CardSyncStatus />
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button variant='outline' size='sm' />}
                            >
                                <Columns3Icon data-icon='inline-start' />
                                <span className='hidden @4xl/main:inline'>Columns</span>
                                <ChevronDownIcon data-icon='inline-end' className='hidden @4xl/main:inline' />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end' className='w-32'>
                                {table
                                    .getAllColumns()
                                    .filter(
                                        (column) =>
                                            column.accessorFn === undefined &&
                                            column.getCanHide(),
                                    )
                                    .map((column) => {
                                        return (
                                            <DropdownMenuCheckboxItem
                                                key={column.id}
                                                className='capitalize'
                                                checked={column.getIsVisible()}
                                                onCheckedChange={(value) =>
                                                    column.toggleVisibility(!!value)
                                                }
                                            >
                                                {column.id}
                                            </DropdownMenuCheckboxItem>
                                        )
                                    })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant='default'
                            size='sm'
                            onClick={() => openCreateDialog(true)}
                            disabled={!canWrite}
                        >
                            <PlusIcon />
                            <span className='hidden lg:inline'>
                                Create Charge
                            </span>
                        </Button>
                        <Button
                            variant='outline'
                            size='sm'
                            onClick={() => setPayOpen(true)}
                            disabled={!canPay}
                        >
                            <DollarSignIcon />
                            <span className='hidden lg:inline'>
                                Pay
                            </span>
                        </Button>
                        {canShare && (
                            <Button
                                variant='outline'
                                size='sm'
                                onClick={() => setShareOpen(true)}
                            >
                                <Share2Icon />
                                <span className='hidden lg:inline'>
                                    Share
                                </span>
                            </Button>
                        )}
                    </div>
                </div>
                <TabsContent
                    value='charges'
                    className='relative flex flex-col gap-4 overflow-auto px-4 lg:px-6'
                >
                    <ChargesDataTable />
                </TabsContent>
                <TabsContent
                    value='graph'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <ChartAreaInteractive />
                </TabsContent>
                <TabsContent
                    value='budgets'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <BudgetCategoriesPanel />
                </TabsContent>
                <TabsContent
                    value='agents'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <AgentTokensPanel />
                </TabsContent>
                <TabsContent
                    value='focus-documents'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <div className='aspect-video w-full flex-1 rounded-lg border border-dashed'></div>
                </TabsContent>
            </Tabs>
            <PayChargesDialog open={payOpen} onOpenChange={setPayOpen} />
            <ShareCardDialog open={shareOpen} onOpenChange={setShareOpen} />
        </div>
    )
}
