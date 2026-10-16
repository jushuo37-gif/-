// 各页面的分析逻辑（纯函数，不依赖 wx，便于测试和网页预览）

const P = require('./poly')
const C = require('./complex')
const ctl = require('./control')
const { parsePoly } = require('./parse')
const { routh } = require('./routh')
const RL = require('./rlocus')
const F = require('./format')

const STAB_TEXT = { stable: '稳定', marginal: '临界稳定', unstable: '不稳定' }
const STAB_CLASS = { stable: 'ok', marginal: 'warn', unstable: 'bad' }

function parseNum(v, name, opts) {
  opts = opts || {}
  if (v === '' || v === undefined || v === null) {
    if (opts.optional) return null
    throw new Error(name + '不能为空')
  }
  const x = Number(v)
  if (!isFinite(x)) throw new Error(name + '必须是数字')
  if (opts.positive && x <= 0) throw new Error(name + '必须大于 0')
  if (opts.nonneg && x < 0) throw new Error(name + '不能为负')
  return x
}

function buildTF(numStr, denStr) {
  let num
  let den
  try {
    num = parsePoly(numStr)
  } catch (e) {
    throw new Error('分子：' + e.message)
  }
  try {
    den = parsePoly(denStr)
  } catch (e) {
    throw new Error('分母：' + e.message)
  }
  return ctl.makeTF(num, den)
}

function tfText(G) {
  return { num: F.polyStr(G.num.map(clean)), den: F.polyStr(G.den.map(clean)) }
}

function clean(v) {
  return Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10))
}

// ---------------- 时域响应 ----------------

const TF_PRESETS = [
  { name: '一阶惯性', num: '1', den: '2s+1' },
  { name: '二阶欠阻尼', num: '4', den: 's^2+1.2s+4' },
  { name: '三阶', num: '6', den: '(s+1)(s+2)(s+3)' },
  { name: '含零点', num: '2s+1', den: 's^2+s+1' },
  { name: '非最小相位', num: '-s+1', den: 's^2+2s+1' },
  { name: '积分', num: '1', den: 's(s+1)' }
]

function analyzeTF(input) {
  const G = buildTF(input.num, input.den)
  const type = input.type || 'step'
  const tEnd = parseNum(input.tEnd, '仿真时长', { optional: true, positive: true }) || ctl.autoTime(G)
  const ps = ctl.poles(G)
  const zs = ctl.zeros(G)
  const st = ps.length ? ctl.stability(ps) : 'stable'
  const dc = ctl.dcGain(G)
  const notes = []
  let r
  if (type === 'impulse') {
    r = ctl.impulse(G, tEnd)
    if (r.hasDirect) notes.push('系统含直通项 D，冲激响应中的 D·δ(t) 分量未画出')
  } else if (type === 'ramp') {
    r = ctl.ramp(G, tEnd)
  } else {
    r = ctl.step(G, tEnd)
  }
  const metrics = []
  const series = [{ x: r.t, y: r.y, name: '输出 y(t)', color: '#2563eb' }]
  const hLines = []
  const bands = []
  const pointSeries = []
  if (type === 'step') {
    if (st === 'stable') {
      const info = ctl.stepInfo(r.t, r.y, dc)
      metrics.push(
        { label: '稳态值', value: F.fmt(dc) },
        { label: '上升时间 tr', value: F.fmt(info.riseTime) + ' s' },
        { label: '峰值时间 tp', value: info.overshoot > 0.01 ? F.fmt(info.peakTime) + ' s' : '—' },
        { label: '超调量 σ%', value: F.fmt(info.overshoot, 3) + ' %' },
        { label: '调节时间 ts(2%)', value: isFinite(info.settlingTime) ? F.fmt(info.settlingTime) + ' s' : '超出仿真时长' },
        { label: '峰值', value: F.fmt(info.peak) }
      )
      if (info.undershoot > 0.5) metrics.push({ label: '反向下冲', value: F.fmt(info.undershoot, 3) + ' %' })
      if (Math.abs(dc) > 1e-12) {
        hLines.push({ y: dc, color: '#16a34a' })
        bands.push({ y0: dc - 0.02 * Math.abs(dc), y1: dc + 0.02 * Math.abs(dc), color: 'rgba(22,163,74,0.10)' })
      }
      if (info.overshoot > 0.01) pointSeries.push({ x: [info.peakTime], y: [info.peak], type: 'points', color: '#ea580c', size: 4 })
      if (isFinite(info.settlingTime) && info.settlingTime > 0) {
        const k = Math.min(r.t.length - 1, Math.round((info.settlingTime / tEnd) * (r.t.length - 1)))
        pointSeries.push({ x: [r.t[k]], y: [r.y[k]], type: 'points', color: '#16a34a', size: 4 })
      }
    } else {
      notes.push('系统' + STAB_TEXT[st] + '，不存在稳态值，未计算性能指标')
    }
    series.push({ x: [0, tEnd], y: [1, 1], name: '输入 1(t)', color: '#9ca3af', width: 1, dash: [4, 3], cursor: false })
  } else if (type === 'ramp') {
    series.push({ x: r.t, y: r.u, name: '输入 t', color: '#9ca3af', width: 1, dash: [4, 3] })
    if (st === 'stable') {
      const n = r.t.length - 1
      metrics.push({ label: '仿真终点误差 r−y', value: F.fmt(r.u[n] - r.y[n]) })
      metrics.push({ label: '稳态误差 lim(r−y)', value: F.fmt(essRamp(G)) })
    }
  }
  return {
    tf: tfText(G),
    poles: F.rootsStr(ps),
    zeros: F.rootsStr(zs),
    stability: STAB_TEXT[st],
    stabilityClass: STAB_CLASS[st],
    dcGain: F.fmt(dc),
    tEnd: F.fmt(tEnd),
    metrics,
    notes,
    chart: {
      title: type === 'impulse' ? '脉冲响应' : type === 'ramp' ? '斜坡响应' : '阶跃响应',
      xLabel: '时间 t / s',
      xName: 't',
      series: series.concat(pointSeries),
      hLines,
      bands,
      yIncludeZero: true,
      yClamp: st === 'unstable' ? [-1e6, 1e6] : null,
      legendBottom: type === 'impulse',
      cursorEnabled: true
    }
  }
}

