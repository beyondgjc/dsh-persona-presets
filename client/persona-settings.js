/* persona-settings — browser half (hand-written __ModuleLoader__ bundle, no
 * build step, dsh-qqbot precedent). Registers a 「人设」 section into the
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

    var READ = '/api/persona-settings/read'
    var UPDATE = '/api/persona-settings/update'

    var SLOT_IDS = ['persona-custom-1', 'persona-custom-2', 'persona-custom-3']
    var SLOT_LABELS = {
      'persona-custom-1': '自定义1',
      'persona-custom-2': '自定义2',
      'persona-custom-3': '自定义3',
    }

    // Theme-neutral: inherit foreground, translucent borders — readable on
    // both the host's dark and light themes without a design system.
    var card = { border: '1px solid rgba(127,127,127,.35)', borderRadius: 10, padding: '10px 14px 12px', margin: '10px 0' }
    var cardTitle = { fontWeight: 700, fontSize: 14, margin: '2px 0 8px' }
    var row = { display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', fontSize: 13, flexWrap: 'wrap' }
    var muted = { color: 'rgba(127,127,127,.9)', fontSize: 12 }
    var textareaStyle = {
      width: '100%', minHeight: 96, resize: 'vertical', lineHeight: 1.5, padding: '6px 8px',
      border: '1px solid rgba(127,127,127,.4)', borderRadius: 6,
      background: 'transparent', color: 'inherit', font: 'inherit',
    }
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

    function PersonaPage() {
      var slotsState = useState(null)
      var slots = slotsState[0]
      var setSlots = slotsState[1]
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
      var setOpen = setOpenState[1]

      var refresh = function () {
        fetch(READ, { credentials: 'same-origin' })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d && d.slots) setSlots(d.slots) })
          .catch(function (e) { setMsg('读取失败: ' + ((e && e.message) || e)) })
      }
      useEffect(refresh, [])

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
      var inheritedOf = function (presetId) {
        var slot = slots ? slots[presetId] : null
        return slot ? slot.inherited !== false : true
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
              setMsg(text.trim() === '' ? '已恢复默认卡（' + SLOT_LABELS[presetId] + '）' : '人设已保存（' + SLOT_LABELS[presetId] + '），下一回合生效')
            } else {
              setMsg('保存失败: ' + ((d && d.error) || '未知错误'))
            }
          })
          .catch(function (e) { setMsg('请求失败: ' + ((e && e.message) || e)) })
          .finally(function () { setBusy(false) })
      }

      return h('div', null,
        h(Section, { title: h('span', null, '人设 ',
          h('span', { style: { fontSize: 11, fontWeight: 400, color: 'rgba(127,127,127,.9)' } }, '每个预设一张卡 · 保存后下一回合生效')) },
          SLOT_IDS.map(function (presetId) {
            var hasSlot = slots !== null && slots[presetId] !== undefined && slots[presetId] !== null
            if (slots !== null && !hasSlot) return null // older host: degrade the whole slot
            var draft = drafts[presetId]
            var isOpen = open[presetId] === true || (draft !== null && draft !== undefined)
            var text = textOf(presetId)
            var count = countOf(presetId)
            var max = maxOf(presetId)
            var label = SLOT_LABELS[presetId] || presetId
            var toggle = function () {
              setOpen(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = !isOpen; return n })()) })
            }
            var header = h('div', {
              style: Object.assign({}, row, { marginBottom: 4, cursor: 'pointer', userSelect: 'none' }),
              onClick: toggle,
              role: 'button',
              'aria-expanded': isOpen,
              title: isOpen ? '收起' : '展开编辑',
            },
              h('span', { style: { fontWeight: 700 } }, (isOpen ? '▾ ' : '▸ ') + '人设 · ' + label),
              hasSlot ? h('span', { style: muted }, inheritedOf(presetId) ? '默认卡' : '独立卡') : null,
              !isOpen ? h('span', { style: muted }, '点开编辑') : null)
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
                'aria-label': '人设文本 · ' + label,
              }),
              h('div', { style: row },
                h('button', {
                  style: btnStyle('primary'), disabled: busy || draft === null || draft === undefined,
                  onClick: function () { save(presetId, text) },
                }, '保存人设'),
                h('button', { style: btnStyle(), disabled: busy, onClick: function () { save(presetId, '') } }, '恢复默认'),
                h('span', { style: count > max ? { color: '#ff7369', fontSize: 12 } : muted }, String(count) + ' / ' + String(max) + ' 字')))
          }),
          msg ? h('div', { style: Object.assign({ margin: '4px 0' }, muted) }, msg) : null,
          h(Hint, null, '每个预设一张角色卡：把会话挂到对应预设（人设-自定义1/2/3），它就带这张卡。'),
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
          return slotsApi.register(
            // id = the bundle row's cordis plugin name (src/index.ts `name`),
            // per the pet-surface precedent in dsh-agentic-pet's client.
            { name: 'settings.section', id: 'persona-presets', order: 41, label: '人设' },
            function (props) { return h(PersonaPage, { close: props && props.close }) })
        })
      })
    }

    var exports = {}
    exports.inject = ['slots']
    exports.apply = apply
    return exports
  },
})
