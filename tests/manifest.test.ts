import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composerManifest, npmManifest, resolveManifest } from '../src/manifest'

function project(files: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'versioning-'))

    for (const [name, content] of Object.entries(files)) {
        writeFileSync(path.join(root, name), content)
    }

    return root
}

const read = (root: string, name: string) => readFileSync(path.join(root, name), 'utf-8')

describe('npm manifest', () => {
    it('keeps 2-space indentation and the missing final newline', () => {
        const root = project({ 'package.json': '{\n  "name": "a",\n  "version": "1.0.0"\n}' })

        npmManifest.open(root).write('1.0.1')

        expect(read(root, 'package.json')).toBe('{\n  "name": "a",\n  "version": "1.0.1"\n}')
    })

    it('keeps tabs and CRLF', () => {
        const root = project({ 'package.json': '{\r\n\t"version": "1.0.0"\r\n}\r\n' })

        npmManifest.open(root).write('2.0.0')

        expect(read(root, 'package.json')).toBe('{\r\n\t"version": "2.0.0"\r\n}\r\n')
    })

    it('updates package-lock.json', () => {
        const root = project({
            'package.json': '{\n    "version": "1.0.0"\n}\n',
            'package-lock.json': JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }, null, 2),
        })

        expect(npmManifest.open(root).write('1.1.0')).toEqual(['package.json', 'package-lock.json'])

        const lock = JSON.parse(read(root, 'package-lock.json'))
        expect(lock.version).toBe('1.1.0')
        expect(lock.packages[''].version).toBe('1.1.0')
    })
})

describe('composer manifest', () => {
    it('writes the version when composer.json has one', () => {
        const root = project({ 'composer.json': '{\n    "name": "a/b",\n    "version": "1.0.0"\n}\n' })

        expect(composerManifest.open(root).write('1.0.1')).toEqual(['composer.json'])
        expect(JSON.parse(read(root, 'composer.json')).version).toBe('1.0.1')
    })

    it('leaves composer.json untouched without a version field', () => {
        const content = '{\n    "name": "a/b"\n}\n'
        const root = project({ 'composer.json': content })
        const file = composerManifest.open(root)

        expect(file.version).toBeUndefined()
        expect(file.write('1.0.1')).toEqual([])
        expect(read(root, 'composer.json')).toBe(content)
    })
})

describe('resolveManifest', () => {
    const manifests = [npmManifest, composerManifest]

    it('detects the only manifest present', () => {
        expect(resolveManifest(project({ 'composer.json': '{}' }), manifests).name).toBe('composer')
    })

    it('asks to pick one when several are present', () => {
        const root = project({ 'composer.json': '{}', 'package.json': '{}' })

        expect(() => resolveManifest(root, manifests)).toThrow('--manifest')
        expect(resolveManifest(root, manifests, 'npm').name).toBe('npm')
    })

    it('rejects unknown names', () => {
        expect(() => resolveManifest(project({}), manifests, 'cargo')).toThrow('Unknown manifest')
    })
})
