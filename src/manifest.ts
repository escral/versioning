import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface ManifestFile {
    /** `undefined` when the manifest does not store a version; it is then taken from git tags. */
    readonly version: string | undefined
    /** Writes the new version and returns the touched files, relative to the project root. */
    write(version: string): string[]
}

export interface Manifest {
    name: string
    detect(root: string): boolean
    open(root: string): ManifestFile
}

interface JsonDocument {
    data: Record<string, any>
    save(): void
}

/**
 * Keeps the file's own indentation, line endings and final newline, so a version bump
 * produces a one-line diff instead of reformatting the whole file.
 */
export function openJson(file: string): JsonDocument {
    const text = readFileSync(file, 'utf-8')
    const data = JSON.parse(text)
    const indent = text.match(/^[ \t]+(?=")/m)?.[0] ?? (text.trim().includes('\n') ? 2 : 0)
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const finalNewline = /\r?\n$/.test(text)

    return {
        data,
        save() {
            const json = JSON.stringify(data, null, indent).replace(/\n/g, eol)

            writeFileSync(file, finalNewline ? json + eol : json)
        },
    }
}

const NPM_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json']

export const npmManifest: Manifest = {
    name: 'npm',
    detect: root => existsSync(path.join(root, 'package.json')),
    open(root) {
        const pkg = openJson(path.join(root, 'package.json'))

        return {
            version: pkg.data.version,
            write(version) {
                pkg.data.version = version
                pkg.save()

                const lockfiles = NPM_LOCKFILES.filter(name => updateNpmLockfile(path.join(root, name), version))

                return ['package.json', ...lockfiles]
            },
        }
    },
}

function updateNpmLockfile(file: string, version: string): boolean {
    if (!existsSync(file)) {
        return false
    }

    const lock = openJson(file)
    lock.data.version = version

    if (lock.data.packages?.['']) {
        lock.data.packages[''].version = version
    }

    lock.save()

    return true
}

export const composerManifest: Manifest = {
    name: 'composer',
    detect: root => existsSync(path.join(root, 'composer.json')),
    open(root) {
        const composer = openJson(path.join(root, 'composer.json'))

        return {
            version: composer.data.version,
            write(version) {
                // Composer recommends omitting "version" and deriving it from tags; respect that
                if (composer.data.version === undefined) {
                    return []
                }

                composer.data.version = version
                composer.save()

                return ['composer.json']
            },
        }
    },
}

export function defaultManifests(): Manifest[] {
    return [npmManifest, composerManifest]
}

export function resolveManifest(root: string, manifests: Manifest[], name?: string): Manifest {
    const names = manifests.map(m => m.name).join(', ')

    if (name !== undefined) {
        const manifest = manifests.find(m => m.name === name)

        if (!manifest) {
            throw new Error(`Unknown manifest "${name}". Available: ${names}`)
        }

        return manifest
    }

    const detected = manifests.filter(m => m.detect(root))

    if (detected.length === 0) {
        throw new Error(`No manifest found in ${root} (checked: ${names})`)
    }

    if (detected.length > 1) {
        throw new Error(`Several manifests found in ${root}: ${detected.map(m => m.name).join(', ')}. Pick one with --manifest`)
    }

    return detected[0]!
}
