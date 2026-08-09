import { PROVIDERS } from '@/db/generated/prisma/enums'
import { db } from '@/db/prisma'
import { COOKIES, DISCORD_URL_REDIRECT } from '@/lib/constants'
import { createJWT, encrypt, generateRefreshToken, weakHash } from '@/lib/crypt'
import {
    DISCORD_APLICATION_ID,
    DISCORD_CLIENT_SECRET,
    getPublicKey,
    NODE_ENV,
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

interface DiscordOAuthErrorResponse {
    error?: string
    error_description?: string
}

function redirectToLoginWithOAuthError(req: NextRequest) {
    const url = new URL('/auth/login', req.url)
    url.searchParams.set('error', 'discord_oauth')
    return NextResponse.redirect(url)
}

function isDiscordAccessTokenResponse(
    payload: unknown,
): payload is DiscordAccessTokenResponse {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'access_token' in payload &&
        typeof payload.access_token === 'string' &&
        'refresh_token' in payload &&
        typeof payload.refresh_token === 'string'
    )
}

type DiscordLoginResult =
    | { success: true; jwt: string; refreshToken: string }
    | {
          success: false
          status: number
          error: string
          description?: string
      }

const inFlightDiscordLogins = new Map<string, Promise<DiscordLoginResult>>()

function loginWithDiscordCode(code: string) {
    const existing = inFlightDiscordLogins.get(code)
    if (existing) return existing

    const login = completeDiscordLogin(code)
    inFlightDiscordLogins.set(code, login)
    void login.then(
        () => setTimeout(() => inFlightDiscordLogins.delete(code), 60_000),
        () => inFlightDiscordLogins.delete(code),
    )
    return login
}

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code')

    const prevsession = req.cookies.get(COOKIES.SESSION)?.value
    if (!code && prevsession) {
        const jwtPayload = await jwtVerify(
            prevsession,
            await getPublicKey(),
        ).catch(() => null)
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
    const login = await loginWithDiscordCode(code)
    if (!login.success) {
        console.error('Discord OAuth token exchange failed', {
            status: login.status,
            error: login.error,
            description: login.description,
        })
        return redirectToLoginWithOAuthError(req)
    }

    const res = NextResponse.redirect(new URL('/dashboard', req.url))

    res.cookies.set(COOKIES.SESSION, login.jwt, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60,
    })

    res.cookies.set(COOKIES.REFRESH, login.refreshToken, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
    })

    return res
}

async function completeDiscordLogin(code: string): Promise<DiscordLoginResult> {
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
    const discordAccess = (await request.json().catch(() => null)) as unknown
    if (!request.ok || !isDiscordAccessTokenResponse(discordAccess)) {
        const error = discordAccess as DiscordOAuthErrorResponse | null
        return {
            success: false,
            status: request.status,
            error: error?.error ?? 'invalid_response',
            description: error?.error_description,
        }
    }

    const discord = await getDiscordData(discordAccess.access_token)
    if (!discord) {
        return {
            success: false,
            status: 502,
            error: 'user_lookup_failed',
        }
    }

    const user = await getOrCreateAccount({
        email: discord.email,
        username: discord.username,
        access_token: discordAccess.access_token,
        refresh_token: discordAccess.refresh_token,
        provider_acccount_id: discord.id,
    })
    const refreshToken = generateRefreshToken()
    const session = await db.session.create({
        data: {
            expires_at: new Date(
                Temporal.Now.instant().add({ hours: 24 * 7 }).epochMilliseconds,
            ),
            refresh_token: weakHash(refreshToken),
            user_id: user.id,
        },
    })
    const jwt = await createJWT({
        sub: user.id,
        session_id: session.id,
    })
    return { success: true, jwt, refreshToken }
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
    const existing = await db.account.findFirst({
        where: {
            provider_acccount_id,
            provider: PROVIDERS.discord,
        },
        include: { user: true },
    })
    if (existing) {
        await db.account.update({
            where: { id: existing.id },
            data: {
                email,
                access_token: encrypt(access_token),
                refresh_token: encrypt(refresh_token),
            },
        })
        if (existing.user.email !== email) {
            await db.user.update({
                where: { id: existing.user.id },
                data: { email },
            })
        }
        return existing.user
    }
    const byEmail = await db.user.findFirst({
        where: { email },
    })
    if (byEmail) {
        await db.account.create({
            data: {
                email,
                provider: PROVIDERS.discord,
                provider_acccount_id,
                access_token: encrypt(access_token),
                refresh_token: encrypt(refresh_token),
                user_id: byEmail.id,
            },
        })
        return byEmail
    }
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
        include: { accounts: true },
    })
}

async function getDiscordData(token: string) {
    const request = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })
    const discordUser = (await request.json().catch(() => null)) as unknown
    if (!request.ok || !isDiscordDataResponse(discordUser)) {
        console.error('Discord user lookup failed', {
            status: request.status,
        })
        return null
    }
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

function isDiscordDataResponse(payload: unknown): payload is DiscordDataResponse {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'id' in payload &&
        typeof payload.id === 'string' &&
        'email' in payload &&
        typeof payload.email === 'string' &&
        'username' in payload &&
        typeof payload.username === 'string'
    )
}
