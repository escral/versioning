import { runCommand } from 'citty'
import { createConsola } from 'consola'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createVersionCommand } from '../src/command'

const command = createVersionCommand({ logger: createConsola({ level: -999 }) })

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

/** A repository with a bare `origin`, so pushes can be checked too. */
function repo(files: Record<string, string>, packageDir = ''): { root: string, pkg: string, origin: string } {
    const base = mkdtempSync(path.join(tmpdir(), 'versioning-'))
    const origin = path.join(base, 'origin.git')
    const root = path.join(base, 'work')
    const pkg = path.join(root, packageDir)

    git(base, 'init', '--quiet', '--bare', '-b', 'master', origin)
    git(base, 'init', '--quiet', '-b', 'master', root)
    git(root, 'remote', 'add', 'origin', origin)
    git(root, 'config', 'user.name', 'Test')
    git(root, 'config', 'user.email', 'test@example.com')
    git(root, 'config', 'tag.gpgSign', 'false')
    git(root, 'config', 'commit.gpgSign', 'false')
    mkdirSync(pkg, { recursive: true })

    for (const [name, content] of Object.entries(files)) {
        writeFileSync(path.join(pkg, name), content)
    }

    git(root, 'add', '.')
    git(root, 'commit', '--quiet', '-m', 'init')
    git(root, 'push', '--quiet', '-u', 'origin', 'master')

    return { root, pkg, origin }
}

const run = (cwd: string, ...args: string[]) => runCommand(command, { rawArgs: ['--cwd', cwd, '--no-interactive', ...args]})

describe('new-version', () => {
    it('bumps, commits, tags and pushes', async () => {
        const { root, origin } = repo({ 'package.json': '{\n  "version": "1.0.0"\n}\n' })

        await run(root, '-r', 'minor')

        expect(readFileSync(path.join(root, 'package.json'), 'utf-8')).toBe('{\n  "version": "1.1.0"\n}\n')
        expect(git(root, 'log', '-1', '--format=%s')).toBe('chore: release v1.1.0')
        expect(git(root, 'cat-file', '-t', 'v1.1.0')).toBe('tag')
        expect(git(origin, 'tag')).toBe('v1.1.0')
        expect(git(origin, 'log', '-1', '--format=%s', 'master')).toBe('chore: release v1.1.0')
    })

    it('handles --no-prefix, --no-tag and --no-push', async () => {
        const { pkg, origin } = repo({ 'package.json': '{"version":"1.0.0"}' }, 'packages/api')

        await run(pkg, '-r', 'patch', '--no-prefix', '--no-tag', '--no-push')

        expect(git(pkg, 'tag')).toBe('')
        expect(git(origin, 'log', '-1', '--format=%s', 'master')).toBe('init')
    })

    it('prefixes tags of nested packages', async () => {
        const { pkg } = repo({ 'package.json': '{"version":"1.0.0"}' }, 'packages/api')

        await run(pkg, '-r', 'patch', '--no-push')

        expect(git(pkg, 'tag')).toBe('api-v1.0.1')
    })

    it('supports a custom prefix and quotes in the commit message', async () => {
        const { root } = repo({ 'package.json': '{"version":"1.0.0"}' })

        await run(root, '-r', 'v2.0.0', '--prefix', 'web', '--commit-message', 'release "{tag}" $HOME `x`', '--no-push')

        expect(git(root, 'tag')).toBe('web-v2.0.0')
        expect(git(root, 'log', '-1', '--format=%s')).toBe('release "web-v2.0.0" $HOME `x`')
    })

    it('tags composer packages without a version field and does not commit', async () => {
        const { root } = repo({ 'composer.json': '{\n    "name": "a/b"\n}\n' })
        git(root, 'tag', 'v1.4.0')

        await run(root, '-r', 'next', '--no-push')

        expect(git(root, 'log', '-1', '--format=%s')).toBe('init')
        expect(git(root, 'tag', '--list', '--sort=v:refname')).toBe('v1.4.0\nv1.4.1')
    })

    it('commits only the manifest files when other changes are staged', async () => {
        const { root } = repo({ 'package.json': '{"version":"1.0.0"}' })
        writeFileSync(path.join(root, 'other.txt'), 'wip')
        git(root, 'add', 'other.txt')

        await run(root, '-r', 'patch', '--no-git-check', '--no-push')

        expect(git(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('package.json')
        expect(git(root, 'diff', '--cached', '--name-only')).toBe('other.txt')
    })

    it('refuses dirty trees, existing tags and missing --release', async () => {
        const { root } = repo({ 'package.json': '{"version":"1.0.0"}' })
        git(root, 'tag', 'v1.0.1')

        await expect(run(root, '-r', 'patch', '--no-push')).rejects.toThrow('already exists')
        await expect(run(root)).rejects.toThrow('--release is required')

        writeFileSync(path.join(root, 'dirty'), '')
        await expect(run(root, '-r', 'minor')).rejects.toThrow('uncommitted changes')
        expect(readFileSync(path.join(root, 'package.json'), 'utf-8')).toBe('{"version":"1.0.0"}')
    })
})
