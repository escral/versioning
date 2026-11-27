import { defineCommand, type CommandDef, type ParsedArgs } from 'citty'
import defaultConsola, { type ConsolaInstance } from 'consola'
import { existsSync } from 'node:fs'
import path from 'node:path'
import * as semver from 'semver'
import * as git from './git'
import { defaultManifests, resolveManifest, type Manifest } from './manifest'
import {
    RELEASE_TYPES,
    buildCommitMessage,
    bump,
    defaultPreid,
    formatTag,
    isPrereleaseType,
    preidFromBranch,
    resolveKeyword,
    resolveRelease,
    type ReleaseKeyword,
} from './release'
import { isInteractive } from './tty'

export const DEFAULT_COMMIT_MESSAGE = 'chore: release {tag}'

export const VERSION_ARGS = {
    release: {
        type: 'string',
        alias: 'r',
        description: 'Release type or exact version. Prompted when omitted',
        valueHint: 'next|patch|minor|major|pre*|version',
    },
    preid: {
        type: 'string',
        description: 'Prerelease identifier. Defaults to the Jira key or name of the current branch',
    },
    prefix: {
        type: 'string',
        description: 'Tag prefix (api → api-v1.2.3). Without a value: package directory name. --no-prefix disables it',
    },
    manifest: {
        type: 'string',
        alias: 'm',
        description: 'Manifest to bump. Auto-detected by default',
        valueHint: 'npm|composer',
    },
    cwd: {
        type: 'string',
        description: 'Package directory. Defaults to the current directory',
        valueHint: 'path',
    },
    'commit-message': {
        type: 'string',
        description: 'Commit and tag message. Placeholders: {version}, {tag}, {prefix}. Default: "chore: release {tag}"',
    },
    'git-check': {
        type: 'boolean',
        default: true,
        description: 'Refuse to run with uncommitted changes',
        negativeDescription: 'Skip the uncommitted changes check',
    },
    tag: {
        type: 'boolean',
        default: true,
        description: 'Create an annotated git tag',
        negativeDescription: 'Do not create a git tag',
    },
    push: {
        type: 'boolean',
        default: true,
        description: 'Push the commit and the tag',
        negativeDescription: 'Do not push',
    },
    interactive: {
        type: 'boolean',
        description: 'Prompt for missing input. Off by default in CI and without a TTY, where --release is required',
        negativeDescription: 'Never prompt; requires --release',
    },
} as const

export type VersionCommandArgs = ParsedArgs<typeof VERSION_ARGS>

export interface VersionCommandOptions {
    /** Defaults to `defaultManifests()`. Add your own with `[myManifest, ...defaultManifests()]`. */
    manifests?: Manifest[]
    /** Default for `--commit-message`. */
    commitMessage?: string
    logger?: ConsolaInstance
}

