// 频率法串联校正设计：超前、滞后、滞后-超前
// 教材做法是先估一个补偿角 Δ 再验算；这里把“校正后的相角裕度”写成截止频率 ωc 的精确函数后直接求根，
// 设计结果一步满足指标，最后再用完整的 Bode 图与裕度计算复核。

const P = require('./poly')
const C = require('./complex')
const ctl = require('./control')

const DEG = 180 / Math.PI
const LAG_RATIO = 10 // 滞后零点取在 ωc / 10 处
const LEAD_A_MAX = 20 // 单级超前 a 的上限（φm ≈ 64.8°）
const PHI_MAX = Math.asin((LEAD_A_MAX - 1) / (LEAD_A_MAX + 1)) * DEG

// 系统型别 ν 与 lim s→0 s^ν G(s)
function typeAndGain(G) {
  let den = P.trim(G.den)
  const num = P.trim(G.num)
  let nu = 0
  while (den.length > 1 && den[den.length - 1] === 0) {
    den = den.slice(0, -1)
    nu++
  }
  return { nu, k0: num[num.length - 1] / den[den.length - 1] }
}

// 带零极点信息的开环，便于逐点求幅值与连续相位（与 ctl.bode 的相位约定一致）
function prepare(G) {
  const k = G.num[0] / G.den[0]
  return { num: G.num, den: G.den, zs: ctl.zeros(G), ps: ctl.poles(G), k0: k < 0 ? -180 : 0 }
}

function evalAt(sys, w) {
  let ph = sys.k0
  sys.zs.forEach(z => {
    ph += Math.atan2(w - z.im, -z.re) * DEG
  })
  sys.ps.forEach(p => {
    ph -= Math.atan2(w - p.im, -p.re) * DEG
  })
  return { mag: C.abs(ctl.freqResp(sys, w)), ph }
}

// (αTs + 1)/(Ts + 1)
function firstOrder(alpha, T) {
  return { num: [alpha * T, 1], den: [T, 1] }
}

// 超前：令 ωm = ωc，a 由 |G(jωc)|·√a = 1 确定
function leadAt(sys, wc) {
  const g = evalAt(sys, wc)
  const a = 1 / (g.mag * g.mag)
  const phim = Math.asin((a - 1) / (a + 1)) * DEG
  return { wc, a, T: 1 / (wc * Math.sqrt(a)), phim, magDb: 20 * Math.log10(g.mag), ph: g.ph, pm: 180 + g.ph + phim }
}

// 滞后：零点 ωz = ωc/10，b 由 |G(jωc)|·|Gc(jωc)| = 1 精确确定（不用 |Gc| ≈ b 的近似）
function lagAt(sys, wc, extraMag, extraPh) {
  const g = evalAt(sys, wc)
  const m = g.mag * (extraMag || 1)
  const r = LAG_RATIO
  const q = m * m * (1 + r * r) - 1
  const b = q > 0 ? r / Math.sqrt(q) : Infinity
  const wz = wc / r
  const phLag = (Math.atan(r) - Math.atan(r / b)) * DEG
  return { wc, b, T: 1 / (b * wz), wz, phLag, magDb: 20 * Math.log10(g.mag), ph: g.ph, pm: 180 + g.ph + (extraPh || 0) + phLag }
}

// 在 [w0, w1]（对数）上找 f 的第一个变号点并二分细化；w1 < w0 表示从高频往低频找
function firstRoot(f, w0, w1, n) {
  n = n || 600
  const l0 = Math.log10(w0)
  const l1 = Math.log10(w1)
  let xa = l0
  let fa = f(Math.pow(10, xa))
  for (let i = 1; i <= n; i++) {
    const xb = l0 + ((l1 - l0) * i) / n
    const fb = f(Math.pow(10, xb))
    if (isFinite(fa) && isFinite(fb) && fa < 0 !== fb < 0) {
      let a = xa
      let b = xb
      for (let it = 0; it < 80; it++) {
        const m = 0.5 * (a + b)
        if (f(Math.pow(10, m)) < 0 === fa < 0) a = m
        else b = m
      }
      return Math.pow(10, 0.5 * (a + b))
    }
    xa = xb
    fa = fb
  }
  return null
}

