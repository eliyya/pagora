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
import { toast } from 'sonner'

export function ShareCardDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const card = useInfo((s) => s.card)
    const refreshCards = useInfo((s) => s.refreshCards)
    const [userIdentifier, setUserIdentifier] = useState('')
    const [permission, setPermission] = useState<'read' | 'write'>('read')
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    function reset() {
        setUserIdentifier('')
        setPermission('read')
        setError(null)
        setPending(false)
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) reset()
        onOpenChange(nextOpen)
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!card) return
        const trimmed = userIdentifier.trim()
        if (!trimmed) {
            setError('Username or email is required')
            return
        }
        setPending(true)
        setError(null)
        const result = await inviteCardUserAction(card.id, trimmed, permission)
        setPending(false)
        if (result.error) {
            setError(result.error)
            return
        }
        await refreshCards()
        toast.success('Invitation sent', {
            description: `Sent to ${trimmed}`,
        })
        handleOpenChange(false)
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
                            <Label htmlFor='share-user'>Username or email</Label>
                            <Input
                                id='share-user'
                                value={userIdentifier}
                                onChange={(event) =>
                                    setUserIdentifier(event.target.value)
                                }
                                placeholder='user@example.com'
                            />
                            {error && <FieldError>{error}</FieldError>}
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
