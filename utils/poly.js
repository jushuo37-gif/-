// 多项式工具：系数按 s 的降幂排列，例如 [1, 3, 2] 表示 s^2 + 3s + 2

const C = require('./complex')

function maxAbs(p) {
  let m = 0
  for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i]))
  return m
}

// 去掉最高次的零系数
function trim(p) {
  const tol = 1e-13 * maxAbs(p)
  let i = 0
  while (i < p.length - 1 && Math.abs(p[i]) <= tol) i++
  return p.slice(i)
}

function degree(p) {
  return trim(p).length - 1
}

function isZero(p) {
  return maxAbs(p) === 0
}

function add(a, b) {
  const n = Math.max(a.length, b.length)
  const r = new Array(n).fill(0)
  for (let i = 0; i < a.length; i++) r[n - a.length + i] += a[i]
  for (let i = 0; i < b.length; i++) r[n - b.length + i] += b[i]
  return trim(r)
}

function scale(p, k) {
  return p.map(v => v * k)
}

function sub(a, b) {
  return add(a, scale(b, -1))
}

function mul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]
  }
  return trim(r)
}

function pow(p, n) {
  let r = [1]
  for (let i = 0; i < n; i++) r = mul(r, p)
  return r
}

function derivative(p) {
  const n = p.length - 1
  if (n <= 0) return [0]
  const r = []
  for (let i = 0; i < n; i++) r.push(p[i] * (n - i))
  return r
}

function evalReal(p, x) {
  let r = 0
  for (let i = 0; i < p.length; i++) r = r * x + p[i]
  return r
}

function evalComplex(p, z) {
  let re = 0
  let im = 0
  for (let i = 0; i < p.length; i++) {
    const t = re * z.re - im * z.im + p[i]
    im = re * z.im + im * z.re
    re = t
  }
  return C.c(re, im)
}

// 由根构造多项式（实系数，复根需成对给出）
function fromRoots(roots) {
  let re = [1]
  let im = [0]
  roots.forEach(r => {
    const nre = new Array(re.length + 1).fill(0)
    const nim = new Array(re.length + 1).fill(0)
    for (let i = 0; i < re.length; i++) {
      nre[i] += re[i]
      nim[i] += im[i]
      nre[i + 1] -= re[i] * r.re - im[i] * r.im
      nim[i + 1] -= re[i] * r.im + im[i] * r.re
    }
    re = nre
    im = nim
  })
  return re
}

// 求多项式全部根（Aberth–Ehrlich 迭代），返回 [{re, im}]
function roots(pIn) {
  let p = trim(pIn)
  const result = []
  if (p.length <= 1) return result
  // 零根
  while (p.length > 1 && p[p.length - 1] === 0) {
    result.push(C.c(0, 0))
    p = p.slice(0, -1)
  }
  const n = p.length - 1
  if (n === 0) return result
  const a = p.map(v => v / p[0])
  if (n === 1) {
    result.push(C.c(-a[1], 0))
    return sortRoots(result)
  }
  if (n === 2) {
    const b = a[1]
    const cc = a[2]
    const disc = b * b - 4 * cc
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      // 数值稳定的求根公式
      const q = -0.5 * (b + (b >= 0 ? sq : -sq))
      const r1 = q
      const r2 = q !== 0 ? cc / q : 0
      result.push(C.c(r1, 0), C.c(r2, 0))
    } else {
      const sq = Math.sqrt(-disc)
      result.push(C.c(-b / 2, sq / 2), C.c(-b / 2, -sq / 2))
    }
    return sortRoots(result)
  }

  // Cauchy 上界作为初始圆半径
  let bound = 0
  for (let i = 1; i <= n; i++) bound = Math.max(bound, Math.abs(a[i]))
  const radius = Math.min(1 + bound, Math.pow(Math.abs(a[n]), 1 / n) * 2 + 0.5)
  const z = []
  for (let k = 0; k < n; k++) {
    const ang = (2 * Math.PI * k) / n + 0.4
    z.push(C.c(radius * Math.cos(ang), radius * Math.sin(ang)))
  }
  const da = derivative(a)
  for (let iter = 0; iter < 800; iter++) {
    let maxStep = 0
    for (let k = 0; k < n; k++) {
      const pv = evalComplex(a, z[k])
      const dv = evalComplex(da, z[k])
      if (C.abs(pv) === 0) continue
      const w = C.div(pv, dv)
      let s = C.c(0, 0)
      for (let j = 0; j < n; j++) {
        if (j !== k) {
          const d = C.sub(z[k], z[j])
          if (C.abs(d) > 0) s = C.add(s, C.div(C.c(1, 0), d))
        }
      }
      const denom = C.sub(C.c(1, 0), C.mul(w, s))
      const step = C.abs(denom) > 1e-300 ? C.div(w, denom) : w
      if (!isFinite(step.re) || !isFinite(step.im)) continue
      z[k] = C.sub(z[k], step)
      maxStep = Math.max(maxStep, C.abs(step) / (1 + C.abs(z[k])))
    }
    if (maxStep < 1e-15) break
  }
  // 清理微小的实部/虚部，并保证共轭成对
  const scaleMag = z.reduce((m, r) => Math.max(m, C.abs(r)), 1e-300)
  z.forEach(r => {
    const tol = 1e-9 * Math.max(1, C.abs(r))
    if (Math.abs(r.im) < tol) r.im = 0
    if (Math.abs(r.re) < 1e-12 * scaleMag) r.re = 0
    result.push(r)
  })
  return sortRoots(result)
}

function sortRoots(rs) {
  return rs.sort((x, y) => (Math.abs(x.re - y.re) > 1e-12 ? y.re - x.re : y.im - x.im))
}

module.exports = {
  trim,
  degree,
  isZero,
  add,
  sub,
  scale,
  mul,
  pow,
  derivative,
  evalReal,
  evalComplex,
  fromRoots,
  roots,
  maxAbs
}
