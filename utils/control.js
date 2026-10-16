// 控制系统核心算法：传递函数、时域仿真、性能指标、频域分析

const P = require('./poly')
const C = require('./complex')
const L = require('./linalg')

// ---------- 传递函数 ----------

function makeTF(num, den) {
  num = P.trim(num)
  den = P.trim(den)
  if (P.isZero(den)) throw new Error('分母不能为 0')
  if (num.length > den.length) throw new Error('分子阶次高于分母，系统非正则，无法仿真')
  const k = den[0]
  return { num: num.map(v => v / k), den: den.map(v => v / k) }
}

function series(G1, G2) {
  return cancelOrigin({ num: P.mul(G1.num, G2.num), den: P.mul(G1.den, G2.den) })
}

// 闭环：G / (1 + G H)（负反馈）
function feedback(G, H) {
  H = H || { num: [1], den: [1] }
  const num = P.mul(G.num, H.den)
  const den = P.add(P.mul(G.den, H.den), P.mul(G.num, H.num))
  return makeTF(num, den)
}

// 约去分子分母公共的 s 因子（原点零极点对消）
function cancelOrigin(G) {
  let num = P.trim(G.num)
  let den = P.trim(G.den)
  while (num.length > 1 && den.length > 1 && num[num.length - 1] === 0 && den[den.length - 1] === 0) {
    num = num.slice(0, -1)
    den = den.slice(0, -1)
  }
  return makeTF(num, den)
}

function poles(G) {
  return P.roots(G.den)
}

function zeros(G) {
  return P.roots(G.num)
}

function dcGain(G) {
  const n0 = G.num[G.num.length - 1]
  const d0 = G.den[G.den.length - 1]
  if (Math.abs(d0) < 1e-14) return n0 === 0 ? NaN : Infinity
  return n0 / d0
}

// 稳定性判断：'stable' | 'marginal' | 'unstable'
function stability(ps) {
  let marginal = false
  for (let i = 0; i < ps.length; i++) {
    const tol = 1e-9 * Math.max(1, C.abs(ps[i]))
    if (ps[i].re > tol) return 'unstable'
    if (ps[i].re > -tol) marginal = true
  }
  if (marginal) {
    // 虚轴上的重根视为不稳定
    const onAxis = ps.filter(p => Math.abs(p.re) <= 1e-9 * Math.max(1, C.abs(p)))
    for (let i = 0; i < onAxis.length; i++) {
      for (let j = i + 1; j < onAxis.length; j++) {
        if (C.abs(C.sub(onAxis[i], onAxis[j])) < 1e-6 * Math.max(1, C.abs(onAxis[i]))) return 'unstable'
      }
    }
    return 'marginal'
  }
  return 'stable'
}

// ---------- 状态空间与仿真 ----------

// 可控标准型实现
function tfToSS(G) {
  const den = G.den
  const n = den.length - 1
  const num = new Array(n + 1 - G.num.length).fill(0).concat(G.num)
  const b0 = num[0]
  const A = L.zeros(n, n)
  for (let i = 0; i < n - 1; i++) A[i][i + 1] = 1
  for (let j = 0; j < n; j++) A[n - 1][j] = -den[n - j]
  const B = new Array(n).fill(0)
  if (n > 0) B[n - 1] = 1
  const Cv = []
  for (let j = 0; j < n; j++) Cv.push(num[n - j] - den[n - j] * b0)
  return { A, B, C: Cv, D: b0, n }
}

// 零阶保持离散化：x[k+1] = Phi x[k] + Gam u[k]
function discretize(ss, dt) {
  const n = ss.n
  const M = L.zeros(n + 1, n + 1)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = ss.A[i][j] * dt
    M[i][n] = ss.B[i] * dt
  }
  const E = L.expm(M)
  const Phi = E.slice(0, n).map(row => row.slice(0, n))
  const Gam = E.slice(0, n).map(row => row[n])
  return { Phi, Gam }
}

