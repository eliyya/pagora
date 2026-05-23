'use client'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteChargeDialogState } from '@/stores/delete-charge.store'
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'

export function DeleteChargeDialog() {
    const { open, chargeId, toggle } = useDeleteChargeDialogState(
        useShallow((state) => ({
            open: state.open,
            chargeId: state.chargeId,
            toggle: state.toggle,
        })),
    )
    const deleteCharge = useInfo((s) => s.deleteCharge)
    const charge = useInfo((s) =>
        s.charges.find((c) => c.id === chargeId),
    )

    async function handleConfirm() {
        if (!chargeId) return
        await deleteCharge(chargeId)
        toggle(false)
    }

    return (
        <AlertDialog open={open} onOpenChange={toggle}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Charge</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete the charge <strong>{charge?.name}</strong> for{' '}
                        <strong>
                            ${(charge?.amount ?? 0) / 100}
                        </strong>
                        ? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className='flex gap-2'>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    >
                        Delete
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    )
}
