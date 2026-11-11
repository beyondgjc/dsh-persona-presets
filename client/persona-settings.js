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
    var AVATAR_POST = '/api/persona-settings-598/avatar'
    var AVATAR_GET = '/api/persona-settings-598/avatar/'

    var SLOT_IDS = ['persona-598-custom-1', 'persona-598-custom-2', 'persona-598-custom-3']
    // 软警告阈值：卡的每一个字每回合都会注入 prompt，超过这个长度提示用户
    // 注意 token 消耗（硬上限以服务端 maxLength 为准，超限保存会被截断）。
    var SOFT_WARN_CHARS = 10000
    // 内置预设显示名（对应预设标注 + 取名的缺省值）——与 yml config.name 一致。
    var SLOT_LABELS = {
      'persona-598-custom-1': '人设-自定义1',
      'persona-598-custom-2': '人设-自定义2',
      'persona-598-custom-3': '人设-自定义3',
    }

    // 三槽开箱各带一张预制人设（槽1=猫娘/2=黑客/3=侠客，文案真源在宿主
    // src/preset-cards.ts，经 readPersonaCard 回落链生效）；未取名时槽名
    // 默认显示对应人设名——与 preset-cards.ts 的 label 手工对齐。
    var SLOT_PERSONA_NAMES = {
      'persona-598-custom-1': '喵娘',
      'persona-598-custom-2': '零',
      'persona-598-custom-3': '墨隐',
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

    // ── 角色卡导入（本机解析，文件不过服务器）────────────────────────
    // Character Card V2/V3（SillyTavern 生态标准）：角色数据以 base64 JSON
    // 嵌在 PNG tEXt 块里（V2 关键字 chara，V3 是 ccv3）。aicharactercards.com
    // 等站下载的 PNG 就是这种卡。解析出的多字段按中文小节结构化平铺，空字段
    // 跳过；character_book（世界书）是另一套注入机制，v1 不导入只提示。

    function latin1(bytes, start, end) {
      var s = ''
      for (var i = start; i < end; i++) s += String.fromCharCode(bytes[i])
      return s
    }

    function decodeBase64Utf8(b64) {
      var bin = atob(String(b64).replace(/\s+/g, ''))
      var bytes = new Uint8Array(bin.length)
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    }

    // 遍历 PNG chunk 找 tEXt 的 chara/ccv3 块，返回解析后的卡 JSON；不是
    // 角色卡 PNG 时返回 null（签名不对/没有块/块内容解不开都算）。
    function pngCharaJson(buffer) {
      try {
        var dv = new DataView(buffer)
        if (dv.byteLength < 8 || dv.getUint8(0) !== 0x89 || dv.getUint8(1) !== 0x50) return null
        var off = 8
        while (off + 8 <= dv.byteLength) {
          var len = dv.getUint32(off)
          var type = latin1(new Uint8Array(buffer, off + 4, 4), 0, 4)
          if (type === 'tEXt') {
            var data = new Uint8Array(buffer, off + 8, len)
            var zero = -1
            for (var i = 0; i < data.length; i++) { if (data[i] === 0) { zero = i; break } }
            if (zero > 0) {
              var keyword = latin1(data, 0, zero)
              if (keyword === 'chara' || keyword === 'ccv3') {
                try { return JSON.parse(decodeBase64Utf8(latin1(data, zero + 1, data.length))) } catch (e) { /* 继续扫其它块 */ }
              }
            }
          }
          if (type === 'IEND') break
          off += 12 + len // length(4) + type(4) + data(len) + crc(4)
        }
      } catch (e) { /* 烂图按 null 处理 */ }
      return null
    }

    // 卡 JSON（V1 顶层或 V2/V3 的 data 子对象）→ 结构化平铺文本。
    // 不像卡的输入返回 null。世界书（character_book）不进卡，用 hasBook 提示。
    function flattenCard(raw) {
      try {
        var d = raw && raw.data && (raw.data.name || raw.data.description) ? raw.data : raw
        if (!d || typeof d !== 'object') return null
        var sections = [['名字', 'name'], ['设定', 'description'], ['性格', 'personality'], ['场景', 'scenario'], ['开场白', 'first_mes'], ['对话示例', 'mes_example'], ['备注', 'creator_notes']]
        var out = []
        for (var i = 0; i < sections.length; i++) {
          var v = d[sections[i][1]]
          if (typeof v === 'string' && v.trim() !== '') out.push('【' + sections[i][0] + '】' + v.trim())
        }
        if (out.length === 0) return null
        return { text: out.join('\n\n'), hasBook: !!d.character_book, name: typeof d.name === 'string' ? d.name : '' }
      } catch (e) { return null }
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
      // 预制人设（服务端下发）：[{id,label,text}]，旧 host 无此块时 chips 隐藏。
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
      // 卡面（角色卡 PNG 原图）：host 存 characters/<presetId>.png，这里只管
      // 展示——onError（404）隐藏降级；导入成功后 bust 刷新 + 复位隐藏态。
      var avatarFailState = useState({})
      var avatarFail = avatarFailState[0]
      var setAvatarFail = avatarFailState[1]
      var avatarBustState = useState({})
      var avatarBust = avatarBustState[0]
      var setAvatarBust = avatarBustState[1]

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

      // 人设槽显示名：用户取名优先 → 人设名（喵娘/零/墨隐）→ 内置预设名。
      var presetNameOf = function (presetId) {
        var custom = names && names[presetId]
        if (custom) return String(custom)
        return SLOT_PERSONA_NAMES[presetId] || SLOT_LABELS[presetId] || presetId
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
      // Unicode code-point count, same unit as the host cap (server-sent maxLength).
      var countOf = function (presetId) { return Array.from(textOf(presetId)).length }
      var maxOf = function (presetId) {
        var slot = slots ? slots[presetId] : null
        return (slot && Number(slot.maxLength)) || 20000
      }

      // 导入：.md/.txt 直达草稿；.json/.png 解析角色卡后结构化平铺。结果只
      // 填草稿（不自动保存）——检查/删减后照常走「保存角色卡」唯一写路径。
      var handleImport = function (presetId, file) {
        if (!file) return
        var max = maxOf(presetId)
        var name = file.name.toLowerCase()
        var finish = function (imported, prefix) {
          if (!imported) { setMsg(prefix + '：解析失败——不是可识别的角色卡'); return }
          setDrafts(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = imported.text; return n })()) })
          setOpen(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = true; return n })()) })
          var count = Array.from(imported.text).length
          var tail = count > max ? '，超出 ' + String(max) + ' 字上限，请删减后保存' : (count > SOFT_WARN_CHARS ? '，注意 token 消耗（每回合注入 prompt）——检查后点保存角色卡' : '——检查后点保存角色卡')
          if (imported.hasBook) tail = '（该卡含世界书，未导入）' + tail
          setMsg((imported.name ? '已导入「' + imported.name + '」，' : prefix + '：') + '共 ' + String(count) + ' 字' + tail)
        }
        if (/\.png$/.test(name)) {
          var reader = new FileReader()
          reader.onload = function () {
            var card = pngCharaJson(reader.result)
            if (!card) { setMsg(file.name + '：不是角色卡 PNG（未找到内嵌角色数据）'); return }
            finish(flattenCard(card), file.name)
          }
          reader.onerror = function () { setMsg(file.name + '：读取失败') }
          reader.readAsArrayBuffer(file)
          // 卡面原图单独上传保存（展示用，不进 prompt）；失败静默——图是
          // 装饰，不该打扰卡文本的导入反馈。
          var imgReader = new FileReader()
          imgReader.onload = function () {
            var b64 = String(imgReader.result || '').split(',')[1] || ''
            if (!b64) return
            fetch(AVATAR_POST, {
              method: 'POST', credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ presetId: presetId, data: b64 }),
            })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (d && d.ok) {
                  setAvatarFail(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = false; return n })()) })
                  setAvatarBust(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = Date.now(); return n })()) })
                }
              })
              .catch(function () { /* 图是装饰：失败不打扰 */ })
          }
          imgReader.readAsDataURL(file)
          return
        }
        var textReader = new FileReader()
        textReader.onload = function () {
          var text = String(textReader.result || '')
          if (/\.json$/.test(name)) {
            try {
              var card = flattenCard(JSON.parse(text))
              if (card) { finish(card, file.name); return }
              setMsg(file.name + '：JSON 里没有角色卡字段（需要 name/description 等）')
            } catch (e) { setMsg(file.name + '：JSON 解析失败') }
            return
          }
          finish({ text: text, hasBook: false, name: '' }, file.name)
        }
        textReader.onerror = function () { setMsg(file.name + '：读取失败') }
        textReader.readAsText(file)
      }

      var save = function (presetId, text) {
        setBusy(true)
        setMsg('')
        // 清空保存=重置：卡与卡名一起回到出厂（人设名）——reset 语义完整。
        var body = text.trim() === ''
          ? {
              personas: (function () { var n = {}; n[presetId] = ''; return n })(),
              presetNames: (function () { var n = {}; n[presetId] = ''; return n })(),
            }
          : { personas: (function () { var n = {}; n[presetId] = text; return n })() }
        fetch(UPDATE, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d && d.ok && d.slots) {
              setSlots(d.slots)
              // 名字随响应同步（恢复默认会删 presetNames 键，本地不刷新的话
              // uncontrolled 输入框 key 不变，旧名会一直挂着）。
              if (d.names) setNames(d.names)
              setDrafts(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = null; return n })()) })
              // 折叠纯手动（▾/▸）——保存/恢复默认都不自动收，用户自己控制
              // 展开态；失败本来就保持展开。
              // 清空保存=重置：host 删了卡面文件，本地同步隐藏（避免 404 重试）。
              if (text.trim() === '') {
                setAvatarFail(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = true; return n })()) })
              }
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
            // 开关说了算：有未保存草稿也允许收起（草稿留在 state 里，重新展开
            // 原样找回），收起时头部提示「有未保存草稿」——不静默藏字，也不锁死。
            var isOpen = open[presetId] === true
            var hasDraft = draft !== null && draft !== undefined
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
              h('span', { style: muted }, '对应预设：' + (SLOT_LABELS[presetId] || presetId)),
              hasDraft && !isOpen ? h('span', { style: { color: '#e8b268', fontSize: 12 } }, '有未保存草稿') : null)
            if (!isOpen) return h('div', { key: presetId, style: { marginBottom: 10 } }, header)
            // 编辑区：卡面图（有则展示）在左，内容 textarea 在右——图只是
            // 装饰（host 存 characters/<presetId>.png，不进 prompt），404 时
            // onError 隐藏、textarea 占满整行。
            var avatarSrc = AVATAR_GET + presetId + (avatarBust[presetId] ? '?t=' + avatarBust[presetId] : '')
            return h('div', { key: presetId, style: { marginBottom: 14 } },
              header,
              h('div', { style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
                avatarFail[presetId] !== true ? h('img', {
                  src: avatarSrc,
                  alt: '卡面',
                  style: { width: 120, maxHeight: 260, objectFit: 'contain', borderRadius: 6, border: '1px solid rgba(127,127,127,.35)', background: 'rgba(127,127,127,.06)', flex: '0 0 auto', alignSelf: 'flex-start' },
                  onError: function () { setAvatarFail(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = true; return n })()) }) },
                }) : null,
                h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
                  h('textarea', {
                    style: textareaStyle,
                    value: text,
                    placeholder: slots && slots[presetId] ? slots[presetId].default : '',
                    onChange: function (e) {
                      setDrafts(function (prev) { return Object.assign({}, prev, (function () { var n = {}; n[presetId] = e.target.value; return n })()) })
                    },
                    'aria-label': '角色卡文本 · ' + displayName,
                  }))),
              h('div', { style: row },
                h('button', {
                  style: btnStyle('primary'), disabled: busy || draft === null || draft === undefined,
                  onClick: function () { save(presetId, text) },
                }, '保存角色卡'),
                h('button', { style: btnStyle(), disabled: busy, onClick: function () { save(presetId, '') } }, '恢复默认'),
                // label 包住隐藏 file input：原生触发文件选择，无需 ref。
                h('label', { style: Object.assign({}, btnStyle(), { display: 'inline-flex', alignItems: 'center' }), title: '导入 .md/.txt/.json 或角色卡 PNG（SillyTavern 格式，解析在本机完成）' },
                  '导入',
                  h('input', {
                    type: 'file', accept: '.md,.txt,.json,.png', style: { display: 'none' },
                    onChange: function (e) { handleImport(presetId, e.target.files && e.target.files[0]); e.target.value = '' },
                  })),
                h('span', { style: count > max ? { color: '#ff7369', fontSize: 12 } : muted }, String(count) + ' / ' + String(max) + ' 字'),
                count > SOFT_WARN_CHARS ? h('span', { style: { color: '#e8b268', fontSize: 12 } }, '⚠ 每回合注入 prompt，注意 token 消耗') : null))
          }),
          msg ? h('div', { style: Object.assign({ margin: '4px 0' }, muted) }, msg) : null,
          h(Hint, null, '每个预设一张角色卡：把会话挂到对应预设（人设-自定义1/2/3），它就带这张卡。卡片就是你给它设定的人设。'),
          h(Hint, null, '清空并保存即回到默认卡；改动下一次对话就生效，无需重启。')))
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
