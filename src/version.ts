#!/usr/bin/env node

import { defineCommand, runMain } from 'citty'
import { execSync } from 'child_process'
import consola from 'consola'

const main = defineCommand({
    meta: {
        name: 'publish',
        description: `Publish a new version of the package`,
    },
    args: {
        prefix: {
            type: 'positional',
            description: 'Prefix for the git tag',
            required: false,
        },
        type: {
            type: 'string',
            alias: 't',
            description: 'Type of version to publish',
            valueHint: 'patch|minor|major',
            required: false,
        },
        stable: {
            type: 'boolean',
            alias: 's',
            description: 'Force a stable version, instead of using one from prerelease',
        },
    },
    async run({ args }: { args: { prefix?: string, type?: string, stable?: boolean, publish?: boolean } }) {
        // Define strategy
        // If there is no "stable" flag, and current version is not a prerelease, ask for strategy:
        // - create a stable prerelease version
        // - create a stable version
        // If there is no "stable" flag, and current version is a prerelease, then increment the prerelease version
        // If there is a "stable" flag, then create a new version of the specified type

        const isStable = args.stable

        if (hasUncommittedChanges()) {
            consola.error('There are uncommitted changes in the repository. Please commit them before publishing a new version')
            process.exit(1)
        }

        if (!isStable) {
            if (!isPrerelease()) {
                consola.info('Current version is a stable version')

                const preidFromBranch = tryGetPreidFromBranch()

                const strategies = {
                    newStable: 'Create a new stable version',
                    newPrerelease: `Create a new prerelease for the current branch ${preidFromBranch ? `(${preidFromBranch})` : ''}`,
                }

                const strategy = await consola.prompt('Choose the strategy:', {
                    type: 'select',
                    options: Object.values(strategies),
                })

                if (strategy === strategies.newPrerelease) {
                    const preid = await getPreid()
                    const type = await getType(args.type)
                    const version = execSync(`npm version pre${type} --no-git-tag-version --preid ${preid}`).toString().trim()
                    consola.info(`Version: ${version}\n`)
                    commit(version)
                }

                if (strategy === strategies.newStable) {
                    const type = await getType(args.type)
                    const version = execSync(`npm version ${type} --no-git-tag-version`).toString().trim()
                    consola.info(`Version: ${version}\n`)
                    commit(version)
                }
            } else {
                consola.info('Current version is a prerelease version')
                consola.info('Incrementing the prerelease version...')
                const version = execSync('npm version prerelease --no-git-tag-version').toString().trim()
                consola.info(`Version: ${version}\n`)
                commit(version)
            }
        } else {
            const type = await getType(args.type)
            const version = execSync(`npm version ${type} --no-git-tag-version`).toString().trim()
            consola.info(`Version: ${version}\n`)
            commit(version)
        }

        consola.box('Remember to push the changes and the tag')

        //

        function commit(version: string) {
            consola.log('Committing changes...')
            execSync('git add package.json')
            execSync(`git commit -m "new version: ${version}"`)

            const tag = args.prefix !== undefined ? `${args.prefix}-${version}` : version

            execSync(`git tag "${tag}"`)

            consola.log('\n')

            consola.success(`Tag: "${tag}" created`)
        }
    },
})

// noinspection JSIgnoredPromiseFromCall
runMain(main)

async function getType(argsType: string | undefined): Promise<'patch' | 'minor' | 'major'> {
    let type: 'patch' | 'minor' | 'major' | undefined = (() => {
        if (argsType === 'patch' || argsType === 'minor' || argsType === 'major') {
            return argsType as 'patch' | 'minor' | 'major'
        }
    })()

    if (!type) {
        type = await consola.prompt('Choose the type of version to publish:', {
            type: 'select',
            options: ['patch', 'minor', 'major'],
        }) as 'patch' | 'minor' | 'major'
    }

    return type
}

function hasUncommittedChanges() {
    const result = execSync('git status --porcelain')

    return result.toString().trim() !== ''
}

function tryGetPreidFromBranch(): string | undefined {
    const preid = execSync('git rev-parse --abbrev-ref HEAD | sed -n' +
        ' \'s/.*\\(\\b[A-Z]\\{2,3\\}-[0-9]\\{1,5\\}\\)\\b.*/\\1/p\'').toString().trim()

    // If the branch name does not match the pattern, return branch name
    if (preid === '') {
        return normalizePreid(execSync('git rev-parse --abbrev-ref HEAD').toString().trim())
    }

    return normalizePreid(preid)
}

function normalizePreid(preid: string): string {
    return preid.replace(/[^a-zA-Z0-9]/g, '-')
}

async function getPreid(): Promise<string> {
    let preid = tryGetPreidFromBranch()

    preid = await consola.prompt(`Enter the prerelease name:`, {
        type: 'text',
        default: preid,
        placeholder: preid,
    })

    if (preid === undefined) {
        consola.info('Using unnamed prerelease')
        preid = ''
    } else {
        consola.info(`Prerelease name: ${preid}`)
    }

    return preid
}

function isPrerelease() {
    const version = JSON.parse(execSync('npm version --json').toString().trim()) as Record<string, string>

    const firstVersion = Object.values(version)[0]

    return firstVersion.includes('-')
}