// 斜坡输入下 r−y 的稳态值：lim s→0 (1−G(s))/s
function essRamp(G) {
  const diff = P.sub(G.den, G.num) // (den − num)/den
  const d0 = G.den[G.den.length - 1]
  const n = diff.length
  const c1 = n >= 2 ? diff[n - 2] : 0
  const c0 = diff[n - 1]
  if (Math.abs(c0) > 1e-12) return Infinity
  return c1 / d0
}

// ---------------- PID ----------------

const PID_PRESETS = [
  { name: '二阶对象', num: '1', den: '(s+1)(s+2)', Kp: 5, Ki: 3, Kd: 0.5 },
  { name: '三阶对象', num: '1', den: '(s+1)^3', Kp: 2, Ki: 0.8, Kd: 1 },
  { name: '直流电机', num: '2', den: 's(0.5s+1)', Kp: 3, Ki: 0, Kd: 0.2 },
  { name: '慢过程', num: '1', den: '(10s+1)(2s+1)', Kp: 4, Ki: 0.3, Kd: 4 }
]

function analyzePID(input) {
  const G = buildTF(input.num, input.den)
  const Kp = parseNum(input.Kp, 'Kp')
  const Ki = parseNum(input.Ki, 'Ki', { nonneg: true })
  const Kd = parseNum(input.Kd, 'Kd', { nonneg: true })
  const N = parseNum(input.N, '滤波系数 N', { optional: true, positive: true }) || 100
  const loop = ctl.pidLoop(G, Kp, Ki, Kd, N)
  const ps = ctl.poles(loop.T)
  const st = ctl.stability(ps)
  const tEnd = parseNum(input.tEnd, '仿真时长', { optional: true, positive: true }) || ctl.autoTime(loop.T)
  const r = ctl.step(loop.T, tEnd, 801)
  const u = loop.U ? ctl.step(loop.U, tEnd, 801) : null
  const metrics = []
  const series = [
    { x: r.t, y: r.y, name: '输出 y', color: '#2563eb' },
    { x: [0, tEnd], y: [1, 1], name: '设定值 r', color: '#9ca3af', width: 1, dash: [4, 3], cursor: false }
  ]
  if (st === 'stable') {
    const yf = ctl.dcGain(loop.T)
    const info = ctl.stepInfo(r.t, r.y, yf)
    const ei = ctl.errorIntegrals(r.t, r.y, 1)
    metrics.push(
      { label: '超调量 σ%', value: F.fmt(info.overshoot, 3) + ' %' },
      { label: '上升时间 tr', value: F.fmt(info.riseTime) + ' s' },
      { label: '调节时间 ts(2%)', value: isFinite(info.settlingTime) ? F.fmt(info.settlingTime) + ' s' : '超出仿真时长' },
      { label: '稳态误差 ess', value: F.fmt(1 - yf) },
      { label: 'IAE', value: F.fmt(ei.iae) },
      { label: 'ITAE', value: F.fmt(ei.itae) }
    )
    if (u) {
      let umax = 0
      u.y.forEach(v => {
        umax = Math.max(umax, Math.abs(v))
      })
      metrics.push({ label: '最大控制量 |u|', value: F.fmt(umax) })
    }
  }
  const Ct = tfText(loop.C)
  return {
    stability: STAB_TEXT[st],
    stabilityClass: STAB_CLASS[st],
    closedPoles: F.rootsStr(ps),
    controller: Ct,
    closedLoop: tfText(loop.T),
    metrics,
    tEnd,
    chartY: {
      title: '闭环阶跃响应',
      xLabel: '时间 t / s',
      xName: 't',
      series,
      yIncludeZero: true,
      yClamp: st === 'stable' ? null : [-3, 5],
      legendBottom: true,
      cursorEnabled: true
    },
    chartU: u
      ? {
          title: '控制量 u(t)',
          xLabel: '时间 t / s',
          xName: 't',
          series: [{ x: u.t, y: u.y, name: 'u', color: '#ea580c' }],
          yIncludeZero: true,
          yClamp: st === 'stable' ? null : [-50, 50],
          legend: false,
          cursorEnabled: true
        }
      : null
  }
}