// 对任意输入序列仿真（输入在每个采样区间内保持常值）
function lsim(G, u, dt, x0) {
  const ss = tfToSS(G)
  const n = ss.n
  const N = u.length
  const y = new Array(N)
  if (n === 0) {
    for (let k = 0; k < N; k++) y[k] = ss.D * u[k]
    return y
  }
  const d = discretize(ss, dt)
  let x = x0 ? x0.slice() : new Array(n).fill(0)
  for (let k = 0; k < N; k++) {
    let yk = ss.D * u[k]
    for (let i = 0; i < n; i++) yk += ss.C[i] * x[i]
    y[k] = yk
    const xn = new Array(n)
    for (let i = 0; i < n; i++) {
      let s = d.Gam[i] * u[k]
      const row = d.Phi[i]
      for (let j = 0; j < n; j++) s += row[j] * x[j]
      xn[i] = s
    }
    x = xn
  }
  return y
}

function linspace(a, b, n) {
  if (n <= 1) return [a]
  const r = new Array(n)
  for (let i = 0; i < n; i++) r[i] = a + ((b - a) * i) / (n - 1)
  return r
}

function logspace(a, b, n) {
  return linspace(a, b, n).map(v => Math.pow(10, v))
}

function niceCeil(x) {
  const e = Math.pow(10, Math.floor(Math.log10(x)))
  const f = x / e
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  let nice = 10
  for (let i = 0; i < steps.length; i++) {
    if (f <= steps[i] + 1e-9) {
      nice = steps[i]
      break
    }
  }
  return nice * e
}

// 根据极点自动选择仿真时长
function autoTime(G) {
  const ps = poles(G)
  if (ps.length === 0) return 10
  const st = stability(ps)
  let T
  if (st === 'stable') {
    let slow = Infinity
    ps.forEach(p => {
      slow = Math.min(slow, -p.re)
    })
    T = 6 / slow
    // 至少覆盖几个最慢振荡周期
    ps.forEach(p => {
      if (Math.abs(p.im) > 1e-9) T = Math.max(T, Math.min(3 * (2 * Math.PI) / Math.abs(p.im), 20 / -p.re))
    })
  } else if (st === 'unstable') {
    let maxRe = 0
    ps.forEach(p => {
      maxRe = Math.max(maxRe, p.re)
    })
    T = maxRe > 1e-9 ? Math.min(10, 4 / maxRe) : 10
  } else {
    let minMag = Infinity
    ps.forEach(p => {
      const m = C.abs(p)
      if (m > 1e-9) minMag = Math.min(minMag, m)
    })
    T = isFinite(minMag) ? 25 / minMag : 10
  }
  T = Math.min(Math.max(T, 1e-3), 1e5)
  return niceCeil(T)
}

const DEFAULT_POINTS = 1201

// 阶跃响应
function step(G, tEnd, N) {
  N = N || DEFAULT_POINTS
  tEnd = tEnd || autoTime(G)
  const t = linspace(0, tEnd, N)
  const u = new Array(N).fill(1)
  return { t, y: lsim(G, u, tEnd / (N - 1)), u }
}

// 斜坡响应：等价于 G(s)/s 的阶跃响应
function ramp(G, tEnd, N) {
  N = N || DEFAULT_POINTS
  tEnd = tEnd || autoTime(G)
  const Gi = makeTF(G.num, P.mul(G.den, [1, 0]))
  const r = step(Gi, tEnd, N)
  return { t: r.t, y: r.y, u: r.t.slice() }
}

// 脉冲响应：y = C e^{At} B（直通项 D·δ(t) 不绘出）
function impulse(G, tEnd, N) {
  N = N || DEFAULT_POINTS
  tEnd = tEnd || autoTime(G)
  const ss = tfToSS(G)
  const t = linspace(0, tEnd, N)
  const y = ss.n > 0 ? lsim(G, new Array(N).fill(0), tEnd / (N - 1), ss.B) : new Array(N).fill(0)
  return { t, y, hasDirect: Math.abs(ss.D) > 1e-14 }
}

