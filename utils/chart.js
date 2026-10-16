// 轻量 Canvas 2D 绘图：支持线性/对数坐标、多曲线、标记点、参考线、等比例坐标与读数光标
// 只依赖标准 CanvasRenderingContext2D 接口，小程序 canvas type="2d" 与浏览器通用

const F = require('./format')

const PALETTE = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777']

const THEME = {
  bg: '#ffffff',
  grid: '#eef0f3',
  gridMinor: '#f5f6f8',
  axis: '#9ca3af',
  frame: '#d1d5db',
  text: '#6b7280',
  title: '#111827',
  cursor: '#374151'
}

function niceStep(range, target) {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / mag
  const s = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  return s * mag
}

function linTicks(min, max, target) {
  const step = niceStep(max - min, target)
  const ticks = []
  const start = Math.ceil(min / step - 1e-9) * step
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return { ticks, step }
}

function tickLabel(v, step) {
  if (Math.abs(v) < 1e-12) return '0'
  const ax = Math.abs(v)
  if (ax >= 1e5 || ax < 1e-3) return F.fmt(v, 2)
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  return String(Number(v.toFixed(Math.min(dec, 6))))
}

function logLabel(k) {
  if (k >= -3 && k <= 4) return String(Number(Math.pow(10, k).toFixed(Math.max(0, -k))))
  return '1e' + k
}

function dataBounds(series, xLog) {
  let xmin = Infinity
  let xmax = -Infinity
  let ymin = Infinity
  let ymax = -Infinity
  series.forEach(s => {
    if (s.noBounds) return
    for (let i = 0; i < s.x.length; i++) {
      const x = s.x[i]
      const y = s.y[i]
      if (!isFinite(x) || !isFinite(y)) continue
      if (xLog && x <= 0) continue
      if (x < xmin) xmin = x
      if (x > xmax) xmax = x
      if (y < ymin) ymin = y
      if (y > ymax) ymax = y
    }
  })
  return { xmin, xmax, ymin, ymax }
}

function bsearch(xs, x) {
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (xs[m] < x) lo = m
    else hi = m
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi
}