// ---------------- 频域 ----------------

const BODE_PRESETS = [
  { name: 'K/s(s+1)(s+2)', num: '2', den: 's(s+1)(s+2)' },
  { name: '二阶振荡', num: '1', den: 's^2+0.4s+1' },
  { name: '超前校正', num: '10(0.5s+1)', den: 's(s+1)(0.05s+1)' },
  { name: '不稳定开环', num: '2', den: '(s-1)(s+3)' },
  { name: '惯性环节', num: '10', den: '(s+1)(0.1s+1)' }
]

function analyzeBode(input) {
  const G = buildTF(input.num, input.den)
  const wmin = parseNum(input.wmin, '最小频率', { optional: true, positive: true })
  const wmax = parseNum(input.wmax, '最大频率', { optional: true, positive: true })
  if (wmin && wmax && wmin >= wmax) throw new Error('最小频率必须小于最大频率')
  const bd = ctl.bode(G, wmin, wmax, 1000)
  const mg = ctl.margins(G, bd)
  const olp = ctl.poles(G)
  const rhpOpen = olp.filter(p => p.re > 1e-9).length
  const cl = ctl.feedback(G)
  const clst = ctl.stability(ctl.poles(cl))

  const metrics = [
    { label: '幅值裕度 GM', value: mg.gm ? F.fmt(mg.gm.gm, 4) + ' dB' : '∞' },
    { label: '相位穿越频率 ωg', value: mg.gm ? F.fmt(mg.gm.w) + ' rad/s' : '—' },
    { label: '相角裕度 PM', value: mg.pm ? F.fmt(mg.pm.pm, 4) + '°' : '∞' },
    { label: '截止频率 ωc', value: mg.pm ? F.fmt(mg.pm.w) + ' rad/s' : '—' },
    { label: '开环右半平面极点 P', value: String(rhpOpen) },
    { label: '单位负反馈闭环', value: STAB_TEXT[clst] }
  ]
  const notes = []
  if (rhpOpen > 0) notes.push('开环含右半平面极点，裕度指标不能直接判断闭环稳定性，请结合奈奎斯特判据（逆时针包围 (-1, j0) 点 P 圈才稳定）')
  if (mg.gainCrossovers.length > 1) notes.push('存在多个截止频率，表中给出相角裕度最小者')

  const vMag = []
  const vPh = []
  if (mg.pm) {
    vMag.push({ x: mg.pm.w, color: '#16a34a' })
    vPh.push({ x: mg.pm.w, color: '#16a34a' })
  }
  if (mg.gm) {
    vMag.push({ x: mg.gm.w, color: '#dc2626' })
    vPh.push({ x: mg.gm.w, color: '#dc2626' })
  }
  // 相位图上的 -180° 参考线（含 ±360° 平移）
  let phMin = Infinity
  let phMax = -Infinity
  bd.phase.forEach(v => {
    phMin = Math.min(phMin, v)
    phMax = Math.max(phMax, v)
  })
  const phLines = []
  for (let k = -3; k <= 3; k++) {
    const y = -180 + 360 * k
    if (y >= phMin - 30 && y <= phMax + 30) phLines.push({ y, color: '#dc2626' })
  }

  return {
    tf: tfText(G),
    metrics,
    notes,
    stability: STAB_TEXT[clst],
    stabilityClass: STAB_CLASS[clst],
    range: F.fmt(bd.w[0]) + ' ~ ' + F.fmt(bd.w[bd.w.length - 1]) + ' rad/s',
    chartMag: {
      title: '幅频特性 L(ω) / dB',
      xLog: true,
      xName: 'ω',
      xLabel: '频率 ω / (rad/s)',
      series: [{ x: bd.w, y: bd.mag, name: '|G|', color: '#2563eb' }],
      hLines: [{ y: 0, color: '#6b7280' }],
      vLines: vMag,
      legend: false,
      yClamp: [-400, 400],
      cursorEnabled: true
    },
    chartPhase: {
      title: '相频特性 φ(ω) / (°)',
      xLog: true,
      xName: 'ω',
      xLabel: '频率 ω / (rad/s)',
      series: [{ x: bd.w, y: bd.phase, name: '∠G', color: '#9333ea' }],
      hLines: phLines,
      vLines: vPh,
      legend: false,
      cursorEnabled: true
    },
    chartNyquist: nyquistChart(bd, olp)
  }
}

