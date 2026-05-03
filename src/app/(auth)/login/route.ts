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
    const response = (await request.json()) as DiscordAccessTokenResponse
    const discord = await getDiscordData(response.access_token)
    console.log(discord)

    const issuer =
        process.env.NODE_ENV === 'production'
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : `http://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    const jwt = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience('pagora')
        .setExpirationTime('1h')
        .sign(PRIVATE_KEY)
    const cookieStore = await cookies()
    cookieStore.set('session', jwt, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: response.expires_in * 1000,
    })
    cookieStore.set('discord-session', response.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: response.expires_in * 1000,
    })
    cookieStore.set('discord-refresh', response.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: response.expires_in * 1000,
    })
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
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
