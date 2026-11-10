/**
 * Where this plugin keeps its data: one JSON file under the dsh home. The
 * platform settings service derives namespaces from profile entry config
 * schemas, which this bundle does not declare — a plain file keeps the
 * surface honest (the dsh-agentic-pet settings-page precedent).
 * @module dsh-persona-presets/paths
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Directory under the dsh home holding this plugin's settings file. */
export const PLUGIN_DIR = 'persona-presets'

/** The settings file name. */
export const SETTINGS_FILE = 'persona-settings.json'

/** The dsh home (DSH_HOME override for tests and portable setups). */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Absolute path of the settings file for one home. */
export function settingsFilePath(home: string = dshHome()): string {
  return join(home, PLUGIN_DIR, SETTINGS_FILE)
}

/** The persona slots this plugin ships — the preset ids of the three custom
 * presets in presets/persona-custom.patch.yml. The settings merge whitelist
 * and the read route both enumerate this list; a key outside it is dropped. */
export const PERSONA_PRESET_IDS = ['persona-custom-1', 'persona-custom-2', 'persona-custom-3'] as const