// 阶跃响应性能指标
function stepInfo(t, y, yFinal, opts) {
  opts = opts || {}
  const band = opts.band || 0.02
  const info = {
    finalValue: yFinal,
    riseTime: NaN,
    peakTime: NaN,
    peak: NaN,
    overshoot: NaN,
    settlingTime: NaN,
    undershoot: NaN
  }
  if (!isFinite(yFinal) || Math.abs(yFinal) < 1e-12) return info
  const N = y.length
  const yn = y.map(v => v / yFinal)
  // 峰值
  let pk = 0
  for (let k = 1; k < N; k++) if (yn[k] > yn[pk]) pk = k
  info.peak = y[pk]
  info.peakTime = t[pk]
  info.overshoot = Math.max(0, (yn[pk] - 1) * 100)
  let mn = 0
  for (let k = 0; k < N; k++) mn = Math.min(mn, yn[k])
  info.undershoot = -mn * 100
  // 上升时间 10% → 90%
  const cross = level => {
    for (let k = 1; k < N; k++) {
      if (yn[k] >= level && yn[k - 1] < level) {
        return t[k - 1] + ((level - yn[k - 1]) / (yn[k] - yn[k - 1])) * (t[k] - t[k - 1])
      }
    }
    return NaN
  }
  const t10 = cross(0.1)
  const t90 = cross(0.9)
  info.riseTime = t90 - t10
  // 调节时间（误差带）
  let last = -1
  for (let k = N - 1; k >= 0; k--) {
    if (Math.abs(yn[k] - 1) > band) {
      last = k
      break
    }
  }
  if (last === -1) info.settlingTime = 0
  else if (last === N - 1) info.settlingTime = NaN
  else {
    const k = last
    const e0 = Math.abs(yn[k] - 1)
    const e1 = Math.abs(yn[k + 1] - 1)
    info.settlingTime = t[k] + ((e0 - band) / (e0 - e1 || 1)) * (t[k + 1] - t[k])
  }
  return info
}

// ---------- PID ----------

// C(s) = Kp + Ki/s + Kd·N·s/(s+N)
function pid(Kp, Ki, Kd, N) {
  N = N || 100
  let num
  let den
  if (Kd === 0 && Ki === 0) {
    num = [Kp]
    den = [1]
  } else if (Kd === 0) {
    num = [Kp, Ki]
    den = [1, 0]
  } else if (Ki === 0) {
    num = P.add(P.scale([1, N], Kp), [Kd * N, 0])
    den = [1, N]
  } else {
    num = P.add(P.add(P.scale([1, N, 0], Kp), P.scale([1, N], Ki)), [Kd * N, 0, 0])
    den = [1, N, 0]
  }
  if (P.isZero(num)) num = [0]
  return makeTF(num, den)
}

// 单位负反馈 PID 闭环：返回 Y/R 与 U/R
function pidLoop(G, Kp, Ki, Kd, N) {
  const Cs = pid(Kp, Ki, Kd, N)
  const L0 = { num: P.mul(Cs.num, G.num), den: P.mul(Cs.den, G.den) }
  const T = cancelOrigin(makeTF(L0.num, P.add(L0.den, L0.num)))
  // U/R = C / (1 + C G) = C·Gd·... = Cn·Gd / (Cd·Gd + Cn·Gn)
  const Unum = P.mul(Cs.num, G.den)
  const Uden = P.add(L0.den, L0.num)
  let U = null
  if (Unum.length <= Uden.length) U = cancelOrigin(makeTF(Unum, Uden))
  return { C: Cs, T, U, open: L0 }
}

// 误差积分指标
function errorIntegrals(t, y, r) {
  let iae = 0
  let ise = 0
  let itae = 0
  for (let k = 1; k < t.length; k++) {
    const dt = t[k] - t[k - 1]
    const e0 = r - y[k - 1]
    const e1 = r - y[k]
    iae += 0.5 * (Math.abs(e0) + Math.abs(e1)) * dt
    ise += 0.5 * (e0 * e0 + e1 * e1) * dt
    itae += 0.5 * (t[k - 1] * Math.abs(e0) + t[k] * Math.abs(e1)) * dt
  }
  return { iae, ise, itae }
}

// ---------- 频域 ----------

function freqResp(G, w) {
  const s = C.c(0, w)
  return C.div(P.evalComplex(G.num, s), P.evalComplex(G.den, s))
}

function autoFreqRange(G) {
  const mags = []
  poles(G)
    .concat(zeros(G))
    .forEach(r => {
      const m = C.abs(r)
      if (m > 1e-9) mags.push(m)
    })
  if (mags.length === 0) return [0.01, 100]
  let lo = Math.floor(Math.log10(Math.min.apply(null, mags))) - 1
  let hi = Math.ceil(Math.log10(Math.max.apply(null, mags))) + 1
  if (hi - lo < 3) {
    lo -= 1
    hi += 1
  }
  if (hi - lo > 12) lo = hi - 12
  return [Math.pow(10, lo), Math.pow(10, hi)]
}