function nyquistChart(bd, olp) {
  const re = bd.resp.map(g => g.re)
  const im = bd.resp.map(g => g.im)
  // 虚轴上有开环极点时 |G| 会趋于无穷，只显示主要部分
  const onAxis = olp.some(p => Math.abs(p.re) < 1e-9)
  const mags = bd.resp.map(g => C.abs(g)).filter(isFinite).sort((a, b) => a - b)
  const cap = onAxis ? Math.max(2, (mags[Math.floor(mags.length * 0.8)] || 1) * 1.3) : Infinity
  let xmin = -1.5
  let xmax = 0.5
  let ymin = -1
  let ymax = 1
  for (let i = 0; i < re.length; i++) {
    if (Math.hypot(re[i], im[i]) > cap) continue
    xmin = Math.min(xmin, re[i])
    xmax = Math.max(xmax, re[i])
    ymin = Math.min(ymin, im[i], -im[i])
    ymax = Math.max(ymax, im[i], -im[i])
  }
  const px = (xmax - xmin) * 0.08
  const py = (ymax - ymin) * 0.08
  const circ = ctl.linspace(0, 2 * Math.PI, 121)
  return {
    title: '奈奎斯特图',
    equalAspect: true,
    xRange: [xmin - px, xmax + px],
    yRange: [ymin - py, ymax + py],
    series: [
      { x: circ.map(Math.cos), y: circ.map(Math.sin), color: '#d1d5db', width: 1, dash: [3, 3] },
      { x: re, y: im, name: 'ω > 0', color: '#2563eb' },
      { x: re, y: im.map(v => -v), name: 'ω < 0', color: '#93c5fd', dash: [5, 3] },
      { x: [-1], y: [0], type: 'points', marker: 'x', color: '#dc2626', size: 5 }
    ],
    legendLeft: true,
    xLabel: '实轴 Re'
  }
}

// ---------------- 根轨迹 ----------------

const RL_PRESETS = [
  { name: '1/s(s+1)(s+2)', num: '1', den: 's(s+1)(s+2)', K: 2 },
  { name: '含零点', num: 's+3', den: 's(s+1)(s+2)', K: 5 },
  { name: '复极点', num: 's+2', den: 's^2+2s+3', K: 1 },
  { name: '四阶', num: '1', den: 's(s+3)(s^2+2s+2)', K: 3 },
  { name: '双积分+超前', num: 's+1', den: 's^2(s+9)', K: 20 }
]

