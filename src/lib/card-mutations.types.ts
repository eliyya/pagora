import type { SerializedCharge } from '@/lib/card-sync.types'
import type { InstallmentPlanInput } from '@/lib/installments'

export type ClientMutationType =
    | 'charge.create'
    | 'charge.update'
    | 'charge.delete'
    | 'installment.create'
    | 'installment.update'
    | 'installment.delete'

type ClientMutationBase<TType extends ClientMutationType> = {
    mutationId: string
    type: TType
    occurredAt: string
    dependsOn?: string[]
}

export type ChargeCreateMutation = ClientMutationBase<'charge.create'> & {
    charge: {
        id: string
        name: string
        amount: number
        categoryId?: string | null
        categoryName?: string | null
    }
}

export type ChargeUpdateMutation = ClientMutationBase<'charge.update'> & {
    chargeId: string
    baseRevision: number
    name: string
    amount: number
    categoryId?: string | null
    categoryName?: string | null
}

export type ChargeDeleteMutation = ClientMutationBase<'charge.delete'> & {
    chargeId: string
    baseRevision: number
}

export type InstallmentPlanMutationPayload = InstallmentPlanInput & {
    id: string
    name: string
    amount: number
    categoryId?: string | null
    categoryName?: string | null
    installmentIds: string[]
}

export type InstallmentCreateMutation =
    ClientMutationBase<'installment.create'> & {
        plan: InstallmentPlanMutationPayload
    }

export type InstallmentUpdateMutation =
    ClientMutationBase<'installment.update'> & {
        plan: InstallmentPlanMutationPayload
        baseRevision: number
    }

export type InstallmentDeleteMutation =
    ClientMutationBase<'installment.delete'> & {
        parentId: string
        baseRevision: number
    }

export type ClientMutation =
    | ChargeCreateMutation
    | ChargeUpdateMutation
    | ChargeDeleteMutation
    | InstallmentCreateMutation
    | InstallmentUpdateMutation
    | InstallmentDeleteMutation

type ClientMutationResultBase<
    TType extends ClientMutationType,
    TStatus extends
        | 'applied'
        | 'conflict'
        | 'gone'
        | 'rejected'
        | 'dependency-failed',
> = {
    mutationId: string
    type: TType
    status: TStatus
}

export type AppliedClientMutationResult = ClientMutationResultBase<
    ClientMutationType,
    'applied'
> & {
    cursor: number
    charge?: SerializedCharge
    charges?: SerializedCharge[]
    deletedChargeId?: string
    deletedChargeIds?: string[]
}

export type ConflictClientMutationResult = ClientMutationResultBase<
    ClientMutationType,
    'conflict'
> & {
    serverCharge: SerializedCharge
    serverCharges?: SerializedCharge[]
}

export type GoneClientMutationResult = ClientMutationResultBase<
    ClientMutationType,
    'gone'
>

export type RejectedClientMutationResult = ClientMutationResultBase<
    ClientMutationType,
    'rejected'
> & {
    reason: string
}

export type DependencyFailedClientMutationResult =
    ClientMutationResultBase<
        ClientMutationType,
        'dependency-failed'
    > & {
        dependencyMutationId: string
    }

export type ClientMutationResult =
    | AppliedClientMutationResult
    | ConflictClientMutationResult
    | GoneClientMutationResult
    | RejectedClientMutationResult
    | DependencyFailedClientMutationResult

export type PushCardMutationsRequest = {
    mutations: ClientMutation[]
}

export type PushCardMutationsResponse = {
    results: ClientMutationResult[]
}