function designLead(sys, wc0, pmReq, wcReq) {
  let r
  if (wcReq) {
    if (wcReq <= wc0) return { ok: false, reason: '超前校正会提高截止频率，指定的 ωc 应大于未校正的 ωc0 = ' + fmt(wc0) }
    r = leadAt(sys, wcReq)
  } else {
    const wc = firstRoot(w => leadAt(sys, w).pm - pmReq, wc0, wc0 * 1e4)
    if (!wc) return { ok: false, reason: '单级超前无法达到要求的相角裕度（截止频率附近相位下降过快）' }
    r = leadAt(sys, wc)
  }
  if (r.a > LEAD_A_MAX) return { ok: false, reason: '所需超前角 φm = ' + fmt(r.phim) + '° 过大（a = ' + fmt(r.a) + ' > ' + LEAD_A_MAX + '），单级超前难以实现', lead: r }
  const ok = r.pm >= pmReq - 0.5
  return { ok, method: 'lead', wc: r.wc, lead: r, stages: [firstOrder(r.a, r.T)], reason: ok ? '' : '在 ωc = ' + fmt(r.wc) + ' 处超前后相角裕度仅 ' + fmt(r.pm) + '°' }
}

function designLag(sys, wc0, pmReq, wcReq) {
  let r
  if (wcReq) {
    if (wcReq >= wc0) return { ok: false, reason: '滞后校正会降低截止频率，指定的 ωc 应小于未校正的 ωc0 = ' + fmt(wc0) }
    r = lagAt(sys, wcReq)
  } else {
    const wc = firstRoot(w => lagAt(sys, w).pm - pmReq, wc0, wc0 * 1e-5)
    if (!wc) return { ok: false, reason: '低频段相位裕量也不足，单纯滞后校正无法满足要求' }
    r = lagAt(sys, wc)
  }
  const ok = r.pm >= pmReq - 0.5
  return { ok, method: 'lag', wc: r.wc, lag: r, stages: [firstOrder(r.b, r.T)], reason: ok ? '' : '在 ωc = ' + fmt(r.wc) + ' 处滞后后相角裕度仅 ' + fmt(r.pm) + '°' }
}

// 滞后-超前：超前段在 ωc 处提供相角，滞后段把 ωc 处的幅值压到 0 dB；两者耦合，用不动点迭代
function designLagLead(sys, wc, pmReq) {
  const g = evalAt(sys, wc)
  let phLag = -5
  let lead
  let lag
  for (let it = 0; it < 60; it++) {
    const phim = pmReq - (180 + g.ph) - phLag
    if (phim >= 89) return { ok: false, reason: '在 ωc = ' + fmt(wc) + ' 处所需超前角超过 90°，请降低 ωc 或相角裕度要求' }
    if (phim <= 0) return null // 不需要超前
    const s = Math.sin(phim / DEG)
    const a = (1 + s) / (1 - s)
    lead = { wc, a, T: 1 / (wc * Math.sqrt(a)), phim, magDb: 20 * Math.log10(g.mag), ph: g.ph }
    lag = lagAt(sys, wc, Math.sqrt(a), phim)
    if (!isFinite(lag.b) || lag.b >= 1) {
      // 超前段的增益已足够把 ωc 处压到 0 dB 以下：直接按超前设计
      const r = leadAt(sys, wc)
      if (r.a < 1) return null
      return { ok: r.pm >= pmReq - 0.5 && r.a <= LEAD_A_MAX, method: 'lead', wc, lead: r, stages: [firstOrder(r.a, r.T)] }
    }
    if (Math.abs(lag.phLag - phLag) < 1e-10) break
    phLag = lag.phLag
  }
  lead.pm = lag.pm
  const ok = lead.a <= LEAD_A_MAX * 1.5 && lag.pm >= pmReq - 0.5
  return { ok, method: 'laglead', wc, lead, lag, stages: [firstOrder(lead.a, lead.T), firstOrder(lag.b, lag.T)], reason: lead.a > LEAD_A_MAX * 1.5 ? '超前段 a = ' + fmt(lead.a) + ' 过大' : '' }
}

