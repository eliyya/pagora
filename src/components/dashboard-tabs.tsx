'use client'

import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import { useState } from 'react'
import { ChartAreaInteractive } from './chart-area-interactive'
import { ChargesDataTable } from './charges-data-table'
import { PayChargesDialog } from './pay-charges-dialog'
import { useTableContext } from './table-context'

export function DashboardTabs({
    openCreateDialog,
}: {
    openCreateDialog: (open: boolean) => void
}) {
    const table = useTableContext()
    const [payOpen, setPayOpen] = useState(false)
    const [tab, setTab] = useState('charges')

    return (
        <div>
            <Tabs
                value={tab}
                onValueChange={(value) => {
                    if (value !== null) setTab(value)
                }}
                className='w-full flex-col justify-start gap-6'
            >
                <div className='flex items-center justify-between px-4 lg:px-6'>
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
                            { label: 'Graph', value: 'graph' },
                            { label: 'Key Personnel', value: 'key-personnel' },
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
                                <SelectItem value='graph'>Graph</SelectItem>
                                <SelectItem value='key-personnel'>
                                    Key Personnel
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
                    <TabsList className='hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex'>
                        <TabsTrigger value='charges'>Charges</TabsTrigger>
                        <TabsTrigger value='graph'>Graph</TabsTrigger>
                        <TabsTrigger value='key-personnel'>
                            Key Personnel <Badge variant='secondary'>2</Badge>
                        </TabsTrigger>
                        <TabsTrigger value='focus-documents'>
                            Focus Documents
                        </TabsTrigger>
                    </TabsList>
                    <div className='flex items-center gap-2'>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button variant='outline' size='sm' />}
                            >
                                <Columns3Icon data-icon='inline-start' />
                                Columns
                                <ChevronDownIcon data-icon='inline-end' />
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
                        >
                            <DollarSignIcon />
                            <span className='hidden lg:inline'>
                                Pay
                            </span>
                        </Button>
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
                    value='key-personnel'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <div className='aspect-video w-full flex-1 rounded-lg border border-dashed'></div>
                </TabsContent>
                <TabsContent
                    value='focus-documents'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <div className='aspect-video w-full flex-1 rounded-lg border border-dashed'></div>
                </TabsContent>
            </Tabs>
            <PayChargesDialog open={payOpen} onOpenChange={setPayOpen} />
        </div>
    )
}