// 相位展开
function unwrapDeg(ph) {
  const r = ph.slice()
  for (let i = 1; i < r.length; i++) {
    let d = r[i] - r[i - 1]
    while (d > 180) {
      r[i] -= 360
      d -= 360
    }
    while (d < -180) {
      r[i] += 360
      d += 360
    }
  }
  return r
}

function bode(G, wmin, wmax, N) {
  N = N || 800
  if (!wmin || !wmax) {
    const rg = autoFreqRange(G)
    wmin = wmin || rg[0]
    wmax = wmax || rg[1]
  }
  const w = logspace(Math.log10(wmin), Math.log10(wmax), N)
  const zs = zeros(G)
  const ps = poles(G)
  const k = G.num[0] / G.den[0]
  const k0 = k < 0 ? -180 : 0
  const deg = 180 / Math.PI
  const mag = []
  const phase = []
  const resp = []
  for (let i = 0; i < N; i++) {
    const g = freqResp(G, w[i])
    resp.push(g)
    mag.push(20 * Math.log10(C.abs(g)))
    // 由零极点逐项累加得到连续相位
    let ph = k0
    zs.forEach(z => {
      ph += Math.atan2(w[i] - z.im, -z.re) * deg
    })
    ps.forEach(p => {
      ph -= Math.atan2(w[i] - p.im, -p.re) * deg
    })
    phase.push(ph)
  }
  return { w, mag, phase: unwrapDeg(phase), resp }
}

function interpLog(w0, w1, v0, v1, target) {
  const f = (target - v0) / (v1 - v0)
  return Math.pow(10, Math.log10(w0) + f * (Math.log10(w1) - Math.log10(w0)))
}

function interpAt(w, v, wq) {
  for (let i = 1; i < w.length; i++) {
    if (w[i] >= wq) {
      const f = (Math.log10(wq) - Math.log10(w[i - 1])) / (Math.log10(w[i]) - Math.log10(w[i - 1]))
      return v[i - 1] + f * (v[i] - v[i - 1])
    }
  }
  return v[v.length - 1]
}

function wrap180(x) {
  let r = ((x % 360) + 360) % 360
  if (r > 180) r -= 360
  return r
}

// 幅值裕度与相角裕度
function margins(G, bd) {
  const gc = []
  const pc = []
  const { w, mag, phase } = bd
  for (let i = 1; i < w.length; i++) {
    if ((mag[i - 1] > 0) !== (mag[i] > 0) && isFinite(mag[i]) && isFinite(mag[i - 1])) {
      // 在 log w 上二分细化 |G| = 1
      let a = Math.log10(w[i - 1])
      let b = Math.log10(w[i])
      const fa = mag[i - 1]
      for (let it = 0; it < 60; it++) {
        const m = 0.5 * (a + b)
        const fm = 20 * Math.log10(C.abs(freqResp(G, Math.pow(10, m))))
        if ((fm > 0) === (fa > 0)) a = m
        else b = m
      }
      const wc = Math.pow(10, 0.5 * (a + b))
      const ph = interpAt(w, phase, wc)
      gc.push({ w: wc, phase: ph, pm: wrap180(180 + ph) })
    }
    const k0 = Math.floor((phase[i - 1] + 180) / 360)
    const k1 = Math.floor((phase[i] + 180) / 360)
    if (k0 !== k1) {
      const level = -180 + 360 * Math.max(k0, k1)
      const wp = interpLog(w[i - 1], w[i], phase[i - 1], phase[i], level)
      const m = 20 * Math.log10(C.abs(freqResp(G, wp)))
      pc.push({ w: wp, mag: m, gm: -m })
    }
  }
  let pm = null
  gc.forEach(g => {
    if (!pm || g.pm < pm.pm) pm = g
  })
  let gm = null
  pc.forEach(p => {
    if (!gm || Math.abs(p.gm) < Math.abs(gm.gm)) gm = p
  })
  return { gainCrossovers: gc, phaseCrossovers: pc, pm, gm }
}

module.exports = {
  makeTF,
  series,
  feedback,
  cancelOrigin,
  poles,
  zeros,
  dcGain,
  stability,
  tfToSS,
  discretize,
  lsim,
  linspace,
  logspace,
  autoTime,
  niceCeil,
  step,
  ramp,
  impulse,
  stepInfo,
  pid,
  pidLoop,
  errorIntegrals,
  freqResp,
  autoFreqRange,
  bode,
  margins,
  unwrapDeg,
  wrap180
}
