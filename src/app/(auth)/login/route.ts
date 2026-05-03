import { PROVIDERS } from '@/db/generated/prisma/enums'
import { db } from '@/db/prisma'
import { encrypt, generateRefreshToken } from '@/lib/crypt'
import {
    DISCORD_APLICATION_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_URL_REDIRECT,
    PRIVATE_KEY,
} from '@/lib/envs'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

interface DiscordAccessTokenResponse {
    token_type: 'Bearer'
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string
}
export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code')
    if (typeof code !== 'string') {
        return NextResponse.redirect(process.env.DISCORD_URL_LOGIN!)
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
            hours: 1,
        }).epochMilliseconds,
    )
    const refresh_token = generateRefreshToken()
    const session = await db.session.create({
        data: { expires_at, refresh_token, user_id: user.id },
    })

    const issuer =
        process.env.NODE_ENV === 'production'
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : `http://${process.env.NEXT_PUBLIC_VERCEL_URL}`

    const jwt = await new SignJWT({
        session_id: session.id,
    })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setSubject(user.id)
        .setIssuer(issuer)
        .setAudience('pagora')
        .setExpirationTime('1h')
        .sign(PRIVATE_KEY)

    const cookieStore = await cookies()

    cookieStore.set('session', jwt, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: discordAccess.expires_in * 1000,
    })

    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
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
