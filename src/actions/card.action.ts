'use server'
import { db } from '@/db/prisma'
import {
    CreateCard,
    CreateCardSchema,
    DEFAULT_CREATE_CARD_VALUE,
} from '@/schemas/card.schema'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getCurrentUserAction } from './users.action'
import { Card } from '@/db/generated/prisma/browser'
import {
    assertCardOwner,
    listCardsForUser,
    normalizeCardPermission,
} from '@/lib/card-access'

export async function createCardAction({
    brand,
    closing_day,
    credit_limit,
    due_day,
    last4,
    name,
    owner_id,
    bank,
}: CreateCard & { owner_id: string }) {
    const charge = await db.card.create({
        data: {
            owner_id,
            closing_day,
            credit_limit,
            due_day,
            last4,
            name,
            bank,
            brand,
        },
    })
    revalidateTag('cards', 'max')
    return charge
}

interface CreateChargueState {
    fields: CreateCard
    fieldErrors?: ReturnType<typeof z.flattenError<CreateCard>>['fieldErrors']
    formErrors?: string[]
    done?: Card
    lastCardId?: string
}
export async function createCardFormAction(
    state: CreateChargueState,
    formData: FormData,
): Promise<CreateChargueState> {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            fields: state.fields,
            formErrors: ['User not found'],
        }
    }
    const formObject = Object.fromEntries(formData)
    const parsed = CreateCardSchema.safeParse(formObject)
    if (!parsed.success) {
        const errors = z.flattenError(parsed.error)
        return {
            fields: state.fields,
            fieldErrors: errors.fieldErrors,
            formErrors: errors.formErrors,
        }
    }

    const newCard = await createCardAction({
        ...parsed.data,
        owner_id: user.id,
    })

    return {
        fields: DEFAULT_CREATE_CARD_VALUE,
        done: newCard,
        lastCardId: newCard.id,
    }
}

export async function getOwnCardsAction() {
    const user = await getCurrentUserAction()
    if (!user) {
        return []
    }
    const cards = db.card.findMany({
        where: { owner_id: user.id },
    })
    return cards
}

export async function getCardSectionsAction() {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            own: [],
            sharedByMe: [],
            sharedWithMe: [],
            pendingInvitations: 0,
        }
    }

    const [sections, sharedByMe, pendingInvitations] = await Promise.all([
        listCardsForUser(user.id),
        db.card.findMany({
            where: {
                owner_id: user.id,
                OR: [
                    { members: { some: {} } },
                    { invitations: { some: { status: 'pending' } } },
                ],
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: { created_at: 'asc' },
                },
                invitations: {
                    where: { status: 'pending' },
                    include: {
                        invitee: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: { created_at: 'desc' },
                },
            },
            orderBy: { name: 'asc' },
        }),
        db.cardInvitation.count({
            where: { invitee_id: user.id, status: 'pending' },
        }),
    ])

    return {
        own: sections.own,
        sharedByMe,
        sharedWithMe: sections.sharedWithMe,
        pendingInvitations,
    }
}

export async function inviteCardUserAction(
    cardId: string,
    username: string,
    permission: unknown,
) {
    const user = await getCurrentUserAction()
    if (!user) {
        return { error: 'unauthorized' as const }
    }

    const targetUsername = username.trim()
    if (!targetUsername) {
        return { error: 'username is required' as const }
    }

    try {
        await assertCardOwner(cardId, user.id)
        const invitee = await db.user.findUnique({
            where: { username: targetUsername },
        })
        if (!invitee) {
            return { error: 'user not found' as const }
        }
        if (invitee.id === user.id) {
            return { error: 'you already own this card' as const }
        }

        const existingMember = await db.cardMember.findUnique({
            where: { card_id_user_id: { card_id: cardId, user_id: invitee.id } },
        })
        if (existingMember) {
            return { error: 'user already has access' as const }
        }

        const existingPending = await db.cardInvitation.findFirst({
            where: {
                card_id: cardId,
                invitee_id: invitee.id,
                status: 'pending',
            },
        })
        const normalizedPermission = normalizeCardPermission(permission)
        const invitation = existingPending
            ? await db.cardInvitation.update({
                  where: { id: existingPending.id },
                  data: {
                      permission: normalizedPermission,
                      inviter_id: user.id,
                  },
              })
            : await db.cardInvitation.create({
                  data: {
                      card_id: cardId,
                      inviter_id: user.id,
                      invitee_id: invitee.id,
                      permission: normalizedPermission,
                  },
              })

        return { data: invitation }
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'invite failed',
        }
    }
}

export async function listPendingCardInvitationsAction() {
    const user = await getCurrentUserAction()
    if (!user) return []

    return await db.cardInvitation.findMany({
        where: { invitee_id: user.id, status: 'pending' },
        include: {
            card: true,
            inviter: {
                select: {
                    id: true,
                    username: true,
                    email: true,
                },
            },
        },
        orderBy: { created_at: 'desc' },
    })
}

export async function respondToCardInvitationAction(
    invitationId: string,
    response: 'accept' | 'decline',
) {
    const user = await getCurrentUserAction()
    if (!user) {
        return { error: 'unauthorized' as const }
    }

    const invitation = await db.cardInvitation.findFirst({
        where: {
            id: invitationId,
            invitee_id: user.id,
            status: 'pending',
        },
    })
    if (!invitation) {
        return { error: 'invitation not found' as const }
    }

    if (response === 'decline') {
        const declined = await db.cardInvitation.update({
            where: { id: invitation.id },
            data: {
                status: 'declined',
                responded_at: new Date(),
            },
        })
        return { data: declined }
    }

    const accepted = await db.$transaction(async (tx) => {
        await tx.cardMember.upsert({
            where: {
                card_id_user_id: {
                    card_id: invitation.card_id,
                    user_id: invitation.invitee_id,
                },
            },
            update: { permission: invitation.permission },
            create: {
                card_id: invitation.card_id,
                user_id: invitation.invitee_id,
                permission: invitation.permission,
            },
        })
        return await tx.cardInvitation.update({
            where: { id: invitation.id },
            data: {
                status: 'accepted',
                responded_at: new Date(),
            },
        })
    })

    return { data: accepted }
}
