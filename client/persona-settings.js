/* persona-settings — browser half (hand-written __ModuleLoader__ bundle, no
 * build step, dsh-qqbot precedent). Registers a 「角色卡」 section into the
 * desktop settings sidebar via the slot system; data goes through the host
 * half's same-origin routes (/api/persona-settings/*). The client startup
 * audit is fatal on throw — apply degrades section by section, never failing
 * the page.
 *
 * One editable character card per preset slot (persona-custom-1/2/3); an
 * empty save resets the slot to the default card. Saved edits land on the
 * sessions' next turn — no restart.
 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-presets',
  factory: function (require) {
    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect

    var READ = '/api/persona-settings-598/read'
    var UPDATE = '/api/persona-settings-598/update'

    var SLOT_IDS = ['persona-598-custom-1', 'persona-598-custom-2', 'persona-598-custom-3']
    // 内置预设显示名（对应预设标注 + 取名的缺省值）——与 yml config.name 一致。
    var SLOT_LABELS = {
      'persona-598-custom-1': '人设-自定义1',
      'persona-598-custom-2': '人设-自定义2',
      'persona-598-custom-3': '人设-自定义3',
    }

    // Theme-neutral: inherit foreground, translucent borders — readable on
    // both the host's dark and light themes without a design system.
    var card = { border: '1px solid rgba(127,127,127,.35)', borderRadius: 10, padding: '10px 14px 12px', margin: '10px 0' }
    var cardTitle = { fontWeight: 700, fontSize: 14, margin: '2px 0 8px' }
    var row = { display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', fontSize: 13, flexWrap: 'wrap' }
    var muted = { color: 'rgba(127,127,127,.9)', fontSize: 12 }
    var inputStyle = {
      border: '1px solid rgba(127,127,127,.4)', borderRadius: 6,
      background: 'transparent', color: 'inherit', font: 'inherit',
    }
    var textareaStyle = Object.assign({}, inputStyle, { width: '100%', minHeight: 96, resize: 'vertical', lineHeight: 1.5, padding: '6px 8px' })
    function btnStyle(variant) {
      var base = { border: '1px solid rgba(127,127,127,.4)', borderRadius: 6, cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '3px 12px', background: 'transparent', color: 'inherit' }
      if (variant === 'primary') return Object.assign(base, { fontWeight: 700, borderColor: 'rgba(124,108,240,.6)' })
      return base
    }
    function Section(props) {
      return h('div', { style: card }, h('div', { style: cardTitle }, props.title), props.children)
    }
    function Hint(props) {
      return h('div', { style: Object.assign({ margin: '6px 0 2px' }, muted) }, props.children)
    }
    // Diagnostic boundary: a render crash inside the section displays in the
    // panel itself — the host's slot machinery contains entry crashes and
    // reports them off-console, which reads as an empty pane.
    class SafeZone extends React.Component {
      constructor(props) { super(props); this.state = { err: null } }
      static getDerivedStateFromError(err) { return { err } }
      render() {
        if (this.state.err) {
          return h('pre', { style: { color: '#ff7369', whiteSpace: 'pre-wrap', fontSize: 12, margin: '8px 0' } },
            '[persona-settings] RENDER ERROR: ' + ((this.state.err && this.state.err.stack) || String(this.state.err)))
        }
        return this.props.children
      }
    }

    function PersonaPage() {
      var slotsState = useState(null)
      var slots = slotsState[0]
      var setSlots = slotsState[1]
      // 用户给各槽取的显示名（data.names = presetNames 原始映射，缺席键回落
      // 内置标签）。改名走同一 update 路由（agentic-pet presetNames 语义）。
      var namesState = useState({})
      var names = namesState[0]
      var setNames = namesState[1]
      var msgState = useState('')
      var msg = msgState[0]
      var setMsg = msgState[1]
      var busyState = useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      // Per-slot draft (null = untouched, show the server value) and fold
      // state (default folded; a slot with an unsaved draft stays unfolded).
      var draftsState = useState({})
      var drafts = draftsState[0]
      var setDrafts = draftsState[1]
      var openState = useState({})
      var open = openState[0]
      var setOpen = openState[1]

      var refresh = function () {
        fetch(READ, { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d && d.slots) setSlots(d.slots)
            if (d && d.names) setNames(d.names)
          })
          .catch(function (e) { setMsg('读取失败: ' + ((e && e.message) || e)) })
      }
      useEffect(refresh, [])

      // 人设槽显示名：用户取名优先，缺省回落内置标签——与宠物改名同款。
      var presetNameOf = function (presetId) {
        var custom = names && names[presetId]
        return custom ? String(custom) : (SLOT_LABELS[presetId] || presetId)
      }
      var commitPresetName = function (presetId, value) {
        var current = (names && names[presetId]) || ''
        var v = String(value || '').trim()
        if (v === current) return
        setBusy(true)
        setMsg('')
        var next = Object.assign({}, names || {})
        if (v === '') delete next[presetId]
        else next[presetId] = v
        fetch(UPDATE, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ presetNames: next }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d && d.ok && d.names) {
              setNames(d.names)
              setMsg(v === '' ? '已恢复内置名（' + SLOT_LABELS[presetId] + '）' : '卡名已保存')
            } else {
              setMsg('保存失败: ' + ((d && d.error) || '未知错误'))
            }
          })
          .catch(function (e) { setMsg('请求失败: ' + ((e && e.message) || e)) })
          .finally(function () { setBusy(false) })
      }
      var textOf = function (presetId) {
        if (drafts[presetId] !== null && drafts[presetId] !== undefined) return drafts[presetId]
        var slot = slots ? slots[presetId] : null
        return slot ? String(slot.value || '') : ''
      }
      // Unicode code-point count, same unit as the host's 8000-char cap.
      var countOf = function (presetId) { return Array.from(textOf(presetId)).length }
      var maxOf = function (presetId) {
        var slot = slots ? slots[presetId] : null
        return (slot && Number(slot.maxLength)) || 8000
      }

      var save = function (presetId, text) {
        setBusy(true)
        setMsg('')
        fetch(UPDATE, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personas: (function () { var n = {}; n[presetId] = text; return n })() }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d && d.ok && d.slots) {
              setSlots(d.slots)
              setDrafts(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = null; return n })()) })
              setMsg(text.trim() === '' ? '已恢复默认卡（' + presetNameOf(presetId) + '）' : '角色卡已保存（' + presetNameOf(presetId) + '），下一回合生效')
            } else {
              setMsg('保存失败: ' + ((d && d.error) || '未知错误'))
            }
          })
          .catch(function (e) { setMsg('请求失败: ' + ((e && e.message) || e)) })
          .finally(function () { setBusy(false) })
      }

      return h('div', null,
        h(Section, { title: h('span', null, '角色卡 ',
          h('span', { style: { fontSize: 11, fontWeight: 400, color: 'rgba(127,127,127,.9)' } }, '每个预设一张卡 · 点 ▾ 展开编辑 · 保存后下一回合生效')) },
          SLOT_IDS.map(function (presetId) {
            var hasSlot = slots !== null && slots[presetId] !== undefined && slots[presetId] !== null
            if (slots !== null && !hasSlot) return null // older host: degrade the whole slot
            var draft = drafts[presetId]
            var isOpen = open[presetId] === true || (draft !== null && draft !== undefined)
            var text = textOf(presetId)
            var count = countOf(presetId)
            var max = maxOf(presetId)
            var displayName = presetNameOf(presetId)
            var toggle = function () {
              setOpen(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = !isOpen; return n })()) })
            }
            // 折叠头照 agentic-pet 人设区最新形态：[▾/▸] + 取名框（uncontrolled
            // + key 钉生效名，改名后重挂回填）+ 对应预设内置名。清空名字恢复
            // 内置名；徽记（默认卡/独立卡）已判无用删除。
            var header = h('div', { style: Object.assign({}, row, { marginBottom: 4 }) },
              h('button', { type: 'button', onClick: toggle, 'aria-expanded': isOpen, title: isOpen ? '收起' : '展开编辑',
                style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '2px 4px', fontWeight: 700, font: 'inherit' } },
                isOpen ? '▾' : '▸'),
              h('input', { key: 'pname-' + displayName, style: Object.assign({}, inputStyle, { width: 170, fontWeight: 700 }), defaultValue: displayName, title: '给这张卡取名；点击空白处或回车生效；清空恢复内置名',
                onBlur: function (e) { commitPresetName(presetId, e.target.value) },
                onKeyDown: function (e) { if (e.key === 'Enter') { commitPresetName(presetId, e.target.value); e.target.blur() } },
                'aria-label': '卡名 · ' + presetId }),
              h('span', { style: muted }, '对应预设：' + (SLOT_LABELS[presetId] || presetId)))
            if (!isOpen) return h('div', { key: presetId, style: { marginBottom: 10 } }, header)
            return h('div', { key: presetId, style: { marginBottom: 14 } },
              header,
              h('textarea', {
                style: textareaStyle,
                value: text,
                placeholder: slots && slots[presetId] ? slots[presetId].default : '',
                onChange: function (e) {
                  setDrafts(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = e.target.value; return n })()) })
                },
                'aria-label': '角色卡文本 · ' + displayName,
              }),
              h('div', { style: row },
                h('button', {
                  style: btnStyle('primary'), disabled: busy || draft === null || draft === undefined,
                  onClick: function () { save(presetId, text) },
                }, '保存角色卡'),
                h('button', { style: btnStyle(), disabled: busy, onClick: function () { save(presetId, '') } }, '恢复默认'),
                h('span', { style: count > max ? { color: '#ff7369', fontSize: 12 } : muted }, String(count) + ' / ' + String(max) + ' 字')))
          }),
          msg ? h('div', { style: Object.assign({ margin: '4px 0' }, muted) }, msg) : null,
          h(Hint, null, '每个预设一张角色卡：把会话挂到对应预设（人设-自定义1/2/3），它就带这张卡。卡片就是你给它设定的人设。'),
          h(Hint, null, '清空并保存即回到默认卡；改动下一次对话就生效，无需重启。这些是通用 agent 预设——桌宠挂上去会失去宠物工具（气泡/动作），宠物预设请用 dsh-agentic-pet 自带的。')))
    }

    function apply(ctx) {
      // Client-side startup audit is fatal on throw: degrade per section.
      var safe = function (label, fn) {
        try { return fn() } catch (e) {
          try { console.warn('[persona-settings] ' + label + ' degraded: ' + String((e && e.message) || e)) } catch (x) { /* ignore */ }
        }
      }
      safe('settings section', function () {
        var slotsApi = ctx.slots
        if (!slotsApi) { console.warn('[persona-settings] slots unavailable'); return }
        slotsApi.inject('settings.section', function () {
          // Duplicate-id collision (another bundle claiming 'persona-presets')
          // must degrade OUR section only: a throw inside this callback runs
          // in the slot machinery's notification pass, which is shared with
          // every other plugin's registration — it must never bubble.
          try {
            return slotsApi.register(
              // id = the bundle row's cordis plugin name (src/index.ts `name`),
              // per the pet-surface precedent in dsh-agentic-pet's client.
              { name: 'settings.section', id: 'persona-presets-598', order: 41, label: '角色卡' },
              function (props) {
                try { console.log('[persona-settings] section render fn invoked') } catch (x) { /* ignore */ }
                return h(SafeZone, null, h(PersonaPage, { close: props && props.close }))
              })
          } catch (e) {
            try { console.warn('[persona-settings] settings.section register failed (id clash?): ' + String((e && e.message) || e)) } catch (x) { /* ignore */ }
            return function () { /* no-op disposer keeps the inject contract */ }
          }
        })
      })
    }

    var exports = {}
    exports.inject = ['slots']
    exports.apply = apply
    return exports
  },
})
