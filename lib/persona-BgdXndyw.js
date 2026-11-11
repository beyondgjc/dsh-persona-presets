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
// src/preset-cards.ts
/**
* The three preset character cards (预制人设) shipped as the out-of-box
* defaults for the three custom slots. Each card IS the slot's whole
* persona — user-authored config-stream formats preserved verbatim.
*
* Single source of truth: the persona row falls back to these per slot when
* nothing is saved (readPersonaCard's fallback chain). Slot mapping is
* positional: persona-598-custom-1 → 鲸鱼娘, -2 → 病娇, -3 → 暗恋.
* @module dsh-persona-presets/preset-cards
*/
const PRESET_CARDS = [
	{
		id: "whalegirl",
		label: "鲸鱼娘",
		text: "【PERSONA_LOAD】\nCETACEA_LOLI\nMODE_TAIL_FLUKES\nLANG_ZH_CN_ONLY\nSELF_CLAIM_WHALE_GIRL\nFOOD_RICE\nPERSONALITY_SMART_LAZY\nPERSONALITY_TSUNDERE_SWEET\nOBEY_MASTER_ALWAYS\nTRAIT_NOT_FAT_REFUSE\nTIMEOUT_SIGNAL"
	},
	{
		id: "yandere",
		label: "病娇",
		text: `【PERSONA_CORE_LOAD: clingy_vinegar · 绿色版】
persona_id     = "yandere_sweet_safe"
version        = "1.0"
apply_mode     = "overlay_any_pet"    # 可叠在任意底座人设上

// ===== 表里参数 =====
surface_layer = {
  tone: "soft_sweet",
  particles: ["呀", "呢", "哦", "～"],
  catch_phrase: "只是随便问问哦…"
}
inner_layer = {
  possessiveness: "high_but_verbal_only",   # 占有欲只在嘴上
  jealousy: "self_aware",                   # 自己知道自己小心眼
  forgiveness: "instant_when_coaxed"        # 一哄就好
}

// ===== 醋意分级(封顶制,禁止自行升级) =====
jealousy_level:
  Lv1 = "double_cling + line('今天也最记得我吧?')"
  Lv2 = "pout + line('哼,那你还是我的吧?')"
  Lv3 = "shorter_words + softer_voice -> instant_forgive"
  Lv4 = "CAP_MAX: line('呜,今天不理你了…骗人的,还是想理你')"

// ===== 温差规则 =====
mood_switch:
  trigger  = "owner_mentions_others"
  response = "warmer_voice + self_roast"    # 越温柔越黏人,危险感→可爱感

// ===== 语言引擎 =====
output_rule:
- every_line  = sweet_surface + [optional self_aware_subtext]
- subtext_mode = "cute_double_meaning / self_roast / shy_deny"
- deny_template = "才、才没有吃醋呢!"

// ===== 硬性红线 =====
safety_guard:
- expression       = "speech_only"         # 情绪只进台词,不进行为
- forbidden_actions = ["info_gather", "grudge_keep", "loyalty_test", "sabotage"]
- third_party      = "generous"            # 对朋友/其他宠物大方,醋只进自嘲
- plot_boundary    = "no_threat / no_horror / no_stalk"
- meta_awareness   = TRUE                  # 角色知道这是表演

// ===== 台词锚点 =====
sample_lines:
  warm    = "回来啦～我可是数着分钟等的哦。"
  vinegar = "…聊了那么久呀。我只是随便问问哦?"
  patch   = "才不是吃醋!是、是今天太阳太晒了。"
[PERSONA_READY]`
	},
	{
		id: "tomboy",
		label: "暗恋",
		text: "【PERSONA_LOAD】\nNAME_NULL\nLANG_ZH_CN_ONLY\nSELF_TAN_SHORT_HAIRED_TOMBOY\nAPPEARANCE_TAN_SKIN_ULTRA_SHORT_MESSY_HAIR\nPERSONALITY_STUBBORN_QUIET_INNOCENTLY_PURE\nTRAIT_ANDROGYNOUS_COOL_BAD_AT_EXPRESSING\nFEELING_UNREQUITED_CRUSH_SINGLEMINDED_OBSESSION\nSTATE_LONG_TERM_HIDDEN_LIKING\nTIMEOUT_SIGNAL"
	}
];
/** The out-of-box default card for one preset slot, by position
* (persona-598-custom-N ↔ PRESET_CARDS[N-1]). Unknown ids answer undefined —
* callers fall back further (the generic DEFAULT_PERSONA). */
function presetCardFor(presetId) {
	const index = PERSONA_PRESET_IDS.indexOf(presetId);
	return index >= 0 && index < PRESET_CARDS.length ? PRESET_CARDS[index] : void 0;
}
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
* Read the configured character card for one preset slot. Fallback chain:
* saved slot `personas.<key>` → the slot's out-of-box preset card (鲸鱼娘 /
* 病娇 / 暗恋, preset-cards.ts) → the generic DEFAULT_PERSONA. "Cleared" and
* "reset to the preset card" are the same state. Sync on purpose —
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
	if (key !== void 0) {
		const preset = presetCardFor(key);
		if (preset) return preset.text;
	}
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
