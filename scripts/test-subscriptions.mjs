import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = await mkdtemp(join(tmpdir(), 'pagora-subscriptions-'))
try {
    const outfile = join(directory, 'subscriptions.test.cjs')
    await build({
        entryPoints: ['src/lib/subscription-charges.test.ts'],
        bundle: true, platform: 'node', format: 'cjs', outfile,
        plugins: [{
            name: 'isolated-server-tests',
            setup(build) {
                build.onResolve({ filter: /^(server-only|@\/db\/prisma)$/ }, (args) => ({ path: args.path, namespace: 'test-stub' }))
                build.onLoad({ filter: /.*/, namespace: 'test-stub' }, (args) => ({
                    contents: args.path === 'server-only' ? '' : 'export const db = {};', loader: 'js',
                }))
            },
        }],
    })
    const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' })
    process.exitCode = result.status ?? 1
} finally {
    await rm(directory, { recursive: true, force: true })
}
