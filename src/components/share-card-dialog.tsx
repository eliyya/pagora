'use client'

import { inviteCardUserAction } from '@/actions/card.action'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
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
import { useInfo } from '@/stores/info.store'
import { FormEvent, useState } from 'react'

export function ShareCardDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const card = useInfo((s) => s.card)
    const refreshCards = useInfo((s) => s.refreshCards)
    const [username, setUsername] = useState('')
    const [permission, setPermission] = useState<'read' | 'write'>('read')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    function reset() {
        setUsername('')
        setPermission('read')
        setError(null)
        setSuccess(null)
        setPending(false)
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!card) return
        const trimmed = username.trim()
        if (!trimmed) {
            setError('Username is required')
            return
        }
        setPending(true)
        setError(null)
        setSuccess(null)
        const result = await inviteCardUserAction(card.id, trimmed, permission)
        setPending(false)
        if (result.error) {
            setError(result.error)
            return
        }
        setSuccess(`Invitation sent to ${trimmed}`)
        setUsername('')
        await refreshCards()
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className='sm:max-w-sm'>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Share Card</DialogTitle>
                        <DialogDescription>
                            Invite another user to access this card.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <Label htmlFor='share-username'>Username</Label>
                            <Input
                                id='share-username'
                                value={username}
                                onChange={(event) =>
                                    setUsername(event.target.value)
                                }
                                placeholder='username'
                            />
                            {error && <FieldError>{error}</FieldError>}
                            {success && (
                                <p className='text-xs text-muted-foreground'>
                                    {success}
                                </p>
                            )}
                        </Field>
                        <Field>
                            <Label>Permission</Label>
                            <Select
                                value={permission}
                                onValueChange={(value) => {
                                    if (value === 'read' || value === 'write') {
                                        setPermission(value)
                                    }
                                }}
                                items={[
                                    { label: 'Read only', value: 'read' },
                                    { label: 'Read and write', value: 'write' },
                                ]}
                            >
                                <SelectTrigger className='w-full'>
                                    <SelectValue placeholder='Permission' />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value='read'>
                                            Read only
                                        </SelectItem>
                                        <SelectItem value='write'>
                                            Read and write
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose
                            render={<Button variant='outline'>Cancel</Button>}
                        />
                        <Button type='submit' disabled={pending}>
                            Send invitation
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
