'use client'

import { getCurrentUserAction } from '@/actions/users.actionl'
import { create } from 'zustand'

interface UserStore {
    username: string
    email: string
    id: string
    avatar: string
    fetch(): void
}
export const useUser = create<UserStore>((set) => ({
    username: '',
    email: '',
    id: '',
    avatar: '/avatars/shadcn.jpg',
    fetch: () => {
        getCurrentUserAction().then((user) => {
            if (user) {
                set({ email: user.email, username: user.username, id: user.id })
            }
        })
    },
}))
