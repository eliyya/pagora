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
import { useState } from 'react'

export function DeleteChargeDialog() {
    const { open, chargeId, toggle } = useDeleteChargeDialogState(
        useShallow((state) => ({
            open: state.open,
            chargeId: state.chargeId,
            toggle: state.toggle,
        })),
    )
    const deleteCharge = useInfo((s) => s.deleteCharge)
    const [deleting, setDeleting] = useState(false)
    const charge = useInfo((s) =>
        s.charges.find((c) => c.id === chargeId),
    )
    const isInstallmentParent = charge?.kind === 'installment_parent'
    const isInstallment = charge?.kind === 'installment'
    const deleteBlocked =
        !charge ||
        isInstallment ||
        (isInstallmentParent && charge.paid > 0)

    async function handleConfirm() {
        if (!chargeId || deleting || deleteBlocked) return
        setDeleting(true)
        try {
            const deleted = await deleteCharge(chargeId)
            if (deleted) toggle(false)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={toggle}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Charge</AlertDialogTitle>
                    <AlertDialogDescription>
                        {isInstallment ? (
                            <>
                                Las mensualidades no se eliminan por separado.
                                Administra el plan desde su cargo principal.
                            </>
                        ) : isInstallmentParent && charge.paid > 0 ? (
                            <>
                                El plan <strong>{charge.name}</strong> ya tiene
                                pagos registrados y no se puede eliminar.
                            </>
                        ) : isInstallmentParent ? (
                            <>
                                Se eliminarán el cargo principal{' '}
                                <strong>{charge.name}</strong> y sus{' '}
                                <strong>{charge.installment_count}</strong>{' '}
                                mensualidades. Esta acción no se puede deshacer.
                            </>
                        ) : (
                            <>
                                Are you sure you want to delete the charge{' '}
                                <strong>{charge?.name}</strong> for{' '}
                                <strong>${(charge?.amount ?? 0) / 100}</strong>?
                                This action cannot be undone.
                            </>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className='flex gap-2'>
                    <AlertDialogCancel disabled={deleting}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        disabled={deleting || deleteBlocked}
                        className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    >
                        {deleting ? 'Saving locally…' : 'Delete'}
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    )
}
