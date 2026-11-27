import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: {
        index: 'src/entries/index.ts',
        bin: 'src/entries/bin.ts',
    },
    dts: true,
    clean: true,
})
