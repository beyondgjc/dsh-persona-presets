/**
 * Layout guard for the bundle: the patch list parses with the Loader's own
 * schema (entryListSchema — `!!js` expressions parse exactly the way the host
 * parses them), the three presets mount OUR persona row with the right slot
 * keys, and the tool rows stay a verbatim clone of dsh's standard preset
 * (deep-equal against the sibling dsh checkout; skipped when the repo is
 * checked out without the workspace sibling).
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

interface PatchFile {
  insert?: Array<{
    id?: string
    name?: string
    config?: {
      id?: string
      name?: string
      order?: number
      plugins?: Array<{ id?: string; name?: string; config?: unknown }>
    }
  }>
}

const root = fileURLToPath(new URL('..', import.meta.url))

const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dsh?: { bundle?: { patch?: string | string[] } }
}

const patchList = manifest.dsh?.bundle?.patch
const patches = typeof patchList === 'string' ? [patchList] : patchList

const rows = (patches ?? []).flatMap(file => loadRows(file))

/** One patch file = an array of patch objects (even a single-root
 * `- insert:` loads as a length-1 array — the flatMap is load-bearing). */
function loadRows(relPath: string): NonNullable<PatchFile['insert']> {
  const doc = yaml.load(readFileSync(resolve(root, relPath), 'utf8'), { schema: entryListSchema }) as unknown as PatchFile[]
  return (Array.isArray(doc) ? doc : [doc]).flatMap(patch => patch.insert ?? [])
}

const presets = rows.filter(row => row.name === '@deepseek-ai/dsh-agent-preset')

/** The sibling dsh checkout — the clone source. Absent in standalone clones. */
const STANDARD = resolve(root, '..', 'dsh', 'deepseek-harness', 'packages', 'bundle', 'web-app', 'presets', 'standard.patch.yml')
const hasStandard = existsSync(STANDARD)
const standardPlugins = hasStandard
  ? loadRows(resolve(root, '..', 'dsh', 'deepseek-harness', 'packages', 'bundle', 'web-app', 'presets', 'standard.patch.yml'))[0]?.config?.plugins ?? []
  : []

describe('dsh-persona-presets bundle', () => {
  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    expect(patches).toEqual(['./cordis.patch.yml', './presets/persona-custom.patch.yml'])
  })

  it('registers the bundle row and exactly three presets (YAML single root)', () => {
    expect(rows.map(row => row.id)).toEqual([
      'persona-presets',
      'preset-persona-custom-1',
      'preset-persona-custom-2',
      'preset-persona-custom-3',
    ])
    expect(rows[0]).toMatchObject({ name: 'dsh-persona-presets' })
  })

  it('orders the presets at 21/22/23 with distinct ids and names', () => {
    expect(presets.map(preset => preset.config?.id)).toEqual(['persona-custom-1', 'persona-custom-2', 'persona-custom-3'])
    expect(presets.map(preset => preset.config?.order)).toEqual([21, 22, 23])
    expect(new Set(presets.map(preset => preset.config?.name)).size).toBe(3)
  })

  it('mounts OUR persona row with the matching slot key — never the stock persona', () => {
    for (const preset of presets) {
      const plugins = preset.config?.plugins ?? []
      expect(plugins[0]).toMatchObject({ id: 'persona', name: 'dsh-persona-presets/persona', config: { personaKey: preset.config?.id } })
      expect(plugins.some(plugin => plugin.name === '@deepseek-ai/dsh-persona')).toBe(false)
    }
  })

  it('never references the pet bundle: these presets stay generic', () => {
    for (const preset of presets) {
      for (const plugin of preset.config?.plugins ?? []) {
        expect(plugin.name).not.toContain('pet')
        expect(plugin.name).not.toContain('dsh-agentic-pet')
      }
    }
  })

  it.skipIf(!hasStandard)('clones the standard tool rows verbatim (re-diff when standard evolves)', () => {
    const expected = standardPlugins.filter(plugin => plugin.name !== '@deepseek-ai/dsh-persona')
    for (const preset of presets) {
      const plugins = preset.config?.plugins ?? []
      expect(plugins.slice(1)).toEqual(expected)
    }
  })
})