function analyzeRlocus(input) {
  const G = buildTF(input.num, input.den)
  if (ctl.poles(G).length === 0) throw new Error('分母至少为 1 阶')
  const kmax = parseNum(input.kmax, 'K 上限', { optional: true, positive: true })
  const rl = RL.rootLocus(G, { kmax })
  const fmtK = k => (isFinite(k) ? F.fmt(k) : '∞')
  const metrics = [
    { label: '开环极点 n', value: String(rl.n) + ' 个：' + F.rootsStr(rl.poles) },
    { label: '开环零点 m', value: String(rl.m) + ' 个：' + F.rootsStr(rl.zeros) }
  ]
  if (rl.centroid !== null) {
    metrics.push({ label: '渐近线', value: 'σa = ' + F.fmt(rl.centroid) + '，φa = ' + rl.asymAngles.map(a => F.fmt(a > 180 ? a - 360 : a) + '°').join('，') })
  }
  if (rl.breakaway.length) metrics.push({ label: '分离/会合点', value: rl.breakaway.map(b => 's = ' + F.fmt(b.s) + '（K = ' + F.fmt(b.K) + '）').join('；') })
  if (rl.crossings.length) metrics.push({ label: '与虚轴交点', value: rl.crossings.map(c => 'ω = ±' + F.fmt(c.w) + '（K = ' + F.fmt(c.K) + '）').join('；') })
  if (rl.departure.length) metrics.push({ label: '出射角', value: rl.departure.filter(d => d.at.im > 0).map(d => F.fmtC(d.at) + '：' + F.fmt(d.angle) + '°').join('；') })
  if (rl.arrival.length) metrics.push({ label: '入射角', value: rl.arrival.filter(d => d.at.im > 0).map(d => F.fmtC(d.at) + '：' + F.fmt(d.angle) + '°').join('；') })
  metrics.push({
    label: '闭环稳定的 K',
    value: rl.intervals.length ? rl.intervals.map(iv => fmtK(iv[0]) + ' < K < ' + fmtK(iv[1])).join(' 或 ') : '在扫描范围内均不稳定'
  })
  // 滑条的 K 范围（对数）
  let kTop = rl.kmax
  rl.crossings.forEach(c => {
    kTop = Math.max(kTop, c.K * 10)
  })
  const kLo = Math.log10(rl.kmin)
  const kHi = Math.log10(Math.min(kTop, rl.kmax))
  return { G, rl, metrics, tf: tfText(G), kLo, kHi }
}

function rlocusAtK(G, rl, K) {
  const cps = RL.closedPoles(G, K)
  const st = ctl.stability(cps)
  return {
    K: F.fmt(K),
    closedPoles: F.rootsStr(cps),
    stability: STAB_TEXT[st],
    stabilityClass: STAB_CLASS[st],
    chart: rlocusChart(rl, cps)
  }
}

