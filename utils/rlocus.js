// 根轨迹：闭环特征方程 D(s) + K·N(s) = 0，K ≥ 0

const P = require('./poly')
const C = require('./complex')
const ctl = require('./control')

function charPoly(G, K) {
  return P.add(G.den, P.scale(G.num, K))
}

function closedPoles(G, K) {
  return P.roots(charPoly(G, K))
}

function maxRe(rs) {
  let m = -Infinity
  rs.forEach(r => {
    m = Math.max(m, r.re)
  })
  return m
}

// 贪心匹配：让新的一组根尽量接续上一组
function match(prev, next, R) {
  const pairs = []
  for (let i = 0; i < prev.length; i++) {
    for (let j = 0; j < next.length; j++) pairs.push([C.abs(C.sub(prev[i], next[j])), i, j])
  }
  pairs.sort((a, b) => a[0] - b[0])
  const out = new Array(prev.length)
  const usedI = {}
  const usedJ = {}
  let maxRel = 0
  pairs.forEach(([d, i, j]) => {
    if (usedI[i] || usedJ[j]) return
    usedI[i] = usedJ[j] = true
    out[i] = next[j]
    maxRel = Math.max(maxRel, d / Math.max(R, C.abs(prev[i])))
  })
  return { roots: out, maxRel }
}

function angleDeg(z) {
  return (Math.atan2(z.im, z.re) * 180) / Math.PI
}

function wrap360(a) {
  let r = a % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return r
}

function rootLocus(G, opts) {
  opts = opts || {}
  const ps = ctl.poles(G)
  const zs = ctl.zeros(G)
  const n = ps.length
  const m = zs.length
  const kref = P.maxAbs(G.den) / P.maxAbs(G.num)
  const kmax = opts.kmax || kref * 1e4
  const kmin = opts.kmax ? opts.kmax * 1e-6 : kref * 1e-4

  // 渐近线
  let centroid = null
  const asymAngles = []
  if (n > m) {
    let s = 0
    ps.forEach(p => {
      s += p.re
    })
    zs.forEach(z => {
      s -= z.re
    })
    centroid = s / (n - m)
    for (let k = 0; k < n - m; k++) asymAngles.push(((2 * k + 1) * 180) / (n - m))
  }

  // 视图范围
  let R = 0
  ps.concat(zs).forEach(r => {
    R = Math.max(R, C.abs(r))
  })
  if (centroid !== null) R = Math.max(R, Math.abs(centroid))
  if (R === 0) R = 1

  // 沿 K 扫描并自适应加密
  const base = [0].concat(ctl.logspace(Math.log10(kmin), Math.log10(kmax), 360))
  const Ks = []
  const sets = []
  let prev = ps
  Ks.push(0)
  sets.push(ps)
  const degOk = rs => rs.length === n
  const advance = (k0, k1, depth) => {
    const rs = closedPoles(G, k1)
    if (!degOk(rs)) return
    const mt = match(prev, rs, R)
    if (mt.maxRel > 0.03 && depth < 6) {
      const km = k0 === 0 ? k1 / 2 : Math.sqrt(k0 * k1)
      advance(k0, km, depth + 1)
      advance(km, k1, depth + 1)
      return
    }
    Ks.push(k1)
    sets.push(mt.roots)
    prev = mt.roots
  }
  for (let i = 1; i < base.length; i++) advance(base[i - 1], base[i], 0)

  const branches = []
  for (let b = 0; b < n; b++) branches.push(sets.map(s => s[b]))

  // 分离/会合点：d/ds[D(s)/N(s)] = 0 且对应 K > 0
  const dEq = P.sub(P.mul(P.derivative(G.den), G.num), P.mul(G.den, P.derivative(G.num)))
  const breakaway = []
  if (P.degree(dEq) > 0) {
    P.roots(dEq).forEach(s => {
      if (Math.abs(s.im) > 1e-6 * Math.max(1, C.abs(s))) return
      const nv = P.evalReal(G.num, s.re)
      if (Math.abs(nv) < 1e-12) return
      const K = -P.evalReal(G.den, s.re) / nv
      const dup = breakaway.some(b => Math.abs(b.s - s.re) < 1e-5 * Math.max(1, Math.abs(s.re)))
      if (K > 0 && !dup) breakaway.push({ s: s.re, K })
    })
  }

  // 与虚轴交点：最大实部过零
  // 从 K>0 开始判断（K=0 时虚轴上的开环极点不算穿越）
  const crossings = []
  for (let i = 2; i < Ks.length; i++) {
    const a0 = maxRe(sets[i - 1])
    const a1 = maxRe(sets[i])
    if ((a0 < 0) !== (a1 < 0)) {
      let lo = Ks[i - 1]
      let hi = Ks[i]
      const flo = a0
      for (let it = 0; it < 60; it++) {
        const mid = lo === 0 ? hi / 2 : 0.5 * (lo + hi)
        const fm = maxRe(closedPoles(G, mid))
        if ((fm < 0) === (flo < 0)) lo = mid
        else hi = mid
      }
      const K = 0.5 * (lo + hi)
      const rs = closedPoles(G, K)
      let best = rs[0]
      rs.forEach(r => {
        if (r.re > best.re) best = r
      })
      crossings.push({ K, w: Math.abs(best.im), toUnstable: a1 >= 0 })
    }
  }

  // 稳定的 K 区间
  const intervals = []
  let start = sets.length > 1 && maxRe(sets[1]) < 0 ? 0 : null
  crossings.forEach(c => {
    if (c.toUnstable) {
      if (start !== null) intervals.push([start, c.K])
      start = null
    } else start = c.K
  })
  if (start !== null) intervals.push([start, Infinity])

  // 出射角 / 入射角
  const departure = []
  ps.forEach((p, i) => {
    if (Math.abs(p.im) < 1e-9) return
    let a = 180
    ps.forEach((q, j) => {
      if (j !== i) a -= angleDeg(C.sub(p, q))
    })
    zs.forEach(z => {
      a += angleDeg(C.sub(p, z))
    })
    departure.push({ at: p, angle: wrap360(a) })
  })
  const arrival = []
  zs.forEach((z, i) => {
    if (Math.abs(z.im) < 1e-9) return
    let a = 180
    zs.forEach((q, j) => {
      if (j !== i) a -= angleDeg(C.sub(z, q))
    })
    ps.forEach(p => {
      a += angleDeg(C.sub(z, p))
    })
    arrival.push({ at: z, angle: wrap360(a) })
  })

  return {
    poles: ps,
    zeros: zs,
    n,
    m,
    Ks,
    branches,
    centroid,
    asymAngles,
    breakaway,
    crossings,
    intervals,
    departure,
    arrival,
    R,
    kmin,
    kmax
  }
}

module.exports = { rootLocus, closedPoles, charPoly }
