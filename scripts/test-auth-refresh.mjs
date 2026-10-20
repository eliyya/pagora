import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { Temporal } from 'temporal-polyfill'

const directory = await mkdtemp(join(tmpdir(), 'pagora-auth-refresh-'))
try {
    const outfile = join(directory, 'auth-refresh.cjs')
    await build({
        stdin: {
            contents: `export { proxy, config } from './src/proxy';
                export { NextRequest } from 'next/server';
                export { fixture } from 'auth-test-fixture';`,
            resolveDir: process.cwd(),
        },
        bundle: true, platform: 'node', format: 'cjs', outfile,
        plugins: [{
            name: 'isolated-auth-tests',
            setup(build) {
                build.onResolve({ filter: /^auth-test-fixture$/ }, () => ({ path: 'fixture', namespace: 'auth-test' }))
                build.onResolve({ filter: /^(?:@\/|\.\/)(?:lib\/(?:crypt|envs|session-jwt)|db\/prisma)$/ }, (args) => ({ path: args.path, namespace: 'auth-test' }))
                build.onLoad({ filter: /.*/, namespace: 'auth-test' }, ({ path }) => {
                    if (path === 'fixture') return { contents: 'export const fixture = { session: null, rotations: [], deletions: [], lookups: 0, rotationCount: 1 };' }
                    if (path.endsWith('envs')) return { contents: "export const APP_URL = 'https://pagora.test'; export const NODE_ENV = 'production';" }
                    if (path.endsWith('session-jwt')) return { contents: "export async function verifySessionJWT(token) { if (token !== 'valid') throw new Error('expired'); return { payload: { sub: 'user' } }; }" }
                    if (path.endsWith('crypt')) return { contents: "export const weakHash = (value) => 'hash:' + value; export const generateRefreshToken = () => 'rotated-refresh'; export const createJWT = async () => 'renewed-jwt';" }
                    return { contents: `import { fixture } from 'auth-test-fixture';
                        export const db = { session: {
                            findUnique: async () => { fixture.lookups++; return fixture.session; },
                            updateMany: async (args) => { fixture.rotations.push(args); return { count: fixture.rotationCount }; },
                            deleteMany: async (args) => { fixture.deletions.push(args); return { count: 1 }; },
                        } };` }
                })
            },
        }],
    })
    const { proxy, config, NextRequest, fixture } = createRequire(import.meta.url)(outfile)
    const request = (path, cookie = '') => new NextRequest(`https://internal.test${path}`, { headers: { cookie } })
    const reset = () => Object.assign(fixture, { session: null, rotations: [], deletions: [], lookups: 0, rotationCount: 1 })
    const validSession = () => ({ id: 'session', user_id: 'user', expires_at: Temporal.Now.instant().add({ hours: 24 }).toString() })

    for (const path of ['/auth/login', '/api/auth/login']) {
        assert.ok(config.matcher.includes(path))
        for (const accessCookie of ['', 'session=expired; ']) {
            reset()
            fixture.session = validSession()
            const before = Temporal.Now.instant()
            const response = await proxy(request(path, `${accessCookie}refresh=original`))
            const after = Temporal.Now.instant()
            assert.equal(response.headers.get('location'), 'https://pagora.test/dashboard')
            assert.equal(response.headers.get('cache-control'), 'no-store')
            for (const [name, value, maxAge] of [['session', 'renewed-jwt', 3600], ['refresh', 'rotated-refresh', 604800]]) {
                const cookie = response.cookies.get(name)
                assert.equal(cookie.value, value)
                assert.equal(cookie.path, '/')
                assert.equal(cookie.maxAge, maxAge)
                assert.equal(cookie.httpOnly, true)
                assert.equal(cookie.secure, true)
                assert.equal(cookie.sameSite, 'lax')
            }
            assert.equal(fixture.rotations.length, 1)
            assert.deepEqual(fixture.rotations[0].where, { id: 'session', refresh_token: 'hash:original' })
            assert.equal(fixture.rotations[0].data.refresh_token, 'hash:rotated-refresh')
            const expiry = Temporal.Instant.from(fixture.rotations[0].data.expires_at.toISOString())
            assert.ok(Temporal.Instant.compare(expiry, before.add({ hours: 168 })) >= 0)
            assert.ok(Temporal.Instant.compare(expiry, after.add({ hours: 168 })) <= 0)
        }
        for (const state of ['missing', 'unknown', 'expired', 'rotation-lost']) {
            reset()
            if (state === 'expired') fixture.session = { ...validSession(), expires_at: Temporal.Now.instant().subtract({ hours: 1 }).toString() }
            if (state === 'rotation-lost') { fixture.session = validSession(); fixture.rotationCount = 0 }
            const response = await proxy(request(path, state === 'missing' ? '' : 'session=expired; refresh=original'))
            assert.equal(response.headers.get('x-middleware-next'), '1')
            assert.equal(response.headers.get('location'), null)
            assert.equal(response.cookies.getAll().length, 0)
            assert.equal(fixture.deletions.length, state === 'expired' ? 1 : 0)
        }
        reset()
        const response = await proxy(request(path, 'session=valid; refresh=original'))
        assert.equal(response.headers.get('location'), 'https://pagora.test/dashboard')
        assert.equal(fixture.lookups, 0)
    }
    for (const query of ['code=discord&state=ok', 'code=', 'state=bad', 'error=access_denied']) {
        reset()
        fixture.session = validSession()
        const response = await proxy(request(`/api/auth/login?${query}`, 'session=valid; refresh=original'))
        assert.equal(response.headers.get('x-middleware-next'), '1')
        assert.equal(response.headers.get('location'), null)
        assert.equal(fixture.lookups, 0)
    }
    reset()
    fixture.session = validSession()
    const protectedRequest = request('/dashboard', 'session=expired; refresh=original')
    const renewed = await proxy(protectedRequest)
    assert.equal(renewed.headers.get('x-middleware-next'), '1')
    assert.equal(protectedRequest.cookies.get('session').value, 'renewed-jwt')
    assert.match(renewed.headers.get('x-middleware-request-cookie'), /session=renewed-jwt/)
    reset()
    assert.equal((await proxy(request('/dashboard'))).headers.get('location'), 'https://pagora.test/api/auth/login')
    assert.equal((await proxy(request('/api/cards/card/sync'))).status, 401)
    console.log('Auth refresh checks passed: login renewal, invalid sessions, OAuth callbacks, and protected routes.')
} finally {
    await rm(directory, { recursive: true, force: true })
}
