# @escral/versioning

Bumps the version in your manifest, commits it, creates an annotated git tag and pushes both.
Works with `package.json` (npm, pnpm, yarn), `composer.json` and any manifest you plug in.

```bash
pnpm add -D @escral/versioning
```

```json
{
    "scripts": {
        "release": "pnpm build && new-version && pnpm publish"
    }
}
```

## CLI

```bash
new-version                      # interactive: pick next / patch / minor / ... / custom
new-version -r next              # prerelease → next prerelease, stable → patch
new-version -r minor
new-version -r prerelease        # 1.2.3 → 1.2.4-ABC-123.0 on branch feature/ABC-123-login
new-version -r 2.0.0             # exact version, a leading "v" is fine
new-version --cwd packages/api   # tag: api-v1.2.4
```

| Flag                       | Description                                                                                          |
|----------------------------|------------------------------------------------------------------------------------------------------|
| `-r`, `--release`          | `next`, `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, `prerelease` or a version.    |
| `--preid`                  | Prerelease identifier. Defaults to the Jira key in the branch name, or the branch name itself.       |
| `--prefix [name]`          | Tag prefix: `--prefix api` → `api-v1.2.3`. Bare `--prefix` uses the package directory name.          |
| `--no-prefix`              | Disable the automatic prefix for packages that are not at the repository root.                       |
| `-m`, `--manifest`         | Pick the manifest (`npm`, `composer`, or a custom one) instead of auto-detecting it.                 |
| `--cwd`                    | Package directory. Defaults to the current directory.                                                |
| `--commit-message`         | Commit and tag message. Placeholders: `{version}`, `{tag}`, `{prefix}`. Default `chore: release {tag}`. |
| `--no-git-check`           | Allow running with uncommitted changes.                                                              |
| `--no-tag`                 | Do not create a tag.                                                                                 |
| `--no-push`                | Do not push the commit and the tag.                                                                  |
| `--[no-]interactive`       | Prompts are off in CI and without a TTY; `--release` is then required.                              |

Details worth knowing:

- Continuing a prerelease keeps its identifier: `1.0.0-beta.1` → `1.0.0-beta.2`, whatever branch you are on.
  Pass `--preid` to switch it.
- Formatting of the manifest (indentation, line endings, final newline) is preserved. `package-lock.json` and
  `npm-shrinkwrap.json` are updated along with `package.json`.
- Composer recommends leaving `version` out of `composer.json`. In that case the current version is read from the
  latest matching tag, nothing is committed, and only the new tag is created and pushed.
- A package in a subdirectory of its repository is treated as part of a monorepo and its tags get the directory
  name as a prefix.

## As a library

`createVersionCommand` returns a [citty](https://github.com/unjs/citty) command, so it can be mounted in your own
CLI:

```ts
import { createVersionCommand } from '@escral/versioning'
import { defineCommand, runMain } from 'citty'

runMain(defineCommand({
    meta: { name: 'mycli' },
    subCommands: {
        release: createVersionCommand({ commitMessage: 'release: {tag}' }),
    },
}))
```

### Custom manifests

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createVersionCommand, defaultManifests, type Manifest } from '@escral/versioning'

const cargo: Manifest = {
    name: 'cargo',
    detect: root => existsSync(path.join(root, 'Cargo.toml')),
    open(root) {
        const file = path.join(root, 'Cargo.toml')
        const text = readFileSync(file, 'utf-8')

        return {
            version: text.match(/^version\s*=\s*"(.+)"/m)?.[1],
            write(version) {
                writeFileSync(file, text.replace(/^version\s*=\s*".+"/m, `version = "${version}"`))

                return ['Cargo.toml']
            },
        }
    },
}

createVersionCommand({ manifests: [cargo, ...defaultManifests()] })
```

`write` returns the files it touched; they are the ones committed. Return `version: undefined` and an empty list
when the version lives only in git tags.

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm release
```

## License

MIT
