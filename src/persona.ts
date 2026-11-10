/**
 * The persona row: a user-editable character card mounted by this bundle's
 * agent presets (persona-custom-1/2/3) in place of @deepseek-ai/dsh-persona.
 *
 * Why REPLACE the official row instead of adding alongside it: a preset's
 * rows instantiate in one generation scope and prompt-section names are
 * unique per scope, so a companion row would need its own section name — and
 * any other section sorts after the persona-prefix slot, putting the editable
 * character card AFTER the content it introduces. Owning
 * `deployment:persona-prefix` keeps the reading order: character card first,
 * everything else after.
 *
 * The card lives in this plugin's settings file (persona-presets/
 * persona-settings.json, `personas.<presetId>`, edited from the settings
 * page's 「角色卡」 section; hand-editing works the same): the section text is a
 * function re-read at every assembly, so a saved edit lands on the next turn
 * with no restart. User free text must never enter strict {{variable}}
 * interpolation — an unknown reference makes the whole assembly throw — so
 * the section is registered with interpolate: false.
 *
 * Unlike the dsh-agentic-pet persona row there is NO static prefix half: for
 * a generic (non-pet) preset the card is the entire persona section. The
 * config keeps an optional `prefix` for symmetry, but no shipped preset sets
 * it. Extracted from dsh-agentic-pet src/persona.ts (pet-only storage paths
 * and the pet body-rules contract dropped).
 * @module dsh-persona-presets/persona
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { dshHome, settingsFilePath } from './paths.ts'

/** Cordis plugin name. Preset ymls mount it as 'dsh-persona-presets/persona'. */
export const name = 'persona'

/** The prompt registry this row contributes to. Without this declaration the
 * traceable proxy rejects `ctx.systemPrompt` ("cannot get property ... without
 * inject") and the whole preset fails to mount — taking every session's
 * resume down with it. */
export const inject = ['systemPrompt']

/**
 * Structural face of the host's prompt registry — only the two members this
 * row needs. The authoritative declarations live in
 * @deepseek-ai/dsh-system-prompt, which is not published to npm; a local
 * `declare module` re-declaration would collide with the real member where it
 * does exist (TS2717). A double cast through `unknown` is honest in both
 * faces: at runtime cordis's traceable proxy serves `ctx.systemPrompt` from
 * the service store regardless of which face compiled.
 */
interface PromptRegistryFace {
  getSectionOrder(name: string): number
  section(section: {
    name: string
    order: number
    text: string | (() => string)
    interpolate?: boolean
  }): () => void
}

function systemPromptOf(ctx: Context): PromptRegistryFace {
  return (ctx as unknown as { systemPrompt: PromptRegistryFace }).systemPrompt
}

/**
 * The default character card, shown until a slot is edited. Generic by
 * design — no pet, no product identity; the user is expected to overwrite it.
 * Clearing a slot in the settings page falls back here, so "cleared" and
 * "reset to default" are the same state.
 */
export const DEFAULT_PERSONA =
  '你是用户的 AI 助手，说话简洁、就事论事。这张卡是你人设的全部来源：用户可以在设置页「角色卡」区块改写它，赋予你新的身份、性格与说话方式。'

/** Upper bound for the user-edited card, enforced by the settings merge. A
 * runaway card would inflate every session prompt; the sync reader applies
 * the same cap so a hand-edited file cannot bypass it. */
export const MAX_PERSONA_CHARS = 8000

/**
 * Read the configured character card for one preset slot: the slot
 * `personas.<key>` → DEFAULT_PERSONA. No global card and no legacy fallback
 * chain — this plugin starts clean, one slot one card. Sync on purpose —
 * PromptSection.text is a synchronous provider called once per assembly, and
 * a ~1KB JSON read per request is noise next to the LLM call it feeds, so
 * there is no cache to invalidate. Trims first, then caps.
 */
export function readPersonaCard(home: string, key?: string): string {
  try {
    const parsed = JSON.parse(readFileSync(settingsFilePath(home), 'utf8')) as { personas?: unknown }
    if (parsed && typeof parsed === 'object' && key !== undefined) {
      const slots = typeof parsed.personas === 'object' && parsed.personas !== null
        ? parsed.personas as Record<string, unknown>
        : {}
      const slot = typeof slots[key] === 'string' ? slots[key].trim() : ''
      if (slot !== '') return slot.length > MAX_PERSONA_CHARS ? slot.slice(0, MAX_PERSONA_CHARS) : slot
    }
  } catch { /* missing or unreadable file answers the default */ }
  return DEFAULT_PERSONA
}

/**
 * Row config, passed by the preset ymls. Deliberately schema-less — the only
 * writer is our own presets, and a schema library dependency just to shape
 * that is not worth it.
 */
export interface PersonaRowConfig {
  /** The persona slot this mount reads: a preset id keying persona-settings.json
   * `personas.<key>`. Absent = the default card for every mount. */
  personaKey?: string
  /** Optional static prose appended after the card. Nothing in this bundle
   * sets it — kept so a derivative preset can pin non-editable framing. */
  prefix?: string
}

/** The prompt-registry section this row owns. Mirrors the unexported string
 * behind @deepseek-ai/dsh-system-prompt's PERSONA_PREFIX_SECTION — scoped
 * registration shadows the deployment persona, exactly how the official
 * persona row takes over a preset's identity. */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** Order slot for the persona prefix; the fallback is the slot's documented
 * value in case the key is ever renamed (a non-finite order must never reach
 * the registry). */
const PERSONA_PREFIX_ORDER_KEY = 'DEPLOYMENT_PERSONA_PREFIX'
const PERSONA_PREFIX_ORDER_FALLBACK = 0

/**
 * Register the persona section in this preset's generation scope: it applies
 * to every session mounted with the preset, shadows the deployment persona,
 * and stays invisible to sessions on other presets.
 */
export function apply(ctx: Context, config: PersonaRowConfig): void {
  const sp = systemPromptOf(ctx)
  const base = sp.getSectionOrder(PERSONA_PREFIX_ORDER_KEY)
  const order = Number.isFinite(base) ? base : PERSONA_PREFIX_ORDER_FALLBACK
  const home = dshHome()
  ctx.effect(() => sp.section({
    name: PERSONA_PREFIX_SECTION,
    order,
    interpolate: false,
    text: () => {
      const card = readPersonaCard(home, config.personaKey)
      return config.prefix ? `${card}\n\n${config.prefix}` : card
    },
  }), 'persona.section()')
}
