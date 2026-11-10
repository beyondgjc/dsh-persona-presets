import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PERSONA, MAX_PERSONA_CHARS, readPersonaCard } from '../src/persona.ts'
import { settingsFilePath } from '../src/paths.ts'

const homes: string[] = []

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'persona-presets-'))
  homes.push(home)
  return home
}

afterAll(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

let home: string
beforeEach(() => {
  home = makeHome()
})

function writeSettings(personas: unknown): void {
  mkdirSync(join(home, 'persona-presets-598'), { recursive: true })
  writeFileSync(settingsFilePath(home), JSON.stringify({ personas }), 'utf8')
}

describe('readPersonaCard', () => {
  it('answers the default card when the settings file is missing', () => {
    expect(readPersonaCard(home, 'persona-598-custom-1')).toBe(DEFAULT_PERSONA)
  })

  it('answers the default card when no slot key is requested', () => {
    writeSettings({ 'persona-598-custom-1': '卡' })
    expect(readPersonaCard(home)).toBe(DEFAULT_PERSONA)
  })

  it('answers the slot card when configured', () => {
    writeSettings({ 'persona-598-custom-1': '  你是猫娘。\n' })
    expect(readPersonaCard(home, 'persona-598-custom-1')).toBe('你是猫娘。')
  })

  it('answers the default card when the slot is empty or whitespace', () => {
    writeSettings({ 'persona-598-custom-1': '   ', 'persona-598-custom-2': '' })
    expect(readPersonaCard(home, 'persona-598-custom-1')).toBe(DEFAULT_PERSONA)
    expect(readPersonaCard(home, 'persona-598-custom-2')).toBe(DEFAULT_PERSONA)
  })

  it('caps a hand-edited oversized card at MAX_PERSONA_CHARS', () => {
    writeSettings({ 'persona-598-custom-1': '长'.repeat(MAX_PERSONA_CHARS + 100) })
    const card = readPersonaCard(home, 'persona-598-custom-1')
    expect(card.length).toBe(MAX_PERSONA_CHARS)
  })

  it('answers the default card for a malformed settings file', () => {
    mkdirSync(join(home, 'persona-presets-598'), { recursive: true })
    writeFileSync(settingsFilePath(home), '{ not json', 'utf8')
    expect(readPersonaCard(home, 'persona-598-custom-1')).toBe(DEFAULT_PERSONA)
  })

  it('ignores non-string slot values', () => {
    writeSettings({ 'persona-598-custom-1': 42 })
    expect(readPersonaCard(home, 'persona-598-custom-1')).toBe(DEFAULT_PERSONA)
  })

  it('reads each slot independently', () => {
    writeSettings({ 'persona-598-custom-1': '一号卡', 'persona-598-custom-3': '三号卡' })
    expect(readPersonaCard(home, 'persona-598-custom-1')).toBe('一号卡')
    expect(readPersonaCard(home, 'persona-598-custom-2')).toBe(DEFAULT_PERSONA)
    expect(readPersonaCard(home, 'persona-598-custom-3')).toBe('三号卡')
  })
})
