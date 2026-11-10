import { defineConfig } from 'tsdown'

/**
 * The new plugin is self-contained by design: it depends on nothing but node
 * builtins and @deepseek-ai/cordis (a peerDependency served by the host
 * runtime — bundling it would create a second cordis instance and split
 * identity-based hooks). Unlike dsh-agentic-pet, no private @deepseek-ai
 * packages are pulled in, so the build runs right here — no monorepo round
 * trip, no vendored toolchain.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/persona.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  external: [/@deepseek-ai\/cordis/],
})
