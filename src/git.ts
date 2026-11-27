import { execFileSync } from 'node:child_process'
import path from 'node:path'
import * as semver from 'semver'

function git(cwd: string, args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
}

function tryGit(cwd: string, args: string[]): string | undefined {
    try {
        return git(cwd, args)
    } catch {
        return undefined
    }
}

export function isDirty(cwd: string): boolean {
    return git(cwd, ['status', '--porcelain']) !== ''
}

export function gitRoot(cwd: string): string | undefined {
    const root = tryGit(cwd, ['rev-parse', '--show-toplevel'])

    return root ? path.resolve(root) : undefined
}

export function currentBranch(cwd: string): string | undefined {
    const branch = tryGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])

    return branch && branch !== 'HEAD' ? branch : undefined
}

export function tagExists(cwd: string, tag: string): boolean {
    return tryGit(cwd, ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`]) !== undefined
}

export function assertValidTag(cwd: string, tag: string): void {
    if (tryGit(cwd, ['check-ref-format', `refs/tags/${tag}`]) === undefined) {
        throw new Error(`Invalid git tag name: ${tag}`)
    }
}

/**
 * Highest semver tag reachable from HEAD. Sorted with semver rather than git's version sort,
 * which places `1.0.0-beta` after `1.0.0` unless `versionsort.suffix` is configured.
 */
export function latestTaggedVersion(cwd: string, prefix?: string): string | undefined {
    const tagPrefix = prefix ? `${prefix}-v` : 'v'
    const tags = tryGit(cwd, ['tag', '--list', `${tagPrefix}*`, '--merged', 'HEAD'])
    const versions = (tags ?? '')
        .split('\n')
        .map(tag => semver.valid(tag.slice(tagPrefix.length)))
        .filter((version): version is string => version !== null)

    return semver.rsort(versions)[0]
}

export function commit(cwd: string, files: string[], message: string): void {
    git(cwd, ['add', '--', ...files])
    git(cwd, ['commit', '-m', message, '--', ...files])
}

export function createTag(cwd: string, tag: string, message: string): void {
    git(cwd, ['tag', '-a', tag, '-m', message])
}

export function push(cwd: string, tag?: string): void {
    execFileSync('git', ['push', '--quiet'], { cwd, stdio: 'inherit' })

    if (tag) {
        execFileSync('git', ['push', '--quiet', 'origin', `refs/tags/${tag}`], { cwd, stdio: 'inherit' })
    }
}