function rlocusChart(rl, cps) {
  const series = []
  rl.branches.forEach((b, i) => {
    series.push({ x: b.map(r => r.re), y: b.map(r => r.im), color: ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4b5563'][i % 8], width: 2, noBounds: true })
  })
  const far = rl.R * 20
  if (rl.centroid !== null) {
    rl.asymAngles.forEach(a => {
      const t = (a * Math.PI) / 180
      series.push({ x: [rl.centroid, rl.centroid + far * Math.cos(t)], y: [0, far * Math.sin(t)], color: '#9ca3af', width: 1, dash: [4, 4], noBounds: true })
    })
  }
  series.push({ x: rl.poles.map(r => r.re), y: rl.poles.map(r => r.im), type: 'points', marker: 'x', color: '#111827', size: 5 })
  if (rl.zeros.length) series.push({ x: rl.zeros.map(r => r.re), y: rl.zeros.map(r => r.im), type: 'points', marker: 'o', color: '#111827', size: 4 })
  if (cps) series.push({ x: cps.map(r => r.re), y: cps.map(r => r.im), type: 'points', color: '#dc2626', size: 4 })

  // 视图：覆盖所有特征点
  const pts = rl.poles.concat(rl.zeros)
  if (rl.centroid !== null) pts.push(C.c(rl.centroid, 0))
  rl.crossings.forEach(c => pts.push(C.c(0, c.w), C.c(0, -c.w)))
  rl.breakaway.forEach(b => pts.push(C.c(b.s, 0)))
  let xmin = 0
  let xmax = 0
  let ymax = 0
  pts.forEach(p => {
    xmin = Math.min(xmin, p.re)
    xmax = Math.max(xmax, p.re)
    ymax = Math.max(ymax, Math.abs(p.im))
  })
  const span = Math.max(xmax - xmin, 2 * ymax, rl.R * 0.5, 1e-6)
  const m = span * 0.35
  return {
    title: '根轨迹（× 极点  ○ 零点  ● 当前 K 闭环极点）',
    equalAspect: true,
    xRange: [xmin - m, xmax + m],
    yRange: [-ymax - m, ymax + m],
    series,
    legend: false,
    xLabel: '实轴 σ'
  }
}

// ---------------- 劳斯判据 ----------------

const ROUTH_PRESETS = [
  { name: '稳定三阶', poly: 's^3+6s^2+11s+6' },
  { name: '两个右根', poly: 's^3+s^2+2s+8' },
  { name: '首元为零', poly: 's^4+s^3+2s^2+2s+3' },
  { name: '全零行', poly: 's^5+2s^4+24s^3+48s^2-25s-50' },
  { name: 's(s+1)(s+2)+K, K=6', poly: 's(s+1)(s+2)+6' }
]

function analyzeRouth(input) {
  let p
  try {
    p = parsePoly(input.poly)
  } catch (e) {
    throw new Error('特征多项式：' + e.message)
  }
  if (P.degree(p) < 1) throw new Error('特征多项式至少为 1 阶')
  const r = routh(p)
  const rows = r.rows.map((row, i) => {
    const cells = row.map((v, j) => (j === 0 && r.epsCells[i] ? 'ε' : F.fmt(v, 4)))
    // 去掉尾部多余的 0（保留至少一个）
    while (cells.length > 1 && cells[cells.length - 1] === '0') cells.pop()
    return {
      label: 's^' + (r.n - i),
      cells,
      neg: r.firstColumn[i] < 0,
      flag: r.flags[i] === 'aux' ? '辅助' : r.flags[i] === 'eps' ? 'ε' : ''
    }
  })
  let conclusion
  if (r.verdict === 'unstable') conclusion = '第一列符号改变 ' + r.signChanges + ' 次，有 ' + r.signChanges + ' 个右半平面根，系统不稳定'
  else if (r.verdict === 'marginal') conclusion = '第一列无符号改变，但存在 ' + r.axisRoots + ' 个虚轴上的根，系统临界稳定'
  else conclusion = '第一列全部同号，无右半平面根，系统稳定'
  return {
    polyText: F.polyStr(p.map(clean)),
    rows,
    conclusion,
    verdictClass: STAB_CLASS[r.verdict],
    verdict: STAB_TEXT[r.verdict],
    notes: r.notes,
    aux: r.auxPolys.map(a => ({ poly: F.polyStr(a.poly.map(clean)), roots: F.rootsStr(a.roots) })),
    roots: F.rootsStr(r.roots)
  }
}

// ---------------- 二阶系统 ----------------

function analyzeSecond(input) {
  const zeta = parseNum(input.zeta, '阻尼比 ζ', { nonneg: true })
  const wn = parseNum(input.wn, '自然频率 ωn', { positive: true })
  const compare = !!input.compare
  const G = ctl.makeTF([wn * wn], [1, 2 * zeta * wn, wn * wn])
  const tEnd = zeta > 0 ? ctl.niceCeil(Math.min(Math.max(8 / (Math.min(zeta, 1) * wn), 12 / wn), 60 / wn)) : ctl.niceCeil(30 / wn)
  const series = []
  if (compare) {
    ;[0.1, 0.3, 0.5, 0.707, 1, 2].forEach((z, i) => {
      const g = ctl.makeTF([wn * wn], [1, 2 * z * wn, wn * wn])
      const r = ctl.step(g, tEnd, 801)
      series.push({ x: r.t, y: r.y, name: 'ζ = ' + z, color: ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea'][i] })
    })
  }
  const r = ctl.step(G, tEnd, 1201)
  series.push({ x: r.t, y: r.y, name: '当前 ζ = ' + F.fmt(zeta, 3), color: '#111827', width: compare ? 2.5 : 2, dash: compare ? [6, 3] : [] })
  const info = ctl.stepInfo(r.t, r.y, 1)
  const rows = []
  if (zeta < 1 && zeta > 0) {
    const sq = Math.sqrt(1 - zeta * zeta)
    const wd = wn * sq
    const beta = Math.acos(zeta)
    rows.push(
      { label: '超调量 σ%', theory: F.fmt(100 * Math.exp((-zeta * Math.PI) / sq), 4) + ' %', sim: F.fmt(info.overshoot, 4) + ' %' },
      { label: '峰值时间 tp', theory: F.fmt(Math.PI / wd) + ' s', sim: F.fmt(info.peakTime) + ' s' },
      { label: '上升时间 tr(0→100%)', theory: F.fmt((Math.PI - beta) / wd) + ' s', sim: F.fmt(cross100(r)) + ' s' },
      { label: '调节时间 ts(2%)', theory: '≈ ' + F.fmt(4 / (zeta * wn)) + ' s', sim: isFinite(info.settlingTime) ? F.fmt(info.settlingTime) + ' s' : '—' },
      { label: '阻尼振荡频率 ωd', theory: F.fmt(wd) + ' rad/s', sim: '' }
    )
  } else if (zeta >= 1) {
    rows.push(
      { label: '超调量 σ%', theory: '0 %', sim: F.fmt(info.overshoot, 3) + ' %' },
      { label: '上升时间 tr(10→90%)', theory: '', sim: F.fmt(info.riseTime) + ' s' },
      { label: '调节时间 ts(2%)', theory: zeta === 1 ? '≈ ' + F.fmt(5.84 / wn) + ' s' : '', sim: isFinite(info.settlingTime) ? F.fmt(info.settlingTime) + ' s' : '—' }
    )
  } else {
    rows.push({ label: '无阻尼', theory: '等幅振荡 ω = ' + F.fmt(wn) + ' rad/s', sim: '' })
  }
  const ps = ctl.poles(G)
  const type = zeta === 0 ? '无阻尼' : zeta < 1 ? '欠阻尼' : zeta === 1 ? '临界阻尼' : '过阻尼'
  // 极点图
  const R = wn * 1.25
  const circ = ctl.linspace(Math.PI / 2, (3 * Math.PI) / 2, 61)
  const pole = {
    title: 's 平面极点',
    equalAspect: true,
    xRange: [-Math.max(R, Math.max.apply(null, ps.map(p => -p.re)) * 1.15), R * 0.35],
    yRange: [-R, R],
    series: [
      { x: circ.map(t => wn * Math.cos(t)), y: circ.map(t => wn * Math.sin(t)), color: '#d1d5db', width: 1, dash: [3, 3] },
      { x: ps.map(p => p.re), y: ps.map(p => p.im), type: 'points', marker: 'x', color: '#dc2626', size: 5 }
    ],
    legend: false
  }
  if (zeta > 0 && zeta < 1) {
    const p = ps.find(q => q.im > 0)
    pole.series.push({ x: [0, p.re], y: [0, p.im], color: '#9ca3af', width: 1, dash: [3, 3] })
  }
  return {
    tf: { num: F.fmt(wn * wn), den: F.polyStr([1, clean(2 * zeta * wn), clean(wn * wn)]) },
    type,
    poles: F.rootsStr(ps),
    rows,
    chart: {
      title: '单位阶跃响应',
      xLabel: '时间 t / s',
      xName: 't',
      series,
      hLines: [{ y: 1, color: '#9ca3af' }],
      bands: [{ y0: 0.98, y1: 1.02, color: 'rgba(22,163,74,0.10)' }],
      yIncludeZero: true,
      cursorEnabled: true,
      legend: compare
    },
    poleChart: pole
  }
}

function cross100(r) {
  for (let k = 1; k < r.y.length; k++) {
    if (r.y[k] >= 1 && r.y[k - 1] < 1) return r.t[k - 1] + ((1 - r.y[k - 1]) / (r.y[k] - r.y[k - 1])) * (r.t[k] - r.t[k - 1])
  }
  return NaN
}

module.exports = {
  TF_PRESETS,
  PID_PRESETS,
  BODE_PRESETS,
  RL_PRESETS,
  ROUTH_PRESETS,
  analyzeTF,
  analyzePID,
  analyzeBode,
  analyzeRlocus,
  rlocusAtK,
  analyzeRouth,
  analyzeSecond
}
