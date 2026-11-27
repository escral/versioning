import { describe, expect, it } from 'vitest'
import { buildCommitMessage, formatTag, preidFromBranch, resolveRelease } from '../src/release'

describe('resolveRelease', () => {
    it.each([
        ['1.2.3', 'next', undefined, '1.2.4'],
        ['1.2.3', 'minor', undefined, '1.3.0'],
        ['1.2.3', 'major', undefined, '2.0.0'],
        ['1.2.3', 'prepatch', 'feat', '1.2.4-feat.0'],
        ['1.2.3', 'prerelease', 'feat', '1.2.4-feat.0'],
        ['1.2.3', 'prerelease', undefined, '1.2.4-0'],
        ['1.0.0-beta.1', 'next', 'master', '1.0.0-beta.2'],
        ['1.0.0-beta.1', 'prerelease', 'master', '1.0.0-beta.2'],
        ['1.0.0-beta.1', 'patch', 'master', '1.0.0'],
    ])('%s + %s (branch %s) → %s', (current, release, branchPreid, expected) => {
        expect(resolveRelease({ current, release, branchPreid })).toBe(expected)
    })

    it('explicit preid wins over the current prerelease identifier', () => {
        expect(resolveRelease({ current: '1.0.0-beta.1', release: 'prerelease', preid: 'rc' })).toBe('1.0.0-rc.0')
    })

    it('strips the v prefix from custom versions', () => {
        expect(resolveRelease({ current: '1.2.3', release: 'v2.0.0' })).toBe('2.0.0')
    })

    it('rejects invalid and non-increasing versions', () => {
        expect(() => resolveRelease({ current: '1.2.3', release: 'nope' })).toThrow('Invalid version')
        expect(() => resolveRelease({ current: '1.2.3', release: '1.2.3' })).toThrow('must be greater')
    })
})

describe('preidFromBranch', () => {
    it.each([
        ['feature/ABC-123-add-login', 'ABC-123'],
        ['PROJ2-42', 'PROJ2-42'],
        ['feature/add login', 'feature-add-login'],
        ['master', 'master'],
        [undefined, undefined],
        ['///', undefined],
    ])('%s → %s', (branch, expected) => {
        expect(preidFromBranch(branch)).toBe(expected)
    })
})

describe('buildCommitMessage', () => {
    it('replaces every placeholder occurrence', () => {
        const message = buildCommitMessage('release {tag} ({version}, {version})', { version: '1.0.0', tag: 'api-v1.0.0' })

        expect(message).toBe('release api-v1.0.0 (v1.0.0, v1.0.0)')
    })

    it('collapses gaps left by an empty prefix', () => {
        expect(buildCommitMessage('chore: {prefix} {version}', { version: '1.0.0', tag: formatTag('1.0.0') })).toBe('chore: v1.0.0')
    })
})