function draw(ctx, W, H, o) {
  o = o || {}
  const series = (o.series || []).map((s, i) => Object.assign({ color: PALETTE[i % PALETTE.length], width: 2, type: 'line' }, s))
  const xLog = !!o.xLog
  const pad = {
    l: o.padLeft || 46,
    r: 12,
    t: o.title ? 26 : 12,
    b: o.xLabel ? 36 : 24
  }
  const pl = pad.l
  const pt = pad.t
  const pw = Math.max(10, W - pad.l - pad.r)
  const ph = Math.max(10, H - pad.t - pad.b)

  // ---- 坐标范围 ----
  const b = dataBounds(series, xLog)
  ;(o.extraPoints || []).forEach(p => {
    b.xmin = Math.min(b.xmin, p[0])
    b.xmax = Math.max(b.xmax, p[0])
    b.ymin = Math.min(b.ymin, p[1])
    b.ymax = Math.max(b.ymax, p[1])
  })
  let xmin = o.xRange ? o.xRange[0] : b.xmin
  let xmax = o.xRange ? o.xRange[1] : b.xmax
  let ymin = o.yRange ? o.yRange[0] : b.ymin
  let ymax = o.yRange ? o.yRange[1] : b.ymax
  if (!isFinite(xmin) || !isFinite(xmax)) {
    xmin = xLog ? 0.1 : 0
    xmax = xLog ? 10 : 1
  }
  if (!isFinite(ymin) || !isFinite(ymax)) {
    ymin = -1
    ymax = 1
  }
  if (!o.yRange) {
    if (o.yIncludeZero) {
      ymin = Math.min(ymin, 0)
      ymax = Math.max(ymax, 0)
    }
    if (o.yClamp) {
      ymin = Math.max(ymin, o.yClamp[0])
      ymax = Math.min(ymax, o.yClamp[1])
    }
    if (ymax - ymin < 1e-12 * Math.max(1, Math.abs(ymax))) {
      const d = Math.abs(ymax) * 0.1 || 1
      ymin -= d
      ymax += d
    }
    const py = (ymax - ymin) * 0.06
    ymin -= py
    ymax += py
  }
  if (!xLog && xmax - xmin < 1e-12 * Math.max(1, Math.abs(xmax))) {
    const d = Math.abs(xmax) * 0.1 || 1
    xmin -= d
    xmax += d
  }
  if (!o.xRange && o.xPad && !xLog) {
    const px = (xmax - xmin) * o.xPad
    xmin -= px
    xmax += px
  }
  if (xLog) {
    if (xmin <= 0) xmin = xmax / 1000
    if (xmax / xmin < 1.0001) {
      xmin /= 10
      xmax *= 10
    }
  }
  if (o.equalAspect && !xLog) {
    const ux = (xmax - xmin) / pw
    const uy = (ymax - ymin) / ph
    if (ux > uy) {
      const c = (ymin + ymax) / 2
      const half = (ux * ph) / 2
      ymin = c - half
      ymax = c + half
    } else {
      const c = (xmin + xmax) / 2
      const half = (uy * pw) / 2
      xmin = c - half
      xmax = c + half
    }
  }

  const lxmin = xLog ? Math.log10(xmin) : xmin
  const lxmax = xLog ? Math.log10(xmax) : xmax
  const toPxX = x => pl + (((xLog ? Math.log10(x) : x) - lxmin) / (lxmax - lxmin)) * pw
  const toPxY = y => pt + ph - ((y - ymin) / (ymax - ymin)) * ph
  const toDataX = px => {
    const v = lxmin + ((px - pl) / pw) * (lxmax - lxmin)
    return xLog ? Math.pow(10, v) : v
  }
  const toDataY = py => ymin + ((pt + ph - py) / ph) * (ymax - ymin)
  const clampPx = v => Math.max(-1e5, Math.min(1e5, v))

  // ---- 背景与网格 ----
  ctx.save()
  ctx.fillStyle = THEME.bg
  ctx.fillRect(0, 0, W, H)
  ctx.font = '10px sans-serif'
  ctx.lineWidth = 1
  ctx.textBaseline = 'middle'

  // x 网格
  ctx.textAlign = 'center'
  if (xLog) {
    const k0 = Math.floor(lxmin)
    const k1 = Math.ceil(lxmax)
    const span = k1 - k0
    const every = span > 8 ? 2 : 1
    for (let k = k0; k <= k1; k++) {
      for (let m = 1; m < 10; m++) {
        const v = m * Math.pow(10, k)
        if (v < xmin * 0.9999 || v > xmax * 1.0001) continue
        const x = toPxX(v)
        ctx.strokeStyle = m === 1 ? THEME.grid : THEME.gridMinor
        ctx.beginPath()
        ctx.moveTo(x, pt)
        ctx.lineTo(x, pt + ph)
        ctx.stroke()
        if (m === 1 && (k - k0) % every === 0) {
          ctx.fillStyle = THEME.text
          ctx.fillText(logLabel(k), x, pt + ph + 10)
        }
      }
    }
  } else {
    const xt = linTicks(xmin, xmax, Math.max(3, Math.floor(pw / 60)))
    xt.ticks.forEach(v => {
      const x = toPxX(v)
      ctx.strokeStyle = THEME.grid
      ctx.beginPath()
      ctx.moveTo(x, pt)
      ctx.lineTo(x, pt + ph)
      ctx.stroke()
      ctx.fillStyle = THEME.text
      ctx.fillText(tickLabel(v, xt.step), x, pt + ph + 10)
    })
  }
  // y 网格
  ctx.textAlign = 'right'
  const yt = linTicks(ymin, ymax, Math.max(3, Math.floor(ph / 40)))
  yt.ticks.forEach(v => {
    const y = toPxY(v)
    ctx.strokeStyle = THEME.grid
    ctx.beginPath()
    ctx.moveTo(pl, y)
    ctx.lineTo(pl + pw, y)
    ctx.stroke()
    ctx.fillStyle = THEME.text
    ctx.fillText(tickLabel(v, yt.step), pl - 4, y)
  })
  // 零轴
  ctx.strokeStyle = THEME.axis
  if (ymin < 0 && ymax > 0) {
    ctx.beginPath()
    ctx.moveTo(pl, toPxY(0))
    ctx.lineTo(pl + pw, toPxY(0))
    ctx.stroke()
  }
  if (!xLog && xmin < 0 && xmax > 0) {
    ctx.beginPath()
    ctx.moveTo(toPxX(0), pt)
    ctx.lineTo(toPxX(0), pt + ph)
    ctx.stroke()
  }
  // 边框
  ctx.strokeStyle = THEME.frame
  ctx.strokeRect(pl, pt, pw, ph)

  // 标题与轴标签
  if (o.title) {
    ctx.fillStyle = THEME.title
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(o.title, pl, 13)
  }
  ctx.font = '10px sans-serif'
  if (o.xLabel) {
    ctx.fillStyle = THEME.text
    ctx.textAlign = 'center'
    ctx.fillText(o.xLabel, pl + pw / 2, H - 9)
  }
  if (o.yLabel) {
    ctx.save()
    ctx.translate(10, pt + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText(o.yLabel, 0, 0)
    ctx.restore()
  }

  // ---- 绘图区（裁剪）----
  ctx.save()
  ctx.beginPath()
  ctx.rect(pl, pt, pw, ph)
  ctx.clip()

  const setDash = d => {
    if (ctx.setLineDash) ctx.setLineDash(d || [])
  }

  ;(o.bands || []).forEach(bd => {
    ctx.fillStyle = bd.color || 'rgba(37,99,235,0.08)'
    const y0 = toPxY(bd.y1)
    const y1 = toPxY(bd.y0)
    ctx.fillRect(pl, y0, pw, y1 - y0)
  })

  ;(o.hLines || []).forEach(l => {
    ctx.strokeStyle = l.color || THEME.axis
    ctx.lineWidth = l.width || 1
    setDash(l.dash || [4, 3])
    const y = toPxY(l.y)
    ctx.beginPath()
    ctx.moveTo(pl, y)
    ctx.lineTo(pl + pw, y)
    ctx.stroke()
  })
  ;(o.vLines || []).forEach(l => {
    ctx.strokeStyle = l.color || THEME.axis
    ctx.lineWidth = l.width || 1
    setDash(l.dash || [4, 3])
    const x = toPxX(l.x)
    ctx.beginPath()
    ctx.moveTo(x, pt)
    ctx.lineTo(x, pt + ph)
    ctx.stroke()
  })
  setDash([])

  series.forEach(s => {
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.width
    if (s.type === 'line') {
      setDash(s.dash || [])
      ctx.beginPath()
      let pen = false
      for (let i = 0; i < s.x.length; i++) {
        const x = s.x[i]
        const y = s.y[i]
        if (!isFinite(x) || !isFinite(y) || (xLog && x <= 0)) {
          pen = false
          continue
        }
        const px = clampPx(toPxX(x))
        const py = clampPx(toPxY(y))
        if (pen) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
        pen = true
      }
      ctx.stroke()
      setDash([])
    } else {
      const sz = s.size || 4
      for (let i = 0; i < s.x.length; i++) {
        if (!isFinite(s.x[i]) || !isFinite(s.y[i])) continue
        const px = toPxX(s.x[i])
        const py = toPxY(s.y[i])
        ctx.beginPath()
        if (s.marker === 'x') {
          ctx.moveTo(px - sz, py - sz)
          ctx.lineTo(px + sz, py + sz)
          ctx.moveTo(px + sz, py - sz)
          ctx.lineTo(px - sz, py + sz)
          ctx.stroke()
        } else if (s.marker === 'o') {
          ctx.fillStyle = THEME.bg
          ctx.arc(px, py, sz, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        } else {
          ctx.arc(px, py, sz, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  })

  ;(o.texts || []).forEach(t => {
    ctx.fillStyle = t.color || THEME.title
    ctx.font = (t.bold ? 'bold ' : '') + (t.size || 10) + 'px sans-serif'
    ctx.textAlign = t.align || 'left'
    ctx.fillText(t.text, toPxX(t.x) + (t.dx || 0), toPxY(t.y) + (t.dy || 0))
  })
  ctx.restore()

  // ---- 图例 ----
  const named = series.filter(s => s.name)
  if (named.length && o.legend !== false) {
    ctx.font = '10px sans-serif'
    let maxW = 0
    named.forEach(s => {
      maxW = Math.max(maxW, ctx.measureText(s.name).width)
    })
    const lw = maxW + 30
    const lh = named.length * 14 + 6
    const lx = o.legendLeft ? pl + 6 : pl + pw - lw - 6
    const ly = o.legendBottom ? pt + ph - lh - 6 : pt + 6
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(lx, ly, lw, lh)
    ctx.strokeStyle = THEME.frame
    ctx.strokeRect(lx, ly, lw, lh)
    ctx.textAlign = 'left'
    named.forEach((s, i) => {
      const y = ly + 10 + i * 14
      ctx.strokeStyle = s.color
      ctx.fillStyle = s.color
      ctx.lineWidth = 2
      if (s.type === 'line') {
        setDash(s.dash || [])
        ctx.beginPath()
        ctx.moveTo(lx + 6, y)
        ctx.lineTo(lx + 22, y)
        ctx.stroke()
        setDash([])
      } else {
        ctx.beginPath()
        ctx.arc(lx + 14, y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = THEME.title
      ctx.fillText(s.name, lx + 26, y)
    })
  }

  // ---- 读数光标 ----
  if (o.cursor !== undefined && o.cursor !== null && isFinite(o.cursor)) {
    const cx = Math.min(Math.max(o.cursor, xmin), xmax)
    const px = toPxX(cx)
    ctx.strokeStyle = THEME.cursor
    ctx.lineWidth = 1
    setDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(px, pt)
    ctx.lineTo(px, pt + ph)
    ctx.stroke()
    setDash([])
    const lines = []
    let xVal = cx
    series.forEach(s => {
      if (s.type !== 'line' || s.cursor === false || !s.x.length) return
      const i = bsearch(s.x, cx)
      xVal = s.x[i]
      const y = s.y[i]
      if (!isFinite(y)) return
      const py = toPxY(y)
      if (py >= pt && py <= pt + ph) {
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(toPxX(s.x[i]), py, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      lines.push({ color: s.color, text: (s.name || 'y') + ' = ' + F.fmt(y, 4) })
    })
    lines.unshift({ color: THEME.title, text: (o.xName || 'x') + ' = ' + F.fmt(xVal, 4) })
    ctx.font = '10px sans-serif'
    let bw = 0
    lines.forEach(l => {
      bw = Math.max(bw, ctx.measureText(l.text).width)
    })
    bw += 12
    const bh = lines.length * 13 + 6
    let bx = px + 8
    if (bx + bw > pl + pw) bx = px - 8 - bw
    const by = pt + ph - bh - 6
    ctx.fillStyle = 'rgba(17,24,39,0.82)'
    ctx.fillRect(bx, by, bw, bh)
    ctx.textAlign = 'left'
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#ffffff' : l.color === THEME.title ? '#fff' : lighten(l.color)
      ctx.fillText(l.text, bx + 6, by + 9 + i * 13)
    })
  }
  ctx.restore()

  return { toPxX, toPxY, toDataX, toDataY, plot: { l: pl, t: pt, w: pw, h: ph }, xmin, xmax, ymin, ymax }
}

// 在深色读数框上提亮曲线颜色
function lighten(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const v = parseInt(m[1], 16)
  const mix = c => Math.round(c + (255 - c) * 0.45)
  const r = mix((v >> 16) & 255)
  const g = mix((v >> 8) & 255)
  const bb = mix(v & 255)
  return 'rgb(' + r + ',' + g + ',' + bb + ')'
}

module.exports = { draw, PALETTE, niceStep, linTicks }
