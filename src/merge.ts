/**
 * The settings merge for persona-settings.json — the write half of the
 * persona surface. Pure and synchronous so it is unit-testable without a
 * server: the route handler reads the file, calls this, writes the result.
 *
 * Semantics (mirroring dsh-agentic-pet's mergeSettings persona blocks):
 * - Whitelist: only this bundle's preset ids are writable; unknown keys in
 *   the patch are dropped, unknown top-level keys in the file are preserved.
 * - A trimmed empty string DELETES the slot key, which makes the persona row
 *   fall back to the default card — "cleared" and "reset" are one state.
 * - Non-string values are ignored (the row reader would reject them anyway).
 * - Every accepted card is trimmed then capped at MAX_PERSONA_CHARS, so a
 *   huge paste cannot bypass the cap the reader enforces.
 * @module dsh-persona-presets/merge
 */

import { readFileSync } from 'node:fs'
import { MAX_PERSONA_CHARS } from './persona.ts'
import { PERSONA_PRESET_IDS, settingsFilePath } from './paths.ts'

/** File shape. Only `personas` is meaningful today; the merge preserves any
 * other top-level keys for forward compatibility. */
export interface PersonaSettings {
  /** preset id → character card. Absent/empty slot = the default card. */
  personas?: Record<string, string>
}

/** The patch body the update route accepts (unknown fields ignored). */
export interface PersonaPatch {
  personas?: unknown
}

function cap(raw: string): string {
  return raw.length > MAX_PERSONA_CHARS ? raw.slice(0, MAX_PERSONA_CHARS) : raw
}

/** Read the settings file, answering an empty object when it is missing or
 * unreadable — the file is the only source of truth and a broken one must
 * never take the route down. */
export function readPersonaSettings(home: string): PersonaSettings {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFilePath(home), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed as PersonaSettings : {}
  } catch {
    return {}
  }
}

/**
 * Merge one update patch into the current settings. Returns a new object;
 * neither input is mutated. When the patch touches no whitelist key the
 * current settings come back unchanged (as a fresh copy).
 */
export function mergePersonas(current: PersonaSettings, patch: PersonaPatch): PersonaSettings {
  const next: PersonaSettings = { ...current }
  if (!patch || typeof patch.personas !== 'object' || patch.personas === null) return next
  const slots: Record<string, string> = { ...(current.personas ?? {}) }
  const patchSlots = patch.personas as Record<string, unknown>
  for (const key of PERSONA_PRESET_IDS) {
    const value = patchSlots[key]
    if (typeof value !== 'string') continue // non-string: ignored, not an error
    const trimmed = value.trim()
    if (trimmed === '') Reflect.deleteProperty(slots, key) // no-op when already absent
    else slots[key] = cap(trimmed)
  }
  next.personas = slots
  return next
}
