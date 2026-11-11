import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// src/paths.ts
/**
* Where this plugin keeps its data: one JSON file under the dsh home. The
* platform settings service derives namespaces from profile entry config
* schemas, which this bundle does not declare — a plain file keeps the
* surface honest (the dsh-agentic-pet settings-page precedent).
* @module dsh-persona-presets/paths
*/
/** Directory under the dsh home holding this plugin's settings file. The -598
* suffix is the owner's namespace marker (whale598 precedent): every
* registration surface this bundle claims — cordis plugin name, webserver
* routes, settings-section slot id, storage dir — carries it, so a competing
* persona plugin can never collide with any of them. */
const PLUGIN_DIR = "persona-presets-598";
/** The settings file name. */
const SETTINGS_FILE = "persona-settings.json";
/** The dsh home (DSH_HOME override for tests and portable setups). */
function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
/** Absolute path of the settings file for one home. */
function settingsFilePath(home = dshHome()) {
	return join(home, PLUGIN_DIR, SETTINGS_FILE);
}
/** The persona slots this plugin ships — the preset ids of the three custom
* presets in presets/persona-custom.patch.yml. The settings merge whitelist
* and the read route both enumerate this list; a key outside it is dropped. */
const PERSONA_PRESET_IDS = [
	"persona-598-custom-1",
	"persona-598-custom-2",
	"persona-598-custom-3"
];
// src/persona.ts
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
/** Cordis plugin name. Preset ymls mount it as 'dsh-persona-presets/persona'. */
const name = "persona";
/** The prompt registry this row contributes to. Without this declaration the
* traceable proxy rejects `ctx.systemPrompt` ("cannot get property ... without
* inject") and the whole preset fails to mount — taking every session's
* resume down with it. */
const inject = ["systemPrompt"];
function systemPromptOf(ctx) {
	return ctx.systemPrompt;
}
/**
* The default character card, shown until a slot is edited. Generic by
* design — no pet, no product identity; the user is expected to overwrite it.
* Clearing a slot in the settings page falls back here, so "cleared" and
* "reset to default" are the same state.
*/
const DEFAULT_PERSONA = "你是用户的 AI 助手，说话简洁、就事论事。这张卡是你人设的全部来源：用户可以在设置页「角色卡」区块改写它，赋予你新的身份、性格与说话方式。";
/** Upper bound for the user-edited card, enforced by the settings merge. The
* card is injected into every prompt of every session mounted with the
* preset, so a runaway card would inflate every turn — the cap keeps that
* bounded (the read side applies the same cap so a hand-edited file cannot
* bypass it). 20000 leaves room for imported SillyTavern cards (flattened V2
* cards with dialog examples routinely exceed 8000); the client shows a soft
* token-cost warning past 10000. */
const MAX_PERSONA_CHARS = 2e4;
/**
* Read the configured character card for one preset slot: the slot
* `personas.<key>` → DEFAULT_PERSONA. No global card and no legacy fallback
* chain — this plugin starts clean, one slot one card. Sync on purpose —
* PromptSection.text is a synchronous provider called once per assembly, and
* a ~1KB JSON read per request is noise next to the LLM call it feeds, so
* there is no cache to invalidate. Trims first, then caps.
*/
function readPersonaCard(home, key) {
	try {
		const parsed = JSON.parse(readFileSync(settingsFilePath(home), "utf8"));
		if (parsed && typeof parsed === "object" && key !== void 0) {
			const slots = typeof parsed.personas === "object" && parsed.personas !== null ? parsed.personas : {};
			const slot = typeof slots[key] === "string" ? slots[key].trim() : "";
			if (slot !== "") return slot.length > 2e4 ? slot.slice(0, MAX_PERSONA_CHARS) : slot;
		}
	} catch {}
	return DEFAULT_PERSONA;
}
/** The prompt-registry section this row owns. Mirrors the unexported string
* behind @deepseek-ai/dsh-system-prompt's PERSONA_PREFIX_SECTION — scoped
* registration shadows the deployment persona, exactly how the official
* persona row takes over a preset's identity. */
const PERSONA_PREFIX_SECTION = "deployment:persona-prefix";
/** Order slot for the persona prefix; the fallback is the slot's documented
* value in case the key is ever renamed (a non-finite order must never reach
* the registry). */
const PERSONA_PREFIX_ORDER_KEY = "DEPLOYMENT_PERSONA_PREFIX";
const PERSONA_PREFIX_ORDER_FALLBACK = 0;
/**
* Register the persona section in this preset's generation scope: it applies
* to every session mounted with the preset, shadows the deployment persona,
* and stays invisible to sessions on other presets.
*/
function apply(ctx, config) {
	const sp = systemPromptOf(ctx);
	const base = sp.getSectionOrder(PERSONA_PREFIX_ORDER_KEY);
	const order = Number.isFinite(base) ? base : PERSONA_PREFIX_ORDER_FALLBACK;
	const home = dshHome();
	ctx.effect(() => sp.section({
		name: PERSONA_PREFIX_SECTION,
		order,
		interpolate: false,
		text: () => {
			const card = readPersonaCard(home, config.personaKey);
			return config.prefix ? `${card}\n\n${config.prefix}` : card;
		}
	}), "persona.section()");
}
export { name as a, dshHome as c, inject as i, settingsFilePath as l, MAX_PERSONA_CHARS as n, readPersonaCard as o, apply as r, PERSONA_PRESET_IDS as s, DEFAULT_PERSONA as t };