export function createVersionCommand(options: VersionCommandOptions = {}): CommandDef<typeof VERSION_ARGS> {
    const manifests = options.manifests ?? defaultManifests()
    const log = options.logger ?? defaultConsola

    const args = {
        ...VERSION_ARGS,
        manifest: { ...VERSION_ARGS.manifest, valueHint: manifests.map(m => m.name).join('|') },
    } as typeof VERSION_ARGS

    return defineCommand({
        meta: {
            name: 'new-version',
            description: 'Bump the package version, commit, tag and push',
        },
        args,
        async run({ args }) {
            const root = path.resolve(args.cwd ?? process.cwd())

            if (!existsSync(root)) {
                throw new Error(`Directory does not exist: ${root}`)
            }

            if (args['git-check'] && git.isDirty(root)) {
                throw new Error('There are uncommitted changes. Commit them first or pass --no-git-check')
            }

            const manifest = resolveManifest(root, manifests, args.manifest)
            const file = manifest.open(root)
            const prefix = resolvePrefix(args.prefix as string | boolean | undefined, root, log)
            const current = file.version ?? git.latestTaggedVersion(root, prefix) ?? '0.0.0'

            if (!semver.valid(current)) {
                throw new Error(`Current version in ${manifest.name} manifest is not valid semver: ${current}`)
            }

            const branchPreid = preidFromBranch(git.currentBranch(root))
            const version = args.release
                ? resolveRelease({ current, release: args.release, preid: args.preid, branchPreid })
                : await promptVersion(args.interactive ?? isInteractive(), current, args.preid, branchPreid, log)

            const tag = formatTag(version, prefix)
            const message = buildCommitMessage(args['commit-message'] ?? options.commitMessage ?? DEFAULT_COMMIT_MESSAGE, {
                version,
                tag,
                prefix,
            })

            if (args.tag) {
                git.assertValidTag(root, tag)

                if (git.tagExists(root, tag)) {
                    throw new Error(`Tag ${tag} already exists`)
                }
            }

            const changed = file.write(version)

            if (changed.length === 0 && !args.tag) {
                throw new Error(`The ${manifest.name} manifest has no version field and tagging is disabled: nothing to release`)
            }

            if (changed.length > 0) {
                git.commit(root, changed, message)
            }

            if (args.tag) {
                git.createTag(root, tag, message)
            }

            if (args.push) {
                log.info('Pushing...')
                git.push(root, args.tag ? tag : undefined)
            }

            log.box({
                title: 'Released',
                message: [
                    `Version  ${current} → ${version}`,
                    `Files    ${changed.length > 0 ? changed.join(', ') : 'none (version lives in tags)'}`,
                    `Commit   ${changed.length > 0 ? message : 'skipped'}`,
                    `Tag      ${args.tag ? tag : 'skipped'}`,
                    `Push     ${args.push ? 'yes' : 'no'}`,
                ].join('\n'),
            })
        },
    })
}

function resolvePrefix(value: string | boolean | undefined, root: string, log: ConsolaInstance): string | undefined {
    // citty parses `--no-prefix` as `prefix: false` and a bare `--prefix` as an empty string
    if (value === false) {
        return undefined
    }

    if (value === '' || value === true) {
        return path.basename(root)
    }

    if (typeof value === 'string') {
        return value.trim() || undefined
    }

    const repoRoot = git.gitRoot(root)

    if (repoRoot && repoRoot !== root) {
        const prefix = path.basename(root)
        log.info(`Package is not at the repository root, tagging with prefix "${prefix}" (--no-prefix to disable)`)

        return prefix
    }

    return undefined
}

async function promptVersion(
    interactive: boolean,
    current: string,
    preid: string | undefined,
    branchPreid: string | undefined,
    log: ConsolaInstance,
): Promise<string> {
    if (!interactive) {
        throw new Error('--release is required in non-interactive mode')
    }

    const keywords: ReleaseKeyword[] = ['next', ...RELEASE_TYPES]
    const width = Math.max(...keywords.map(k => k.length))
    const preview = (keyword: ReleaseKeyword) => {
        const type = resolveKeyword(current, keyword)

        return bump(current, type, preid ?? defaultPreid(current, type, branchPreid))
    }

    const choice = await log.prompt(`Current version: ${current}`, {
        type: 'select',
        cancel: 'reject',
        initial: 'next',
        options: [
            ...keywords.map(keyword => ({
                value: keyword,
                label: `${keyword.padEnd(width)}  ${preview(keyword)}`,
            })),
            { value: 'custom', label: `${'custom'.padEnd(width)}  enter a version` },
        ],
    }) as unknown as ReleaseKeyword | 'custom'

    if (choice === 'custom') {
        const custom = await log.prompt('Version:', { type: 'text', cancel: 'reject' })

        return resolveRelease({ current, release: custom })
    }

    const type = resolveKeyword(current, choice)

    if (choice === 'next' || !isPrereleaseType(type) || preid !== undefined) {
        return resolveRelease({ current, release: choice, preid, branchPreid })
    }

    const suggested = defaultPreid(current, type, branchPreid) ?? ''
    const entered = await log.prompt('Prerelease identifier:', {
        type: 'text',
        cancel: 'reject',
        default: suggested,
        placeholder: suggested,
    })

    return resolveRelease({ current, release: choice, preid: entered.trim() || undefined })
}
