import { describe, expect, it } from 'vitest'
import { mergePersonas, type PersonaSettings } from '../src/merge.ts'
import { MAX_PERSONA_CHARS } from '../src/persona.ts'
import { PERSONA_PRESET_IDS } from '../src/paths.ts'

function merge(current: PersonaSettings, personas: unknown): PersonaSettings {
  return mergePersonas(current, { personas })
}

describe('mergePersonas', () => {
  it('sets a whitelist slot from a string patch', () => {
    const next = merge({}, { 'persona-598-custom-2': '  二号卡 \n' })
    expect(next.personas).toEqual({ 'persona-598-custom-2': '二号卡' })
  })

  it('trims then caps an oversized card', () => {
    const long = '长'.repeat(MAX_PERSONA_CHARS + 50)
    const next = merge({}, { 'persona-598-custom-1': long })
    expect(next.personas?.['persona-598-custom-1']).toHaveLength(MAX_PERSONA_CHARS)
  })

  it('deletes the slot on an empty string (reset-to-default)', () => {
    const current: PersonaSettings = { personas: { 'persona-598-custom-1': '一号卡', 'persona-598-custom-2': '二号卡' } }
    const next = merge(current, { 'persona-598-custom-1': '   ' })
    expect(next.personas).toEqual({ 'persona-598-custom-2': '二号卡' })
  })

  it('deleting an absent slot is a no-op', () => {
    const next = merge({}, { 'persona-598-custom-1': '' })
    expect(next.personas).toEqual({})
  })

  it('ignores non-string values instead of erroring', () => {
    const next = merge({}, { 'persona-598-custom-1': 42, 'persona-598-custom-2': null, 'persona-598-custom-3': {} })
    expect(next.personas).toEqual({})
  })

  it('drops keys outside the whitelist', () => {
    const next = merge({}, { 'persona-598-custom-1': 'ok', whale598: 'dropped', 'persona-598-custom-9': 'dropped' })
    expect(Object.keys(next.personas ?? {})).toEqual(['persona-598-custom-1'])
  })

  it('preserves unrelated top-level keys and slot keys outside the patch', () => {
    // `future` stands in for any key a later version might add — the merge is
    // a whitelist on WRITE, not a destruction pass over the whole file.
    const current = { personas: { 'persona-598-custom-1': '一号' }, future: { x: 1 } } as unknown as PersonaSettings
    const next = merge(current, { 'persona-598-custom-3': '三号' })
    expect(next).toEqual({
      personas: { 'persona-598-custom-1': '一号', 'persona-598-custom-3': '三号' },
      future: { x: 1 },
    })
  })

  it('returns the current settings unchanged for a non-object patch', () => {
    const current: PersonaSettings = { personas: { 'persona-598-custom-1': '一号' } }
    expect(mergePersonas(current, {})).toEqual(current)
    expect(mergePersonas(current, { personas: null })).toEqual(current)
    expect(mergePersonas(current, { personas: 'nope' })).toEqual(current)
  })

  it('does not mutate either input', () => {
    const current: PersonaSettings = { personas: { 'persona-598-custom-1': '一号' } }
    const snapshot = JSON.stringify(current)
    merge(current, { 'persona-598-custom-1': '改' })
    expect(JSON.stringify(current)).toBe(snapshot)
  })

  it('covers exactly the three shipped preset ids', () => {
    expect([...PERSONA_PRESET_IDS]).toEqual(['persona-598-custom-1', 'persona-598-custom-2', 'persona-598-custom-3'])
  })
})
