import { PROVIDERS } from '@/db/generated/prisma/enums'
import { db } from '@/db/prisma'
import { COOKIES, DISCORD_URL_REDIRECT } from '@/lib/constants'
import { createJWT, encrypt, generateRefreshToken, weakHash } from '@/lib/crypt'
import {
    DISCORD_APLICATION_ID,
    DISCORD_CLIENT_SECRET,
    NODE_ENV,
    PUBLIC_KEY,
} from '@/lib/envs'
import { jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { Temporal } from 'temporal-polyfill'

interface DiscordAccessTokenResponse {
    token_type: 'Bearer'
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string
}
export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code')

    const prevsession = req.cookies.get(COOKIES.SESSION)?.value
    if (!code && prevsession) {
        const jwtPayload = await jwtVerify(prevsession, PUBLIC_KEY).catch(
            () => null,
        )
        if (jwtPayload) {
            return NextResponse.redirect(new URL('/dashboard', req.url))
        }
    }

    if (typeof code !== 'string') {
        const url = new URL('https://discord.com/oauth2/authorize')
        url.searchParams.append('client_id', DISCORD_APLICATION_ID)
        url.searchParams.append('response_type', 'code')
        url.searchParams.append('redirect_uri', DISCORD_URL_REDIRECT)
        url.searchParams.append('scope', 'identify+email+openid')
        return NextResponse.redirect(url)
    }
    const params = new URLSearchParams({
        client_id: DISCORD_APLICATION_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        redirect_uri: DISCORD_URL_REDIRECT,
        grant_type: 'authorization_code',
        code,
    })
    const request = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
    })
    const discordAccess = (await request.json()) as DiscordAccessTokenResponse

    const discord = await getDiscordData(discordAccess.access_token)

    const user = await getOrCreateAccount({
        email: discord.email,
        username: discord.username,
        access_token: discordAccess.access_token,
        refresh_token: discordAccess.refresh_token,
        provider_acccount_id: discord.id,
    })

    const expires_at = new Date(
        Temporal.Now.instant().add({
            hours: 24 * 7,
        }).epochMilliseconds,
    )
    const refresh_token = generateRefreshToken()
    const session = await db.session.create({
        data: {
            expires_at,
            refresh_token: weakHash(refresh_token),
            user_id: user.id,
        },
    })

    const jwt = await createJWT({
        sub: user.id,
        session_id: session.id,
    })

    const res = NextResponse.redirect(new URL('/dashboard', req.url))

    res.cookies.set(COOKIES.SESSION, jwt, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60,
    })

    res.cookies.set(COOKIES.REFRESH, refresh_token, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
    })

    return res
}

interface CreateAccountProps {
    email: string
    username: string
    provider_acccount_id: string
    access_token: string
    refresh_token: string
}
async function getOrCreateAccount({
    email,
    username,
    provider_acccount_id,
    access_token,
    refresh_token,
}: CreateAccountProps) {
    const user = await db.user.findFirst({
        where: {
            accounts: {
                some: {
                    provider_acccount_id,
                    provider: PROVIDERS.discord,
                },
            },
        },
    })
    if (!user) {
        return await db.user.create({
            data: {
                email,
                username,
                accounts: {
                    create: {
                        email,
                        provider: PROVIDERS.discord,
                        provider_acccount_id,
                        access_token: encrypt(access_token),
                        refresh_token: encrypt(refresh_token),
                    },
                },
            },
            include: {
                accounts: true,
            },
        })
    }
    const account = await db.account.create({
        data: {
            email,
            provider: PROVIDERS.discord,
            provider_acccount_id,
            access_token: encrypt(access_token),
            refresh_token: encrypt(refresh_token),
            user: {
                connect: {
                    id: user.id,
                },
            },
        },
    })
    return {
        ...user,
        accounts: [account],
    }
}

async function getDiscordData(token: string) {
    const request = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })
    const discordUser = (await request.json()) as DiscordDataResponse
    return discordUser
}

interface DiscordDataResponse {
    id: string
    username: string
    avatar: string
    discriminator: string
    public_flags: number
    flags: number
    banner: null
    accent_color: number
    global_name: string
    avatar_decoration_data: null
    collectibles: null
    display_name_styles: null
    banner_color: string
    clan: null
    primary_guild: null
    mfa_enabled: true
    locale: string
    premium_type: number
    email: string
    verified: boolean
}
