import * as semver from 'semver'

export const RELEASE_TYPES = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease'] as const

export type ReleaseType = typeof RELEASE_TYPES[number]
export type ReleaseKeyword = ReleaseType | 'next'

export function isReleaseKeyword(value: string): value is ReleaseKeyword {
    return value === 'next' || (RELEASE_TYPES as readonly string[]).includes(value)
}

export function isPrereleaseType(type: ReleaseType): boolean {
    return type.startsWith('pre')
}

export function resolveKeyword(current: string, keyword: ReleaseKeyword): ReleaseType {
    if (keyword !== 'next') {
        return keyword
    }

    return semver.prerelease(current) ? 'prerelease' : 'patch'
}

/**
 * Continuing a prerelease keeps its own identifier, so `1.0.0-beta.1` becomes `1.0.0-beta.2`
 * even when the current branch would suggest another one.
 */
export function defaultPreid(current: string, type: ReleaseType, branchPreid?: string): string | undefined {
    if (type === 'prerelease') {
        const [identifier] = semver.prerelease(current) ?? []

        if (typeof identifier === 'string') {
            return identifier
        }
    }

    return branchPreid
}

export function bump(current: string, type: ReleaseType, preid?: string): string {
    const next = isPrereleaseType(type) && preid
        ? semver.inc(current, type, preid)
        : semver.inc(current, type)

    if (!next) {
        throw new Error(`Cannot apply "${type}" to ${current}${preid ? ` with preid "${preid}"` : ''}`)
    }

    return next
}

export function parseVersion(input: string): string {
    const version = semver.clean(input)

    if (!version) {
        throw new Error(`Invalid version: ${input}`)
    }

    return version
}

export interface ReleaseInput {
    current: string
    release: string
    preid?: string
    branchPreid?: string
}

export function resolveRelease({ current, release, preid, branchPreid }: ReleaseInput): string {
    const next = isReleaseKeyword(release)
        ? bumpKeyword(current, release, preid, branchPreid)
        : parseVersion(release)

    if (!semver.gt(next, current)) {
        throw new Error(`New version ${next} must be greater than current ${current}`)
    }

    return next
}

function bumpKeyword(current: string, keyword: ReleaseKeyword, preid?: string, branchPreid?: string): string {
    const type = resolveKeyword(current, keyword)

    return bump(current, type, preid ?? defaultPreid(current, type, branchPreid))
}

export function preidFromBranch(branch: string | undefined): string | undefined {
    if (!branch) {
        return undefined
    }

    const ticket = branch.match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/)?.[0]
    const preid = (ticket ?? branch).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    return preid || undefined
}

export function formatTag(version: string, prefix?: string): string {
    return prefix ? `${prefix}-v${version}` : `v${version}`
}

export interface CommitMessageContext {
    version: string
    tag: string
    prefix?: string
}

export function buildCommitMessage(template: string, { version, tag, prefix }: CommitMessageContext): string {
    return template
        .replaceAll('{version}', `v${version}`)
        .replaceAll('{tag}', tag)
        .replaceAll('{prefix}', prefix ?? '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}
