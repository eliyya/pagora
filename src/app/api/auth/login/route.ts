import { app } from '@/lib/routes'
import { createDiscordPKCE, readDiscordVerifier, DISCORD_OAUTH_COOKIE, DISCORD_OAUTH_MAX_AGE } from '@/lib/discord-pkce'
import { PROVIDERS } from '@/db/generated/prisma/enums'
import { db } from '@/db/prisma'
import { COOKIES, DISCORD_URL_REDIRECT } from '@/lib/constants'
import { createJWT, encrypt, generateRefreshToken, weakHash } from '@/lib/crypt'
import {
    APP_URL,
    DISCORD_APLICATION_ID,
    NODE_ENV,
} from '@/lib/envs'
import { verifySessionJWT } from '@/lib/session-jwt'
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

function redirectToLoginWithOAuthError() {
    const url = new URL(app.auth.login(), APP_URL)
    url.searchParams.set('error', 'discord_oauth')
    return clearOAuthCookie(NextResponse.redirect(url))
}

function clearOAuthCookie(response: NextResponse) {
    response.cookies.set(DISCORD_OAUTH_COOKIE, '', { httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax', path: app.api.auth.login(), maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    return response
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

function loginWithDiscordCode(code: string, verifier: string) {
    const key = weakHash(`${code}:${verifier}`)
    const existing = inFlightDiscordLogins.get(key)
    if (existing) return existing

    const login = completeDiscordLogin(code, verifier)
    inFlightDiscordLogins.set(key, login)
    void login.then(
        () => setTimeout(() => inFlightDiscordLogins.delete(key), 60_000),
        () => inFlightDiscordLogins.delete(key),
    )
    return login
}

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code')
    if (req.nextUrl.searchParams.has('error')) return redirectToLoginWithOAuthError()

    const prevsession = req.cookies.get(COOKIES.SESSION)?.value
    if (!code && prevsession) {
        const jwtPayload = await verifySessionJWT(prevsession).catch(() => null)
        if (jwtPayload) {
            return NextResponse.redirect(new URL(app.dashboard(), APP_URL))
        }
    }

    if (typeof code !== 'string') {
        if (req.nextUrl.searchParams.has('state')) return redirectToLoginWithOAuthError()
        const pkce = await createDiscordPKCE()
        const url = new URL('https://discord.com/oauth2/authorize')
        url.searchParams.append('client_id', DISCORD_APLICATION_ID)
        url.searchParams.append('response_type', 'code')
        url.searchParams.append('redirect_uri', DISCORD_URL_REDIRECT)
        url.searchParams.append('scope', 'identify email openid')
        url.searchParams.set('state', pkce.state)
        url.searchParams.set('code_challenge', pkce.challenge)
        url.searchParams.set('code_challenge_method', 'S256')
        const response = NextResponse.redirect(url)
        response.headers.set('Cache-Control', 'no-store')
        response.cookies.set(DISCORD_OAUTH_COOKIE, pkce.cookie, {
            httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax',
            path: app.api.auth.login(), maxAge: DISCORD_OAUTH_MAX_AGE,
        })
        return response
    }
    const verifier = await readDiscordVerifier(
        req.cookies.get(DISCORD_OAUTH_COOKIE)?.value,
        req.nextUrl.searchParams.get('state'),
    )
    if (!code || !verifier) {
        console.error('Discord OAuth callback rejected', {
            hasCode: Boolean(code),
            hasState: Boolean(req.nextUrl.searchParams.get('state')),
            hasOAuthCookie: Boolean(req.cookies.get(DISCORD_OAUTH_COOKIE)?.value),
        })
        return redirectToLoginWithOAuthError()
    }
    let login: DiscordLoginResult
    try {
        login = await loginWithDiscordCode(code, verifier)
    } catch (error) {
        console.error('Discord OAuth login failed', {
            name: error instanceof Error ? error.name : 'UnknownError',
        })
        return redirectToLoginWithOAuthError()
    }
    if (!login.success) {
        console.error('Discord OAuth token exchange failed', {
            status: login.status,
            error: login.error,
            description: login.description,
        })
        return redirectToLoginWithOAuthError()
    }

    const res = NextResponse.redirect(new URL(app.dashboard(), APP_URL))

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

    return clearOAuthCookie(res)
}

async function completeDiscordLogin(code: string, verifier: string): Promise<DiscordLoginResult> {
    const params = new URLSearchParams({
        client_id: DISCORD_APLICATION_ID,
        code_verifier: verifier,
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