// 滞后-超前的默认截止频率：取未校正系统的相位穿越频率 ωg（∠G = −180°）；
// 没有相位穿越（如 Ⅱ 型系统相位始终低于 −180°）时，取让超前段约提供 50° 的频率
function defaultLagLeadWc(sys, wc0, pmReq) {
  const wg = firstRoot(w => evalAt(sys, w).ph + 180, wc0 * 1e-4, wc0 * 1e4, 1200)
  if (wg) return wg
  return firstRoot(w => evalAt(sys, w).ph + 180 - (pmReq - 50), wc0 * 1e4, wc0 * 1e-4, 1200)
}

function fmt(x) {
  return String(Number(x.toPrecision(4)))
}

// 主入口
// opts: { pm: 相角裕度要求(°), wc: 期望截止频率(可选), method: 'auto' | 'lead' | 'lag' | 'laglead' }
function design(L, opts) {
  const pmReq = opts.pm
  const sys = prepare(L)
  const bd0 = ctl.bode(L, null, null, 1200)
  const mg0 = ctl.margins(L, bd0)
  const method = opts.method || 'auto'
  const base = { sys, mg0, tried: [] }
  if (!mg0.pm) {
    const g = evalAt(sys, bd0.w[0])
    if (g.mag < 1) return Object.assign(base, { ok: true, method: 'none', stages: [], reason: '开环幅值始终小于 1，无截止频率，无需校正' })
    throw new Error('在自动频率范围内找不到截止频率，无法设计')
  }
  const wc0 = mg0.pm.w
  const wcReq = opts.wc || null

  const tryOne = m => {
    let r
    if (m === 'lead') r = designLead(sys, wc0, pmReq, wcReq)
    else if (m === 'lag') r = designLag(sys, wc0, pmReq, wcReq)
    else {
      const wc = wcReq || defaultLagLeadWc(sys, wc0, pmReq)
      if (!wc) r = { ok: false, reason: '找不到合适的截止频率，请手动给出期望 ωc' }
      else r = designLagLead(sys, wc, pmReq) || designLag(sys, wc0, pmReq, wc < wc0 ? wc : null)
    }
    base.tried.push({ method: m, ok: r.ok, reason: r.reason || '' })
    return r
  }

  let r
  if (method !== 'auto') r = tryOne(method)
  else if (!wcReq && mg0.pm.pm >= pmReq) r = { ok: true, method: 'none', stages: [], reason: '未校正系统已满足相角裕度要求' }
  else {
    const order = wcReq ? (wcReq > wc0 ? ['lead', 'laglead'] : ['lag', 'laglead']) : ['lead', 'lag', 'laglead']
    for (let i = 0; i < order.length; i++) {
      r = tryOne(order[i])
      if (r.ok) break
    }
  }
  if (!r.stages) return Object.assign(base, r, { ok: false, stages: [] })

  // 合成校正装置并复核
  let Gc = { num: [1], den: [1] }
  r.stages.forEach(s => {
    Gc = { num: P.mul(Gc.num, s.num), den: P.mul(Gc.den, s.den) }
  })
  const Lc = { num: P.mul(L.num, Gc.num), den: P.mul(L.den, Gc.den) }
  return Object.assign(base, r, { Gc: ctl.makeTF(Gc.num, Gc.den), Lc: ctl.makeTF(Lc.num, Lc.den), wc0 })
}

module.exports = { design, typeAndGain, prepare, evalAt, leadAt, lagAt, LAG_RATIO, LEAD_A_MAX, PHI_MAX }
