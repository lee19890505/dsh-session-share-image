/**
 * Session share image: pick messages from the current conversation and export
 * them as one PNG, so a transcript can be shared without a screenshot.
 *
 * One composer-dock pill (session scope, so the Chat snapshot is available)
 * opens a picker dialog rendered through a portal into the page body.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-share-image',
  factory(require) {
    const React = require('react')
    const reactDom = require('react-dom')
    const h = React.createElement
    const createPortal = reactDom.createPortal

    const NS = 'dsh-session-share-image'
    const SLOT_ID = 'session-share-image'

    // ---------------------------------------------------------------- locale

    const DICT_EN = {
      button: 'Share as image',
      buttonHint: 'Export selected messages as a PNG image.',
      dialogTitle: 'Export conversation as image',
      dialogHint: 'Pick the messages to include; the preview follows your selection.',
      selectAll: 'All',
      clearAll: 'None',
      loadOlder: 'Load earlier',
      loadingOlder: 'Loading…',
      noOlder: 'No more',
      loadOlderHint: 'Load earlier messages that are not in the conversation window yet',
      selectedCount: '{count} selected',
      cancel: 'Close',
      download: 'Download PNG',
      copy: 'Copy image',
      copied: 'Copied to clipboard',
      copyFailed: 'Copy failed — use Download instead',
      zoom: 'Expand',
      zoomHint: 'Open a larger preview',
      resetZoom: 'Reset zoom (scroll to zoom)',
      generating: 'Rendering preview…',
      roleUser: 'You',
      roleAssistant: 'Assistant',
      imageTitleFallback: 'Conversation',
      imageMeta: '{count} messages · {date}',
      imageFooter: 'Exported from DeepSeek Harness',
      imagePlaceholder: '[image]',
      filePlaceholder: '[file]',
      empty: 'No text messages in this conversation yet.',
      themeLight: 'Light',
      themeDark: 'Dark',
      exported: 'PNG downloaded',
      exportFailed: 'Download failed — try Copy instead',
      renderFailed: 'Preview failed for this selection',
      previewAlt: 'Preview of the exported image',
      running: 'streaming',
      nothingSelected: 'Select at least one message.',
    }

    const DICT_ZH = {
      button: '分享为图片',
      buttonHint: '把选定的消息导出成一张 PNG 图片。',
      dialogTitle: '导出会话为图片',
      dialogHint: '勾选要包含的消息，预览会随选择更新。',
      selectAll: '全选',
      clearAll: '清空',
      loadOlder: '加载更早',
      loadingOlder: '加载中…',
      noOlder: '没有更早了',
      loadOlderHint: '拉取还没加载进会话窗口的更早消息',
      selectedCount: '已选 {count} 条',
      cancel: '关闭',
      download: '下载 PNG',
      copy: '复制图片',
      copied: '已复制到剪贴板',
      copyFailed: '复制失败，请改用下载',
      zoom: '放大',
      zoomHint: '打开更大的预览',
      resetZoom: '重置缩放（滚轮缩放）',
      generating: '正在生成预览…',
      roleUser: '你',
      roleAssistant: '助手',
      imageTitleFallback: '会话记录',
      imageMeta: '{count} 条消息 · {date}',
      imageFooter: '由 DeepSeek Harness 导出',
      imagePlaceholder: '[图片]',
      filePlaceholder: '[文件]',
      empty: '这条会话还没有可导出的文字消息。',
      themeLight: '浅色',
      themeDark: '深色',
      exported: 'PNG 已下载',
      exportFailed: '下载失败，请改用复制',
      renderFailed: '这一组消息无法生成预览',
      previewAlt: '导出图片预览',
      running: '仍在输出',
      nothingSelected: '请至少选择一条消息。',
    }

    // ------------------------------------------------------------- messages

    function contentToText(content, t) {
      if (!Array.isArray(content)) return ''
      const parts = []
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
        else if (block.type === 'image') parts.push(t('imagePlaceholder'))
        else if (block.type === 'file') parts.push(t('filePlaceholder'))
      }
      return parts.join('\n').trim()
    }

    function assistantToText(blocks, t) {
      if (!Array.isArray(blocks)) return ''
      const parts = []
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue
        if (block.kind === 'text' && typeof block.text === 'string') parts.push(block.text)
        else if (block.kind === 'image') parts.push(t('imagePlaceholder'))
      }
      return parts.join('\n').trim()
    }

    /**
     * Fold the Chat snapshot's ordered nodes into shareable messages.
     * Reasoning, tool calls, and other non-text nodes are intentionally left out.
     */
    function collectMessages(order, store, t) {
      const out = []
      if (!Array.isArray(order) || !store || typeof store.get !== 'function') return out
      for (const key of order) {
        const node = store.get(key)
        if (!node || !node.data) continue
        const data = node.data
        if (node.kind === 'user' || node.kind === 'steering') {
          const text = contentToText(data.content, t)
          if (text) out.push({ key, role: 'user', text, time: data.time })
        } else if (node.kind === 'assistant-step' || node.kind === 'assistant') {
          const text = assistantToText(data.blocks, t)
          if (text) {
            out.push({
              key,
              role: 'assistant',
              text,
              time: data.time,
              running: data.status === 'running',
            })
          }
        }
      }
      return out
    }

    // ------------------------------------------------------- markdown-lite

    function isCJK(ch) {
      return /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\uac00-\ud7af]/.test(ch)
    }

    function joinSoftLines(lines) {
      let out = ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        if (!out) { out = line; continue }
        out += (isCJK(out.slice(-1)) || isCJK(line.slice(0, 1))) ? '' : ' '
        out += line
      }
      return out
    }

    function inlineText(text) {
      return String(text)
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/\u200b|\ufeff/g, '')
    }

    /** Split Markdown into the small block vocabulary the canvas renderer knows. */
    function parseBlocks(text) {
      const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let inCode = false
      let codeLines = []
      let para = []

      const flushPara = () => {
        if (!para.length) return
        blocks.push({ type: 'p', text: inlineText(joinSoftLines(para)) })
        para = []
      }

      for (const line of lines) {
        if (/^\s*```/.test(line)) {
          if (inCode) {
            blocks.push({ type: 'code', text: codeLines.join('\n') })
            codeLines = []
            inCode = false
          } else {
            flushPara()
            inCode = true
          }
          continue
        }
        if (inCode) { codeLines.push(line.replace(/\t/g, '  ')); continue }
        if (!line.trim()) { flushPara(); continue }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          flushPara()
          blocks.push({ type: 'h', level: Math.min(3, heading[1].length), text: inlineText(heading[2]) })
          continue
        }
        const bullet = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line)
        if (bullet) {
          flushPara()
          const marker = /^\d/.test(bullet[1])
            ? bullet[1].replace(/[.)]$/, '') + '.'
            : '•'
          blocks.push({ type: 'li', marker, text: inlineText(bullet[2]) })
          continue
        }
        const quote = /^\s*>\s?(.*)$/.exec(line)
        if (quote) {
          flushPara()
          blocks.push({ type: 'quote', text: inlineText(quote[1]) })
          continue
        }
        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushPara(); blocks.push({ type: 'hr' }); continue }
        para.push(line)
      }
      if (inCode && codeLines.length) blocks.push({ type: 'code', text: codeLines.join('\n') })
      flushPara()
      return blocks
    }

    // ------------------------------------------------ palette and typography

    const FAMILY = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'
    const MONO = '"Cascadia Mono",Consolas,"SFMono-Regular",Menlo,monospace'

    const FONTS = {
      title: '700 34px ' + FAMILY,
      meta: '400 17px ' + FAMILY,
      chip: '700 13px ' + FAMILY,
      body: '400 19px ' + FAMILY,
      h1: '700 26px ' + FAMILY,
      h2: '700 22px ' + FAMILY,
      h3: '700 20px ' + FAMILY,
      quote: 'italic 400 19px ' + FAMILY,
      code: '400 15px ' + MONO,
      foot: '400 15px ' + FAMILY,
    }

    const PALETTES = {
      light: {
        bg: '#ffffff',
        text: '#1f2430',
        muted: '#5f6875',
        accent: '#3b74f0',
        rule: '#e5e9f0',
        userFg: '#1d4ed8', userBg: '#e8efff',
        aiFg: '#04715a', aiBg: '#e2f6ee',
        codeBg: '#f4f6fa', codeText: '#2b3340',
        quoteBar: '#d6dce7',
      },
      dark: {
        bg: '#101724',
        text: '#e6ebf4',
        muted: '#939eb1',
        accent: '#7aa2ff',
        rule: '#25303f',
        userFg: '#bcd0ff', userBg: '#1d2a4a',
        aiFg: '#93e6c6', aiBg: '#12322a',
        codeBg: '#19222f', codeText: '#d5dfee',
        quoteBar: '#33405a',
      },
    }

    // --------------------------------------------------------------- layout

    function wrapLines(ctx, text, maxWidth, font) {
      ctx.font = font
      const source = (text === undefined || text === null) ? '' : String(text)
      const out = []
      for (const raw of source.split('\n')) {
        if (raw === '') { out.push(''); continue }
        let line = ''
        for (const ch of raw) {
          const next = line + ch
          if (line && ctx.measureText(next).width > maxWidth) {
            const spaceAt = line.lastIndexOf(' ')
            if (spaceAt > line.length * 0.55 && !isCJK(ch)) {
              out.push(line.slice(0, spaceAt))
              line = line.slice(spaceAt + 1) + ch
            } else {
              out.push(line)
              line = ch === ' ' ? '' : ch
            }
          } else {
            line = next
          }
        }
        out.push(line)
      }
      return out
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n) }

    function formatDateTime(ms) {
      const d = new Date(ms)
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
        + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    }

    function formatClock(ms) {
      if (!ms) return ''
      const d = new Date(ms)
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    }

    /** Measure the whole document once, producing the drawing operations. */
    function layoutDocument(ctx, payload, P, t) {
      const width = 1080
      const pad = 72
      const inner = width - pad * 2
      const ops = []

      ops.push({
        t: 'text',
        lines: wrapLines(ctx, payload.title || t('imageTitleFallback'), inner, FONTS.title),
        font: FONTS.title, color: P.text, lh: 46, mt: 0,
      })
      ops.push({
        t: 'text',
        lines: wrapLines(ctx, t('imageMeta', {
          count: String(payload.messages.length),
          date: formatDateTime(payload.createdAt),
        }), inner, FONTS.meta),
        font: FONTS.meta, color: P.muted, lh: 28, mt: 12,
      })
      ops.push({ t: 'bar', h: 4, color: P.accent, mt: 26, radius: 2 })

      for (const message of payload.messages) {
        const isUser = message.role === 'user'
        ops.push({
          t: 'row',
          label: t(isUser ? 'roleUser' : 'roleAssistant'),
          fg: isUser ? P.userFg : P.aiFg,
          bg: isUser ? P.userBg : P.aiBg,
          time: formatClock(message.time) + (message.running ? ' · ' + t('running') : ''),
          timeColor: P.muted,
          mt: 34,
        })

        for (const block of parseBlocks(message.text)) {
          if (block.type === 'p') {
            ops.push({
              t: 'text', lines: wrapLines(ctx, block.text, inner, FONTS.body),
              font: FONTS.body, color: P.text, lh: 32, mt: 12,
            })
          } else if (block.type === 'h') {
            const font = block.level === 1 ? FONTS.h1 : block.level === 2 ? FONTS.h2 : FONTS.h3
            ops.push({
              t: 'text', lines: wrapLines(ctx, block.text, inner, font),
              font, color: P.text, lh: block.level === 1 ? 38 : 34, mt: 20,
            })
          } else if (block.type === 'li') {
            ops.push({
              t: 'text', lines: wrapLines(ctx, (block.marker || '•') + '  ' + block.text, inner, FONTS.body),
              font: FONTS.body, color: P.text, lh: 32, mt: 8,
            })
          } else if (block.type === 'quote') {
            ops.push({
              t: 'quote', lines: wrapLines(ctx, block.text, inner - 24, FONTS.quote),
              font: FONTS.quote, color: P.muted, lh: 32, mt: 10, bar: P.quoteBar,
            })
          } else if (block.type === 'hr') {
            ops.push({ t: 'hr', color: P.rule, mt: 20 })
          } else if (block.type === 'code') {
            ops.push({
              t: 'code',
              lines: wrapLines(ctx, block.text, inner - 36, FONTS.code),
              font: FONTS.code, color: P.codeText, bg: P.codeBg,
              lh: 26, mt: 16, pad: 18,
            })
          }
        }
      }

      ops.push({
        t: 'text', lines: [t('imageFooter')],
        font: FONTS.foot, color: P.muted, lh: 24, mt: 52,
      })

      let height = pad
      for (const op of ops) {
        height += (op.mt || 0) + opHeight(op)
      }
      height += pad

      return { ops, width, height: Math.ceil(height), pad, inner }
    }

    function opHeight(op) {
      if (op.t === 'text' || op.t === 'quote') return op.lines.length * op.lh
      if (op.t === 'code') return op.pad * 2 + op.lines.length * op.lh
      if (op.t === 'row') return 30
      if (op.t === 'bar') return op.h
      if (op.t === 'hr') return 1
      return 0
    }

    function roundRect(ctx, x, y, w, hgt, r) {
      const radius = Math.min(r, w / 2, hgt / 2)
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, hgt, radius)
        return
      }
      ctx.moveTo(x + radius, y)
      ctx.arcTo(x + w, y, x + w, y + hgt, radius)
      ctx.arcTo(x + w, y + hgt, x, y + hgt, radius)
      ctx.arcTo(x, y + hgt, x, y, radius)
      ctx.arcTo(x, y, x + w, y, radius)
      ctx.closePath()
    }

    function drawDocument(canvas, layout, P) {
      const ctx = canvas.getContext('2d')
      const scale = canvas.width / layout.width
      ctx.scale(scale, scale)
      ctx.fillStyle = P.bg
      ctx.fillRect(0, 0, layout.width, layout.height)

      const left = layout.pad
      const right = layout.width - layout.pad
      let y = layout.pad

      for (const op of layout.ops) {
        y += op.mt || 0
        if (op.t === 'text') {
          ctx.font = op.font
          ctx.fillStyle = op.color
          let lineY = y + op.lh * 0.72
          for (const line of op.lines) {
            ctx.fillText(line, left, lineY)
            lineY += op.lh
          }
        } else if (op.t === 'quote') {
          ctx.fillStyle = op.bar
          ctx.fillRect(left, y + 2, 3, op.lines.length * op.lh - 4)
          ctx.font = op.font
          ctx.fillStyle = op.color
          let lineY = y + op.lh * 0.72
          for (const line of op.lines) {
            ctx.fillText(line, left + 24, lineY)
            lineY += op.lh
          }
        } else if (op.t === 'bar') {
          ctx.fillStyle = op.color
          roundRect(ctx, left, y, 88, op.h, op.radius)
          ctx.fill()
        } else if (op.t === 'hr') {
          ctx.fillStyle = op.color
          ctx.fillRect(left, y, layout.inner, 1)
        } else if (op.t === 'row') {
          ctx.font = FONTS.chip
          const chipW = ctx.measureText(op.label).width + 26
          ctx.fillStyle = op.bg
          roundRect(ctx, left, y + 1, chipW, 26, 13)
          ctx.fill()
          ctx.fillStyle = op.fg
          ctx.fillText(op.label, left + 13, y + 18.5)
          if (op.time) {
            ctx.font = FONTS.meta
            ctx.fillStyle = op.timeColor
            const timeW = ctx.measureText(op.time).width
            ctx.fillText(op.time, right - timeW, y + 18.5)
          }
        } else if (op.t === 'code') {
          const codeH = opHeight(op)
          ctx.fillStyle = op.bg
          roundRect(ctx, left, y, layout.inner, codeH, 10)
          ctx.fill()
          ctx.font = op.font
          ctx.fillStyle = op.color
          let lineY = y + op.pad + op.lh * 0.72
          for (const line of op.lines) {
            ctx.fillText(line, left + 18, lineY)
            lineY += op.lh
          }
        }
        y += opHeight(op)
      }
      return canvas
    }

    function buildCanvas(payload, mode, t) {
      const P = PALETTES[mode] || PALETTES.light
      const measureCtx = document.createElement('canvas').getContext('2d')
      const layout = layoutDocument(measureCtx, payload, P, t)
      const scale = Math.min(2, 30000 / layout.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(layout.width * scale)
      canvas.height = Math.floor(layout.height * scale)
      return drawDocument(canvas, layout, P)
    }

    function downloadCanvas(canvas, payload, onResult) {
      const d = new Date(payload.createdAt)
      const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
        + '-' + pad2(d.getHours()) + pad2(d.getMinutes())
      canvas.toBlob((blob) => {
        if (!blob) {
          if (onResult) onResult(false)
          return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'dsh-session-' + stamp + '.png'
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        if (onResult) onResult(true)
      }, 'image/png')
    }

    function copyCanvas(canvas) {
      return new Promise((resolve, reject) => {
        if (!navigator.clipboard || typeof ClipboardItem !== 'function') {
          reject(new Error('clipboard image write unavailable'))
          return
        }
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('no blob'))
            return
          }
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(resolve, reject)
        }, 'image/png')
      })
    }

    // ----------------------------------------------------------- components

    function shareIcon() {
      return h('svg', {
        viewBox: '0 0 20 20', width: 14, height: 14, 'aria-hidden': true,
        style: { display: 'block', flex: '0 0 auto' },
      },
      h('rect', {
        x: 2.4, y: 3, width: 15.2, height: 10, rx: 2.2,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
      }),
      h('path', {
        d: 'M5.6 11 8.4 8l2.2 2.2 1.9-1.8 1.9 2.6',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M10 13.4v4.4m0 0 2.1-2.1M10 17.8l-2.1-2.1',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    function expandIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': true,
        style: { display: 'block', flex: '0 0 auto' },
      },
      h('path', {
        d: 'M6 2.5H2.5V6M10 2.5h3.5V6M13.5 10v3.5H10M2.5 10v3.5H6',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    function Modal(props) {
      const payload = props.payload
      const t = props.t || ((key) => key)
      const onClose = props.onClose
      const onLoadOlder = props.onLoadOlder
      const messages = payload.messages

      const selectionState = React.useState(() => new Set(messages.map((message) => message.key)))
      const selection = selectionState[0]
      const setSelection = selectionState[1]

      const knownKeysRef = React.useRef(new Set(messages.map((message) => message.key)))

      // Newly pulled history joins the selection already made.
      React.useEffect(() => {
        const known = knownKeysRef.current
        const added = messages.filter((message) => !known.has(message.key))
        if (!added.length) return
        for (const message of added) known.add(message.key)
        setSelection((prev) => {
          const next = new Set(prev)
          for (const message of added) next.add(message.key)
          return next
        })
      }, [messages, setSelection])

      const themeState = React.useState(payload.light ? 'light' : 'dark')
      const mode = themeState[0]
      const setMode = themeState[1]

      const previewState = React.useState({ url: '', busy: true, failed: false })
      const preview = previewState[0]
      const setPreview = previewState[1]

      const statusState = React.useState('')
      const status = statusState[0]
      const setStatus = statusState[1]

      const zoomState = React.useState(false)
      const zoom = zoomState[0]
      const setZoom = zoomState[1]

      const canvasRef = React.useRef(null)
      const panelRef = React.useRef(null)

      React.useEffect(() => {
        const node = panelRef.current
        if (node && typeof node.focus === 'function') node.focus({ preventScroll: true })
      }, [])

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          if (zoom) setZoom(false)
          else onClose()
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [onClose, zoom])

      const chosen = React.useMemo(
        () => messages.filter((message) => selection.has(message.key)),
        [messages, selection],
      )

      React.useEffect(() => {
        if (!chosen.length) {
          canvasRef.current = null
          setPreview({ url: '', busy: false, failed: false })
          return undefined
        }
        let cancelled = false
        setPreview((prev) => ({ url: prev.url, busy: true, failed: false }))
        const timer = setTimeout(() => {
          let url = ''
          let failed = false
          try {
            const canvas = buildCanvas({ ...payload, messages: chosen }, mode, t)
            canvasRef.current = canvas
            url = canvas.toDataURL('image/png')
          } catch (error) {
            canvasRef.current = null
            failed = true
          }
          if (!cancelled) setPreview({ url, busy: false, failed })
        }, 140)
        return () => { cancelled = true; clearTimeout(timer) }
      }, [chosen, mode, payload, t])

      const toggle = (key) => {
        setSelection((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
        setStatus('')
      }

      const allOn = messages.length > 0 && messages.every((message) => selection.has(message.key))
      const noneOn = messages.every((message) => !selection.has(message.key))
      const downloadDisabled = !chosen.length || preview.busy || !preview.url

      const loadingState = React.useState(false)
      const loadingOlder = loadingState[0]
      const setLoadingOlder = loadingState[1]

      const exhaustedState = React.useState(false)
      const exhausted = exhaustedState[0]
      const setExhausted = exhaustedState[1]

      const loadOlder = () => {
        if (!onLoadOlder || loadingOlder || exhausted) return
        setLoadingOlder(true)
        Promise.resolve(onLoadOlder()).then((changed) => {
          setLoadingOlder(false)
          if (!changed) setExhausted(true)
        }, () => {
          setLoadingOlder(false)
          setExhausted(true)
        })
      }

      const onDownload = () => {
        if (!canvasRef.current || !chosen.length) return
        setStatus('')
        downloadCanvas(canvasRef.current, payload, (ok) => {
          setStatus(t(ok ? 'exported' : 'exportFailed'))
        })
      }

      const onCopy = () => {
        if (!canvasRef.current || !chosen.length) return
        copyCanvas(canvasRef.current).then(
          () => setStatus(t('copied')),
          () => setStatus(t('copyFailed')),
        )
      }

      const segmentStyle = (active) => ({
        height: '26px',
        padding: '0 10px',
        borderRadius: '7px',
        border: '1px solid ' + (active
          ? 'var(--dsw-alias-border-selected, rgba(80,130,255,.85))'
          : 'transparent'),
        background: active
          ? 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.18))'
          : 'transparent',
        color: active
          ? 'var(--dsw-alias-label-primary, inherit)'
          : 'var(--dsw-alias-label-secondary, #6b7280)',
        fontSize: '12px',
        fontFamily: 'inherit',
        lineHeight: '1',
        cursor: 'pointer',
      })

      const textButtonStyle = (disabled) => ({
        height: '24px',
        padding: '0 8px',
        borderRadius: '7px',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #6b7280)',
        fontSize: '12px',
        fontFamily: 'inherit',
        lineHeight: '1',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      })

      const secondaryStyle = {
        height: '32px',
        padding: '0 14px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28))',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, inherit)',
        fontSize: '13px',
        fontFamily: 'inherit',
        lineHeight: '1',
        whiteSpace: 'nowrap',
        cursor: downloadDisabled ? 'default' : 'pointer',
        opacity: downloadDisabled ? 0.45 : 1,
      }

      const primaryStyle = {
        height: '32px',
        padding: '0 15px',
        borderRadius: '8px',
        border: '1px solid transparent',
        background: downloadDisabled
          ? 'var(--dsw-alias-button-primary-dimmed, #93a7d4)'
          : 'var(--dsw-alias-button-primary-fill, #2563eb)',
        color: 'var(--dsw-alias-label-primary-inverted, #ffffff)',
        fontSize: '13px',
        fontFamily: 'inherit',
        lineHeight: '1',
        whiteSpace: 'nowrap',
        cursor: downloadDisabled ? 'default' : 'pointer',
      }

      const rows = messages.map((message, index) => h('label', {
        key: message.key + ':' + index,
        style: {
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          padding: '9px 10px',
          borderRadius: '8px',
          cursor: 'pointer',
          background: selection.has(message.key)
            ? 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,.10))'
            : 'transparent',
        },
      },
      h('input', {
        type: 'checkbox',
        checked: selection.has(message.key),
        onChange: () => toggle(message.key),
        style: { marginTop: '3px', flex: '0 0 auto' },
      }),
      h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
        h('div', {
          style: {
            display: 'flex',
            gap: '8px',
            alignItems: 'baseline',
            marginBottom: '3px',
            fontSize: '11px',
            letterSpacing: '.02em',
            textTransform: 'uppercase',
            color: message.role === 'user'
              ? 'var(--dsw-alias-state-business-primary, #2563eb)'
              : 'var(--dsw-alias-state-success-primary, #059669)',
          },
        },
        t(message.role === 'user' ? 'roleUser' : 'roleAssistant'),
        h('span', { style: { opacity: 0.6, textTransform: 'none' } }, formatClock(message.time))),
        h('div', {
          style: {
            fontSize: '13px',
            lineHeight: '1.45',
            color: 'var(--dsw-alias-label-secondary, #4b5563)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: '2',
            WebkitBoxOrient: 'vertical',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          },
        }, message.text.slice(0, 240)))))

      const listColumn = h('div', {
        style: {
          flex: '44 1 0%',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        },
      },
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          color: 'var(--dsw-alias-label-secondary, #6b7280)',
        },
      },
      h('span', { style: { flex: '1 1 auto' } }, t('selectedCount', { count: String(chosen.length) })),
      onLoadOlder
        ? h('button', {
          type: 'button',
          onClick: loadOlder,
          disabled: loadingOlder || exhausted,
          title: t('loadOlderHint'),
          style: textButtonStyle(loadingOlder || exhausted),
        }, loadingOlder ? t('loadingOlder') : exhausted ? t('noOlder') : t('loadOlder'))
        : null,
      h('button', {
        type: 'button',
        onClick: () => { setSelection(new Set(messages.map((message) => message.key))); setStatus('') },
        disabled: allOn,
        style: textButtonStyle(allOn),
      }, t('selectAll')),
      h('button', {
        type: 'button',
        onClick: () => { setSelection(new Set()); setStatus('') },
        disabled: noneOn,
        style: textButtonStyle(noneOn),
      }, t('clearAll'))),
      h('div', {
        style: {
          overflowY: 'auto',
          paddingRight: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          flex: '1 1 auto',
          minHeight: 0,
        },
      }, rows.length ? rows : h('div', {
        style: {
          fontSize: '13px',
          color: 'var(--dsw-alias-label-secondary, #6b7280)',
          padding: '12px 4px',
        },
      }, t('empty'))))

      const previewBox = h('div', {
        style: {
          position: 'relative',
          flex: '1 1 auto',
          minHeight: '180px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '10px',
          border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.16))',
          background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06))',
          overflow: 'hidden',
          padding: '10px',
        },
      }, preview.url
        ? h('img', {
          src: preview.url,
          alt: t('previewAlt'),
          title: t('zoomHint'),
          onClick: () => setZoom(true),
          style: {
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '6px',
            boxShadow: '0 6px 18px rgba(0,0,0,.18)',
            cursor: 'zoom-in',
          },
        })
        : h('div', {
          style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #6b7280)' },
        }, preview.busy
          ? t('generating')
          : messages.length === 0
            ? t('empty')
            : preview.failed ? t('renderFailed') : t('nothingSelected')),
      preview.url
        ? h('button', {
          type: 'button',
          onClick: () => setZoom(true),
          title: t('zoomHint'),
          'aria-label': t('zoom'),
          style: {
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            height: '26px',
            padding: '0 9px',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,.22)',
            background: 'var(--dsw-alias-bg-overlay, rgba(17,22,32,.66))',
            color: 'var(--dsw-alias-label-primary-inverted, #ffffff)',
            fontSize: '12px',
            fontFamily: 'inherit',
            lineHeight: '1',
            cursor: 'pointer',
          },
        }, expandIcon(), t('zoom'))
        : null)

      const footerRow = h('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px' },
      },
      h('div', {
        style: {
          display: 'flex',
          gap: '2px',
          padding: '2px',
          borderRadius: '8px',
          background: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,.12))',
        },
      },
      h('button', {
        type: 'button',
        onClick: () => setMode('light'),
        style: segmentStyle(mode === 'light'),
      }, t('themeLight')),
      h('button', {
        type: 'button',
        onClick: () => setMode('dark'),
        style: segmentStyle(mode === 'dark'),
      }, t('themeDark'))),
      h('span', {
        style: {
          flex: '1 1 auto',
          minWidth: 0,
          fontSize: '11px',
          color: 'var(--dsw-alias-label-secondary, #6b7280)',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }, status),
      h('button', {
        type: 'button',
        onClick: onCopy,
        disabled: downloadDisabled,
        style: secondaryStyle,
      }, t('copy')),
      h('button', {
        type: 'button',
        onClick: onDownload,
        disabled: downloadDisabled,
        style: primaryStyle,
      }, t('download')))

      const previewColumn = h('div', {
        style: {
          flex: '56 1 0%',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        },
      }, previewBox, footerRow)

      const header = h('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '16px 18px 12px',
          borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.16))',
        },
      },
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        h('div', { style: { fontSize: '15px', fontWeight: '600' } }, t('dialogTitle')),
        h('div', {
          style: {
            marginTop: '3px',
            fontSize: '12px',
            color: 'var(--dsw-alias-label-secondary, #6b7280)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }, t('dialogHint'))),
      h('button', {
        type: 'button',
        onClick: onClose,
        'aria-label': t('cancel'),
        title: t('cancel'),
        style: {
          flex: '0 0 auto',
          width: '28px',
          height: '28px',
          borderRadius: '7px',
          border: '1px solid transparent',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary, #6b7280)',
          fontSize: '16px',
          lineHeight: '1',
          cursor: 'pointer',
        },
      }, '\u00d7'))

      const body = h('div', {
        style: {
          display: 'flex',
          gap: '14px',
          padding: '14px 18px 16px',
          minHeight: 0,
          overflow: 'hidden',
          flex: '1 1 auto',
        },
      }, listColumn, previewColumn)

      const panel = h('div', {
        ref: panelRef,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('dialogTitle'),
        tabIndex: -1,
        style: {
          width: 'min(960px, 100%)',
          height: 'min(760px, calc(100vh - 48px))',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '14px',
          border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))',
          background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
          color: 'var(--dsw-alias-label-primary, #111827)',
          boxShadow: '0 24px 70px rgba(0,0,0,.35)',
          overflow: 'hidden',
          outline: 'none',
        },
      }, header, body)

      // The app's frame layers (composer, header, drawers) are positioned with
      // their own z-index inside the root stacking context, so a body portal
      // must outrank them explicitly to sit and click above the whole frame.
      const LAYER = 2147483000

      const lightbox = zoom && preview.url
        ? h(Lightbox, {
          url: preview.url,
          t,
          onClose: () => setZoom(false),
          onCopy,
          onDownload,
          status,
          downloadDisabled,
          layer: LAYER + 1,
        })
        : null

      return h('div', {
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: LAYER,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'rgba(15,18,26,.48)',
          backdropFilter: 'blur(2px)',
          fontFamily: 'inherit',
        },
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose()
        },
      }, panel, lightbox)
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    /**
     * Floating preview surface: the dark panel is inset so the app's own window
     * chrome (including the native caption buttons) stays visible around it.
     * Clicking the margin closes; the image fills the panel width by default,
     * pans by drag, and zooms with the wheel.
     */
    function Lightbox(props) {
      const { url, t, onClose, onCopy, onDownload, status, downloadDisabled, layer } = props
      const stageRef = React.useRef(null)
      const rootRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const movedRef = React.useRef(false)

      const viewState = React.useState({ scale: 1, x: 0, y: 0 })
      const view = viewState[0]
      const setView = viewState[1]

      const naturalState = React.useState(0)
      const naturalWidth = naturalState[0]
      const setNaturalWidth = naturalState[1]

      React.useEffect(() => {
        const node = rootRef.current
        if (!node) return undefined
        const onWheel = (event) => {
          event.preventDefault()
          const factor = Math.exp(-event.deltaY * 0.0018)
          setView((prev) => ({ scale: clamp(prev.scale * factor, 0.2, 6), x: prev.x, y: prev.y }))
        }
        node.addEventListener('wheel', onWheel, { passive: false })
        return () => node.removeEventListener('wheel', onWheel)
      }, [])

      const onPointerDown = (event) => {
        if (event.button !== 0) return
        // Never capture the pointer over a control: capture retargets the
        // follow-up click to this element, so the button would never fire.
        if (event.target && typeof event.target.closest === 'function' && event.target.closest('button')) return
        movedRef.current = false
        dragRef.current = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          ox: view.x,
          oy: view.y,
          onBackground: event.target === event.currentTarget,
        }
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* ignore */ }
      }

      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!movedRef.current && Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true
        if (movedRef.current) setView({ scale: view.scale, x: drag.ox + dx, y: drag.oy + dy })
      }

      const onPointerUp = (event) => {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        dragRef.current = null
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch (error) { /* ignore */ }
        if (!movedRef.current && drag.onBackground) onClose()
      }

      const pillStyle = {
        height: '32px',
        padding: '0 14px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,.24)',
        background: 'rgba(12,16,24,.72)',
        color: '#ffffff',
        fontSize: '13px',
        fontFamily: 'inherit',
        lineHeight: '1',
        cursor: 'pointer',
      }

      const bottomBar = h('div', {
        style: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          padding: '14px 20px 18px',
          background: 'linear-gradient(to top, rgba(4,7,12,.94), rgba(4,7,12,0))',
        },
      },
      h('button', {
        type: 'button',
        onClick: () => setView({ scale: 1, x: 0, y: 0 }),
        title: t('resetZoom'),
        style: {
          ...pillStyle,
          minWidth: '62px',
          padding: '0 12px',
          fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
        },
      }, Math.round(view.scale * 100) + '%'),
      h('button', {
        type: 'button',
        onClick: onCopy,
        disabled: downloadDisabled,
        style: {
          ...pillStyle,
          opacity: downloadDisabled ? 0.45 : 1,
          cursor: downloadDisabled ? 'default' : 'pointer',
        },
      }, t('copy')),
      h('button', {
        type: 'button',
        onClick: onDownload,
        disabled: downloadDisabled,
        style: {
          height: '32px',
          padding: '0 15px',
          borderRadius: '8px',
          border: '1px solid transparent',
          background: downloadDisabled
            ? 'var(--dsw-alias-button-primary-dimmed, #93a7d4)'
            : 'var(--dsw-alias-button-primary-fill, #2563eb)',
          color: '#ffffff',
          fontSize: '13px',
          fontFamily: 'inherit',
          lineHeight: '1',
          cursor: downloadDisabled ? 'default' : 'pointer',
        },
      }, t('download')),
      status ? h('span', {
        style: { fontSize: '11px', color: 'rgba(255,255,255,.68)', marginLeft: '4px' },
      }, status) : null)

      const panelClose = h('button', {
        type: 'button',
        onClick: onClose,
        'aria-label': t('cancel'),
        title: t('cancel'),
        style: {
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 2,
          width: '30px',
          height: '30px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,.2)',
          background: 'rgba(12,16,24,.72)',
          color: '#ffffff',
          fontSize: '15px',
          lineHeight: '1',
          cursor: 'pointer',
        },
      }, '\u00d7')

      const imageWrap = h('div', {
        style: {
          position: 'absolute',
          inset: 0,
          padding: '22px 22px 78px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
      }, h('img', {
        src: url,
        alt: t('previewAlt'),
        draggable: false,
        onLoad: (event) => setNaturalWidth(event.target.naturalWidth || 0),
        style: {
          width: '100%',
          height: 'auto',
          maxWidth: naturalWidth ? naturalWidth + 'px' : '100%',
          maxHeight: 'none',
          borderRadius: '6px',
          boxShadow: '0 18px 60px rgba(0,0,0,.55)',
          transform: 'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.scale + ')',
          transition: dragRef.current ? 'none' : 'transform .08s ease-out',
          cursor: 'grab',
        },
      }))

      // Top inset leaves the window's own title bar (and its caption buttons)
      // outside the panel, so hovering that corner no longer looks like ours.
      const panel = h('div', {
        style: {
          position: 'absolute',
          top: '36px',
          left: '28px',
          right: '28px',
          bottom: '28px',
          borderRadius: '12px',
          background: 'rgba(8,11,17,.95)',
          border: '1px solid rgba(255,255,255,.08)',
          boxShadow: '0 30px 90px rgba(0,0,0,.6)',
          overflow: 'hidden',
        },
      }, imageWrap, bottomBar, panelClose)

      return h('div', {
        ref: rootRef,
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: layer,
          background: 'transparent',
          fontFamily: 'inherit',
        },
      }, h('div', {
        ref: stageRef,
        style: {
          position: 'absolute',
          inset: 0,
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
        },
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
      }, panel))
    }

    function DockButton(props) {
      const useChat = props.useChat
      const useSessions = props.useSessions
      const sessionId = props.sessionId
      const t = props.t || ((key) => key)

      const hoverState = React.useState(false)
      const hover = hoverState[0]
      const setHover = hoverState[1]

      const dialogState = React.useState(null)
      const payload = dialogState[0]
      const setPayload = dialogState[1]

      const order = useChat((snapshot) => snapshot.order)
      const nodes = useChat((snapshot) => snapshot.nodes)
      const title = useSessions((snapshot) => {
        const row = snapshot.byId[sessionId]
        return row ? row.displayTitle : ''
      })

      const disabled = !order || order.length === 0

      const onClick = () => {
        if (disabled) return
        // An empty result still opens the dialog so its own copy explains why
        // there is nothing to export, instead of the button doing nothing.
        setPayload({
          messages: collectMessages(order, nodes, t),
          title: title || t('imageTitleFallback'),
          createdAt: Date.now(),
          light: !document.body.hasAttribute('data-ds-dark-theme'),
        })
      }

      const close = React.useCallback(() => setPayload(null), [])

      const latestRef = React.useRef({ order, nodes })
      latestRef.current = { order, nodes }

      const getBinding = React.useCallback(() => {
        try {
          const sessions = props.hostCtx && props.hostCtx.sessions
          if (!sessions || typeof sessions.binding !== 'function') return undefined
          return sessions.binding(sessionId)
        } catch (error) {
          return undefined
        }
      }, [props.hostCtx, sessionId])

      const canLoadOlder = React.useMemo(() => {
        const binding = getBinding()
        return Boolean(binding && typeof binding.loadOlder === 'function')
      }, [getBinding])

      // The Chat window loads the newest turns first, so the earliest messages
      // can be absent from the snapshot until older history is pulled in.
      const loadOlder = React.useCallback(() => {
        const binding = getBinding()
        if (!binding) return Promise.resolve(false)
        const before = latestRef.current.order ? latestRef.current.order.length : 0

        const grown = () => {
          const latest = latestRef.current
          return (latest.order ? latest.order.length : 0) > before
        }
        const waitForGrowth = () => new Promise((resolve) => {
          const deadline = Date.now() + 1500
          const tick = () => {
            if (grown()) { resolve(true); return }
            if (Date.now() > deadline) { resolve(false); return }
            setTimeout(tick, 60)
          }
          tick()
        })

        let chain = Promise.resolve()
        for (let page = 0; page < 2; page += 1) {
          chain = chain.then(() => binding.loadOlder().catch(() => undefined))
        }
        return chain
          .then(waitForGrowth)
          .then((ok) => {
            const latest = latestRef.current
            const messages = collectMessages(latest.order, latest.nodes, t)
            setPayload((prev) => (prev ? { ...prev, messages } : prev))
            return ok
          })
          .catch(() => false)
      }, [getBinding, t])

      const button = h('button', {
        type: 'button',
        title: t('buttonHint'),
        'aria-label': t('button'),
        onClick,
        disabled,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: '28px',
          padding: '0 11px',
          margin: '0 2px',
          borderRadius: '999px',
          border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28))',
          background: hover
            ? 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,.16))'
            : 'var(--dsw-alias-bg-layer-1, transparent)',
          color: 'var(--dsw-alias-label-secondary, #6b7280)',
          fontSize: '12px',
          fontFamily: 'inherit',
          lineHeight: '1',
          whiteSpace: 'nowrap',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transition: 'background-color .12s ease',
        },
      }, shareIcon(), h('span', null, t('button')))

      if (!payload) return button
      return h(React.Fragment, null,
        button,
        createPortal(
          h(Modal, {
            key: payload.createdAt,
            payload,
            t,
            onClose: close,
            onLoadOlder: canLoadOlder ? loadOlder : null,
          }),
          document.body,
        ))
    }

    // --------------------------------------------------------------- module

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en: DICT_EN, zh: DICT_ZH }),
          'session-share-image: locale dictionaries',
        )

        // The seat component needs the host context to pull older history for
        // this session; a closure keeps that out of the slot props contract.
        const DockSeat = (props) => h(DockButton, { ...props, hostCtx: ctx })

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: SLOT_ID,
          order: 6,
          locale: NS,
        }, DockSeat))
      },
    }
  },
})
