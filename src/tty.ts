const CI_VARIABLES = ['CI', 'CONTINUOUS_INTEGRATION', 'BUILD_ID', 'JENKINS_URL', 'TEAMCITY_VERSION', 'BITBUCKET_BUILD_NUMBER']

export function isCI(env: NodeJS.ProcessEnv = process.env): boolean {
    return CI_VARIABLES.some((name) => {
        const value = env[name]

        return value !== undefined && value !== '' && value !== 'false' && value !== '0'
    })
}

export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !isCI()
}
