import type { SerializedCharge } from '@/lib/card-sync.types'

export type ClientMutationType =
    | 'charge.create'
    | 'charge.update'
    | 'charge.delete'

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

export type ClientMutation =
    | ChargeCreateMutation
    | ChargeUpdateMutation
    | ChargeDeleteMutation

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
    deletedChargeId?: string
}

export type ConflictClientMutationResult = ClientMutationResultBase<
    ClientMutationType,
    'conflict'
> & {
    serverCharge: SerializedCharge
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
